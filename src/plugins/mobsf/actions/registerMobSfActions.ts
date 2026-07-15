import { ActionRegistry } from '@plugins/shared/ActionRegistry';
import { MobSfActionContext } from '@plugins/mobsf/actions/MobSfActionContext';
import { RunMobSfApkScanAction } from '@plugins/mobsf/actions/RunMobSfApkScan';
import { ParseMobSfReportAction } from '@plugins/mobsf/actions/ParseMobSfReport';

export function getMobSfActionRegistry(): ActionRegistry<MobSfActionContext> {
    return new ActionRegistry<MobSfActionContext>({ plugin: 'mobsf' })
        .register(RunMobSfApkScanAction)
        .register(ParseMobSfReportAction);
}
