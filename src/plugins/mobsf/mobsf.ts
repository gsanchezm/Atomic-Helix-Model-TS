import { getMobSfActionRegistry } from '@plugins/mobsf/actions/registerMobSfActions';

const registry = getMobSfActionRegistry();
export function execute(actionId: string, target: string, sessionId = '0'): Promise<string> {
    return registry.execute(actionId.toUpperCase(), { actionId: actionId.toUpperCase(), target, sessionId, metadata: { plugin: 'mobsf' } });
}
