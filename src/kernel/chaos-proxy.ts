import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { logger } from '@utils/logger';
import { resolveLocator } from '@kernel/locator-resolver';
import { ensurePortFree } from '@kernel/port-guard';
import { INTENT, LEGACY_INTENT_ALIASES } from '@kernel/intents';
import { WriteLock } from '@kernel/write-lock';
import {
    assertActionAllowed,
    bindAddress,
    createClientCredentials,
    createServerCredentials,
    GRPC_CHANNEL_OPTIONS,
    tlsEnabled,
} from '@kernel/grpc-security';
import {
    inProcessPluginNames,
    isInProcessPlugin,
    routeInProcess,
    shutdownInProcessPlugins,
    validateInProcessPlugins,
} from '@kernel/in-process-plugin-router';

// --- Constants ---

const PROTO_PATH = path.resolve(__dirname, '../proto/ptom.proto');
const DEFAULT_MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 100;
const MAX_BACKOFF_JITTER_MS = 100;
const SERVER_PORT_NUMBER = 50051;
const ACTION_TYPE_SEPARATOR = '||';
const writeLock = new WriteLock();

// --- Plugin Address Configuration (Environment-driven) ---

// Keys must match the DRIVER values that client.ts puts into the platform string
// (e.g. 'playwright:0', 'appium:0'). The proxy strips ':<workerId>' before lookup.
// Plugin identity = the tool under the hood, so legacy and new tools can coexist
// (e.g. an `appium` plugin and a `mobilewright` plugin both serve mobile tests).
const PLUGIN_ADDRESSES: Readonly<Record<string, string>> = {
    'playwright':   process.env.PLAYWRIGHT_ADDRESS   || '127.0.0.1:50052',
    'appium':       process.env.APPIUM_ADDRESS       || '127.0.0.1:50053',
    'gatling':      process.env.GATLING_ADDRESS      || '127.0.0.1:50054',
    'api':          process.env.API_ADAPTER_ADDRESS  || '127.0.0.1:50055',
    'pixelmatch':   process.env.PIXELMATCH_ADDRESS   || '127.0.0.1:50056',
    'mobilewright': process.env.MOBILEWRIGHT_ADDRESS || '127.0.0.1:50057',
    'zap':          process.env.ZAP_ADDRESS          || '127.0.0.1:50058',
    'mobsf':        process.env.MOBSF_ADDRESS        || '127.0.0.1:50059',
};

// --- Types ---

interface IntentOutcome {
    status: 'PASS' | 'FAIL';
    payload?: string;
    error?: string;
    transportLatencyMs?: number;
}

interface PluginRouteResult {
    payload: string;
    transportLatencyMs: number;
}

type ControlIntentHandler = (leaseId: string) => Promise<IntentOutcome>;

interface TelemetryRecord {
    timestamp: string;
    actionId: string;
    platform: string;
    status: 'PASS' | 'FAIL';
    durationMs: number;
    error: string | null;
    piCalculusLatencyMs: number; // Monotonic proxy-to-plugin gRPC transport RTT
    proxyOverheadMs: number;     // Architectural overhead of the microkernel
}

// --- 1. Proto Loading (Pi-Calculus Channel Initialization) ---

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});
const ptomProto = (grpc.loadPackageDefinition(packageDefinition) as any).ptom;

// --- 2. Plugin Client Pool (Lazy Initialization) ---

const pluginClients: Map<string, any> = new Map();

const CONTROL_INTENT_HANDLERS: Readonly<Partial<Record<string, ControlIntentHandler>>> = {
    [INTENT.ACQUIRE_WRITE_LOCK]: async (leaseId) => {
        await writeLock.acquire(leaseId);
        return { status: 'PASS', payload: 'Shared-state write lock acquired.' };
    },
    [INTENT.RELEASE_WRITE_LOCK]: async (leaseId) => {
        writeLock.release(leaseId);
        return { status: 'PASS', payload: 'Shared-state write lock released.' };
    },
};

function getPluginClient(platform: string): any {
    // Platform may be structured as "playwright:0" — extract the driver name for routing
    const key = platform.split(':')[0].toLowerCase();
    if (pluginClients.has(key)) return pluginClients.get(key);

    const address = PLUGIN_ADDRESSES[key];
    if (!address) {
        throw new Error(`No plugin address configured for platform: "${platform}"`);
    }

    const client = new ptomProto.ActionService(
        address,
        createClientCredentials(),
        GRPC_CHANNEL_OPTIONS,
    );
    pluginClients.set(key, client);
    return client;
}

