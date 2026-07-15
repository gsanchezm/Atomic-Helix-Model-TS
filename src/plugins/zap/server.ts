import { startPluginServer } from '@kernel/plugin-server.factory';
import { execute } from '@plugins/zap/zap';

const { shutdown } = startPluginServer('ZAP', process.env.ZAP_PLUGIN_PORT || '50058', execute);
async function stop(): Promise<void> { await shutdown(); process.exit(0); }
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
