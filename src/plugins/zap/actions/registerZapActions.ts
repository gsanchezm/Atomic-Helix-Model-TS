import { ActionRegistry } from '@plugins/shared/ActionRegistry';
import { ZapActionContext } from '@plugins/zap/actions/ZapActionContext';
import { RunZapApiScanAction, RunZapBaselineScanAction } from '@plugins/zap/actions/RunZapScan';
import { ParseZapReportAction } from '@plugins/zap/actions/ParseZapReport';
import { ValidateZapThresholdsAction } from '@plugins/zap/actions/ValidateZapThresholds';

export function getZapActionRegistry(): ActionRegistry<ZapActionContext> {
    return new ActionRegistry<ZapActionContext>({ plugin: 'zap' })
        .register(RunZapBaselineScanAction)
        .register(RunZapApiScanAction)
        .register(ParseZapReportAction)
        .register(ValidateZapThresholdsAction);
}