// --- 3. Route to Plugin via gRPC (Replaces In-Memory Adapter Calls) ---

function routeToPlugin(
    platform: string,
    actionId: string,
    targetSelector: string,
): Promise<PluginRouteResult> {
    if (isInProcessPlugin(platform)) {
        return routeInProcess(platform, actionId, targetSelector).then((payload) => ({
            payload,
            transportLatencyMs: 0,
        }));
    }

    const client = getPluginClient(platform);

    return new Promise((resolve, reject) => {
        const startMark = performance.now();
        client.ExecuteIntent(
            { actionId, targetSelector, platform },
            (err: Error | null, response: any) => {
                if (err) return reject(err);
                if (response.status === 'FAIL') {
                    return reject(new Error(response.errorMessage));
                }
                const roundTripMs = performance.now() - startMark;
                const serverDurationMs = Number(response.serverDurationMs) || 0;
                resolve({
                    payload: response.payload,
                    transportLatencyMs: Math.max(0, roundTripMs - serverDurationMs),
                });
            },
        );
    });
}

// --- 4. Transient Jitter Detection via Compiled RegExp ---

const TRANSIENT_SIGNATURE_REGEX = new RegExp(
    // UI-level jitter — element flakiness during a render/transition.
    'staleelementreference|elementnotinteractable|nosuchelement|timeouterror|targetclosederror|node is detached' +
    // Transport-level jitter — under long iOS/WDA operations the appium plugin's
    // event loop momentarily blocks and refuses the proxy's gRPC connection
    // (gRPC "14 UNAVAILABLE" / ECONNREFUSED). It recovers once the op completes,
    // so the same backoff-retry the suppressor applies to UI jitter is the
    // correct remedy. (Same retry policy — no change to maxRetries/backoff, so
    // the measured chaos-suppression behavior stays comparable across the batch.)
    '|econnrefused|econnreset|socket hang up|no connection established|unavailable: no connection',
    'i',
);

function isTransientJitter(error: unknown): boolean {
    const { message = '', name = '' } = error as { message?: string; name?: string };
    return TRANSIENT_SIGNATURE_REGEX.test(`${name}: ${message}`);
}

// --- 5. Delay Helper ---

const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

// --- 6. Chaos Suppressor (Lyapunov Stabilizer) ---

async function suppressChaos(
    intentFn: () => Promise<PluginRouteResult>,
    maxRetries: number = DEFAULT_MAX_RETRIES,
): Promise<IntentOutcome> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await intentFn();
            return {
                status: 'PASS',
                payload: result.payload,
                transportLatencyMs: result.transportLatencyMs,
            };
        } catch (error: unknown) {
            const retriesExhausted = attempt >= maxRetries;
            const deterministic = !isTransientJitter(error);

            if (deterministic || retriesExhausted) {
                return {
                    status: 'FAIL',
                    error: (error as Error).message ?? 'Unknown deterministic failure',
                };
            }

            const delayMs = (BASE_BACKOFF_MS * (1 << (attempt + 1)))
                + Math.floor(Math.random() * MAX_BACKOFF_JITTER_MS);
            logger.warn(
                `[Chaos Control] Perturbation intercepted: ${(error as Error).name}. ` +
                `Dampening for ${delayMs}ms (${attempt + 1}/${maxRetries}).`,
            );
            await delay(delayMs);
        }
    }

    return { status: 'FAIL', error: 'Chaos suppression threshold exceeded.' };
}

// --- 7. TYPE-Aware Locator Resolution ---

