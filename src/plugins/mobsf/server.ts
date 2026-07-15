import { startPluginServer } from '@kernel/plugin-server.factory';
import { execute } from '@plugins/mobsf/mobsf';

const { shutdown } = startPluginServer('MobSF', process.env.MOBSF_PLUGIN_PORT || '50059', execute);
async function stop(): Promise<void> { await shutdown(); process.exit(0); }
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
