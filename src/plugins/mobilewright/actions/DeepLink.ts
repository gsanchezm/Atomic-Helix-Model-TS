import { ActionHandler } from '@plugins/shared/ActionHandler';
import { MobilewrightActionContext } from '@plugins/mobilewright/actions/MobilewrightActionContext';

export const DeepLinkAction: ActionHandler<MobilewrightActionContext> = {
    name: 'DEEP_LINK',
    async execute({ driver, target }) {
        // Identical to NAVIGATE: mobilewright's Device.openUrl already handles
        // deep links (omnipizza://...) and http(s) URLs uniformly. Molecules
        // send DEEP_LINK (mirroring the appium plugin's intent name) rather
        // than NAVIGATE for mobile entry points; both need to resolve here.
        await driver.openUrl(target);
        return `Deep linked mobilewright session to: ${target}`;
    },
};