const PASSTHROUGH_ACTIONS = new Set<string>([
    INTENT.NAVIGATE, INTENT.TEARDOWN, INTENT.BROWSER_COMMAND, INTENT.HIDE_KEYBOARD,
    INTENT.ACQUIRE_WRITE_LOCK, INTENT.RELEASE_WRITE_LOCK,
    // Failure screenshot: carries no logical target — passes empty string directly.
    INTENT.SCREENSHOT,
    // Visual oracle: targets are `feature||snapshotId||{json}`, resolved
    // internally via VisualContractLoader + locator-resolver. The proxy
    // must not touch them.
    INTENT.CAPTURE_SNAPSHOT, INTENT.COMPARE_SNAPSHOT, INTENT.VALIDATE_VISUAL_CONTRACT, INTENT.UPDATE_BASELINE,
    // Axe targets carry JSON configuration and run against the active
    // Playwright page, so logical locator resolution does not apply.
    INTENT.RUN_ACCESSIBILITY_AUDIT, INTENT.VALIDATE_ACCESSIBILITY_THRESHOLDS,
    INTENT.RUN_ZAP_BASELINE_SCAN, INTENT.RUN_ZAP_API_SCAN, INTENT.PARSE_ZAP_REPORT,
    INTENT.VALIDATE_ZAP_THRESHOLDS, INTENT.RUN_MOBSF_APK_SCAN, INTENT.PARSE_MOBSF_REPORT,
    INTENT.RUN_SCHEMA_FUZZ, INTENT.RUN_TLS_CHECK,
    // API contract execution uses `feature||endpointId||{json}` for the
    // same reason and must also bypass logical-key resolution.
    INTENT.EXECUTE_CONTRACT_ENDPOINT, INTENT.VALIDATE_CONTRACT_ENDPOINT,
    // Performance simulations use simulationName||{json}.
    INTENT.RUN_SIMULATION, INTENT.RUN_CHECKOUT_LOAD, INTENT.PARSE_GATLING_STATS, INTENT.VALIDATE_THRESHOLDS,
    // Legacy aliases the proxy still recognizes for external callers.
    ...LEGACY_INTENT_ALIASES,
]);

// Actions that utilize the "logicalKey||payload" format.
// TYPE:             logicalKey||text
// WAIT_FOR_ELEMENT: logicalKey||timeoutMs
// ASSERT_TEXT:      logicalKey||expectedText
const COMPOSITE_ACTIONS = new Set<string>([
    INTENT.TYPE,
    INTENT.SELECT_OPTION,
    INTENT.WAIT_FOR_ELEMENT,
    INTENT.ASSERT_TEXT,
]);

function isMobilewrightPlatform(platform: string): boolean {
    return platform.split(':')[0].toLowerCase() === 'mobilewright';
}

function resolveSelector(actionId: string, rawSelector: string, platform: string): string {
    const normalized = actionId.toUpperCase();

    // NAVIGATE, TEARDOWN and BROWSER_COMMAND pass structured/raw values without locator resolution.
    if (PASSTHROUGH_ACTIONS.has(normalized)) {
        return rawSelector;
    }

    // Mobilewright resolves locators inside its own plugin (parseLocator +
    // Locator.root().getByTestId()/getByLabel()/...). The proxy must pass
    // through both halves of composite targets unchanged so the plugin sees
    // the logical key (treated as testId by default) plus the payload.
    if (isMobilewrightPlatform(platform)) {
        return rawSelector;
    }

    // Composite actions: resolve solely the key portion; preserve the payload succeeding the || separator.
    if (COMPOSITE_ACTIONS.has(normalized) && rawSelector.includes(ACTION_TYPE_SEPARATOR)) {
        const sepIndex = rawSelector.indexOf(ACTION_TYPE_SEPARATOR);
        const logicalKey = rawSelector.slice(0, sepIndex);
        const textPayload = rawSelector.slice(sepIndex);
        return resolveLocator(logicalKey) + textPayload;
    }

    return resolveLocator(rawSelector);
}

// --- 8. Telemetry Emission ---

function emitTelemetry(
    actionId: string,
    platform: string,
    outcome: IntentOutcome,
    durationMs: number,
    grpcLatencyMs: number,
    proxyOverheadMs: number
): void {
    const record: TelemetryRecord = {
        timestamp: new Date().toISOString(),
        actionId,
        platform,
        status: outcome.status,
        durationMs: Math.round(durationMs * 100) / 100,
        error: outcome.error ?? null,
        piCalculusLatencyMs: Math.round(grpcLatencyMs * 100) / 100,
        proxyOverheadMs: Math.round(proxyOverheadMs * 100) / 100,
    };
    // Emit to Standard Output → Piped to MinIO Object Storage
    process.stdout.write(JSON.stringify(record) + '\n');
}

