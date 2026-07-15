import { getZapActionRegistry } from '@plugins/zap/actions/registerZapActions';

const registry = getZapActionRegistry();
export function execute(actionId: string, target: string, sessionId = '0'): Promise<string> {
    return registry.execute(actionId.toUpperCase(), { actionId: actionId.toUpperCase(), target, sessionId, metadata: { plugin: 'zap' } });
}
