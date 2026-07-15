import { ActionInvocationContext, MetadataContext } from '@plugins/shared/ActionHandler';

export interface ZapActionContext extends ActionInvocationContext, MetadataContext {}