// --- 9. gRPC Handler ---

async function handleExecuteIntent(call: any, callback: any): Promise<void> {
    const startMark = performance.now(); // High-resolution mark for duration calculation
    const { actionId, targetSelector, platform } = call.request;

    let outcome: IntentOutcome;
    let pluginStartMark = 0;
    let pluginDurationMs = 0;

    try {
        assertActionAllowed(actionId);
        const normalizedAction = actionId.toUpperCase();
        const controlHandler = CONTROL_INTENT_HANDLERS[normalizedAction];

        if (controlHandler) {
            outcome = await controlHandler(targetSelector);
        } else {
            // --- THE INDIRECTION BOUNDARY (PROXY PATTERN) ---
            // Intercept the logical key and resolve it to a platform/viewport-specific concrete selector.
            const concreteSelector = resolveSelector(actionId, targetSelector, platform);

            // Measure strictly the temporal cost of the driver (Playwright/Appium) execution.
            pluginStartMark = performance.now();
            outcome = await suppressChaos(() =>
                routeToPlugin(platform, actionId, concreteSelector),
            );
            pluginDurationMs = performance.now() - pluginStartMark;
        }

    } catch (error: any) {
        outcome = { status: 'FAIL', error: error.message };
        if (pluginStartMark > 0) {
            pluginDurationMs = performance.now() - pluginStartMark;
        }
    }

    const totalDurationMs = performance.now() - startMark;
    const grpcLatencyMs = outcome.transportLatencyMs ?? 0;
    
    // 2. Calculate Proxy Overhead (Total duration minus the target UI driver execution time)
    const proxyOverheadMs = totalDurationMs - pluginDurationMs;

    // 3. Emit Enriched Telemetry
    emitTelemetry(actionId, platform, outcome, totalDurationMs, grpcLatencyMs, proxyOverheadMs);

    callback(null, {
        status: outcome.status,
        payload: outcome.payload ?? '',
        errorMessage: outcome.error ?? '',
        serverDurationMs: totalDurationMs,
    });
}

// --- 10. Server Bootstrap ---

async function main(): Promise<void> {
    validateInProcessPlugins();
    const serverAddress = bindAddress(SERVER_PORT_NUMBER);
    const serverCredentials = createServerCredentials();
    await ensurePortFree(SERVER_PORT_NUMBER);

    const server = new grpc.Server(GRPC_CHANNEL_OPTIONS);

    server.addService(ptomProto.ActionService.service, {
        ExecuteIntent: handleExecuteIntent,
    });

    const port = await new Promise<number>((resolve, reject) => {
        server.bindAsync(serverAddress, serverCredentials, (err, boundPort) => {
            if (err) reject(err);
            else resolve(boundPort);
        });
    });

    const inProcess = inProcessPluginNames();
    logger.warn(
        `[p-TOM] Microkernel listening on ${bindAddress(port)} ` +
        `(${tlsEnabled() ? 'TLS' : 'insecure transport'}; ` +
        `in-process plugins: ${inProcess.length > 0 ? inProcess.join(', ') : 'none'})`,
    );

    let shuttingDown = false;
    const gracefulShutdown = async (signal: NodeJS.Signals): Promise<void> => {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info(`[p-TOM] ${signal} received; shutting down gracefully.`);

        const shutdownServer = new Promise<void>((resolve) => {
            const forceTimer = setTimeout(() => {
                logger.warn('[p-TOM] Graceful shutdown timed out; forcing server shutdown.');
                server.forceShutdown();
                resolve();
            }, 5000);
            forceTimer.unref();
            server.tryShutdown((err) => {
                clearTimeout(forceTimer);
                if (err) logger.error(`[p-TOM] Shutdown error: ${err.message}`);
                resolve();
            });
        });

        await Promise.allSettled([shutdownServer, shutdownInProcessPlugins()]);
        for (const client of pluginClients.values()) grpc.closeClient(client);
        pluginClients.clear();
        process.exit(0);
    };

    process.once('SIGINT', () => { void gracefulShutdown('SIGINT'); });
    process.once('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
}

main().catch((err) => {
    logger.error(`[p-TOM] Fatal startup sequence failure: ${err.message}`);
    process.exit(1);
});
