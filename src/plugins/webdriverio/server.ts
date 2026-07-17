import { startPluginServer } from '@kernel/plugin-server.factory';
import { execute } from '@plugins/webdriverio/webdriverio';

const { shutdown } = startPluginServer(
    'WebdriverIO',
    process.env.WEBDRIVERIO_PLUGIN_PORT || '50060',
    execute,
);

async function gracefulShutdown(): Promise<void> {
    await shutdown();
    process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
