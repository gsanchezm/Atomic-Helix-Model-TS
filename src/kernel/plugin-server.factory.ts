import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';
import { logger } from '@utils/logger';
import { ensurePortFree } from '@kernel/port-guard';
import {
    assertActionAllowed,
    bindAddress,
    createServerCredentials,
    GRPC_CHANNEL_OPTIONS,
    tlsEnabled,
} from '@kernel/grpc-security';

const PROTO_PATH = path.resolve(__dirname, '../proto/ptom.proto');

type ExecuteFn = (actionId: string, targetSelector: string, sessionId: string) => Promise<string>;

export function startPluginServer(
    pluginName: string,
    port: string,
    executeFn: ExecuteFn,
): { shutdown: () => Promise<void> } {
    const packageDef = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
    });
    const ptomProto = (grpc.loadPackageDefinition(packageDef) as any).ptom;

    async function handleExecuteIntent(call: any, callback: any): Promise<void> {
        const startMark = performance.now();
        const { actionId, targetSelector, platform } = call.request;
        // Extract sessionId from "driver:sessionId" format (e.g. "playwright:2")
        const sessionId = (platform as string)?.split(':')[1] ?? '0';

        try {
            assertActionAllowed(actionId);
            const result = await executeFn(actionId, targetSelector, sessionId);
            callback(null, {
                status: 'PASS',
                payload: result,
                errorMessage: '',
                serverDurationMs: performance.now() - startMark,
            });
        } catch (error: any) {
            callback(null, {
                status: 'FAIL',
                payload: '',
                errorMessage: error.message,
                serverDurationMs: performance.now() - startMark,
            });
        }
    }

    const server = new grpc.Server(GRPC_CHANNEL_OPTIONS);
    server.addService(ptomProto.ActionService.service, {
        ExecuteIntent: handleExecuteIntent,
    });

    // Reclaim the port from any stale copy of this plugin before binding,
    // then bind. Runs async so the factory keeps its synchronous signature.
    (async () => {
        try {
            const address = bindAddress(port);
            const credentials = createServerCredentials();
            await ensurePortFree(parseInt(port, 10));
            const boundPort = await new Promise<number>((resolve, reject) => {
                server.bindAsync(address, credentials, (err, actualPort) => {
                    if (err) reject(err);
                    else resolve(actualPort);
                });
            });
            logger.info(
                `[${pluginName}] Plugin listening on ${bindAddress(boundPort)} (${tlsEnabled() ? 'TLS' : 'insecure transport'})`,
            );
        } catch (err) {
            logger.error(`[${pluginName}] Startup failed: ${(err as Error).message}`);
            process.exit(1);
        }
    })();

    return {
        shutdown: () => new Promise<void>((resolve) => {
            const forceTimer = setTimeout(() => {
                logger.warn(`[${pluginName}] Graceful shutdown timed out; forcing server shutdown.`);
                server.forceShutdown();
                resolve();
            }, 5000);
            forceTimer.unref();
            server.tryShutdown((err) => {
                clearTimeout(forceTimer);
                if (err) logger.error(`[${pluginName}] Shutdown error: ${err}`);
                resolve();
            });
        }),
    };
}
