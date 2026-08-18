import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import type { IntentAction } from '@kernel/intents';
import { createClientCredentials, GRPC_CHANNEL_OPTIONS } from '@kernel/grpc-security';

const PROTO_PATH = path.resolve(__dirname, '../proto/ptom.proto');

const packageDef = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});
const ptomProto = (grpc.loadPackageDefinition(packageDef) as any).ptom;

// --- Types ---

export interface IntentResult {
    status: string;
    payload: string;
    errorMessage: string;
    serverDurationMs?: number;
    clientRttMs?: number;
    clientTransportLatencyMs?: number;
}

// --- Singleton Client (connects to the proxy, not directly to plugins) ---

const PROXY_ADDRESS = process.env.PROXY_ADDRESS || 'localhost:50051';

const client = new ptomProto.ActionService(
    PROXY_ADDRESS,
    createClientCredentials(),
    GRPC_CHANNEL_OPTIONS,
);

// --- Public API ---

// Drivers whose actions run inside the Playwright plugin process and read
// its in-memory session map (pixelmatch is co-located there — see
// plugins.config.ts) must resolve to the SAME composed session key that
// playwright.ts's ensureSession() registers, or getActivePage() finds
// nothing under the raw worker ID and throws "No active session".
const PLAYWRIGHT_HOSTED_DRIVERS = new Set(['playwright', 'pixelmatch']);

export function sendIntent(
    actionId: IntentAction,
    targetSelector: string,
    platform?: string,
): Promise<IntentResult> {
    const driver = platform || process.env.DRIVER || 'playwright';
    // Append worker ID so the plugin can isolate browser contexts per parallel worker
    const workerId = process.env.CUCUMBER_WORKER_ID ?? '0';
    const sessionId = PLAYWRIGHT_HOSTED_DRIVERS.has(driver.toLowerCase())
        ? playwrightSessionId(workerId)
        : workerId;
    const resolvedPlatform = `${driver}:${sessionId}`;

    return new Promise((resolve, reject) => {
        const startMark = performance.now();

        client.ExecuteIntent(
            { actionId, targetSelector, platform: resolvedPlatform },
            (err: Error | null, response: IntentResult) => {
                if (err) return reject(err);
                response.clientRttMs = performance.now() - startMark;
                response.clientTransportLatencyMs = Math.max(
                    0,
                    response.clientRttMs - (response.serverDurationMs ?? 0),
                );
                if (response.status === 'FAIL') {
                    return reject(new Error(response.errorMessage));
                }
                resolve(response);
            },
        );
    });
}

function playwrightSessionId(workerId: string): string {
    const browser = (process.env.BROWSER ?? 'chromium').trim().toLowerCase();
    const invocation = (process.env.TOM_RUN_ID ?? String(process.pid))
        .replace(/[^a-zA-Z0-9_.-]/g, '_');
    return `${browser}-${invocation}-${workerId}`;
}

export function closeClient(): void {
    grpc.closeClient(client);
}
