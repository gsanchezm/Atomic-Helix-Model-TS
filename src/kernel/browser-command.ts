export const BROWSER_COMMAND = {
    CLEAR_STORAGE: 'CLEAR_STORAGE',
    CLEAR_LOGIN_INPUTS: 'CLEAR_LOGIN_INPUTS',
    SET_LOGIN_ATTEMPT_SENTINEL: 'SET_LOGIN_ATTEMPT_SENTINEL',
    HAS_LOGIN_ATTEMPT_SENTINEL: 'HAS_LOGIN_ATTEMPT_SENTINEL',
    SEED_PERSISTED_STORES: 'SEED_PERSISTED_STORES',
    SEED_CHECKOUT_SESSION: 'SEED_CHECKOUT_SESSION',
    GET_CHECKOUT_DIAGNOSTICS: 'GET_CHECKOUT_DIAGNOSTICS',
    DISPATCH_ESCAPE: 'DISPATCH_ESCAPE',
    GET_VISIBLE_PIZZA_NAMES: 'GET_VISIBLE_PIZZA_NAMES',
    GET_FIRST_PIZZA_ID: 'GET_FIRST_PIZZA_ID',
    HAS_HEADING_TEXT: 'HAS_HEADING_TEXT',
    IS_BUILDER_CLOSED: 'IS_BUILDER_CLOSED',
    READ_CART_COUNT: 'READ_CART_COUNT',
} as const;

export type BrowserCommandName = typeof BROWSER_COMMAND[keyof typeof BROWSER_COMMAND];

export interface BrowserCommandRequest {
    name: BrowserCommandName;
    args?: Record<string, unknown>;
}

const commandNames = new Set<string>(Object.values(BROWSER_COMMAND));

export function encodeBrowserCommand(
    name: BrowserCommandName,
    args?: Record<string, unknown>,
): string {
    return JSON.stringify(args ? { name, args } : { name });
}

export function parseBrowserCommand(target: string): BrowserCommandRequest {
    let parsed: unknown;
    try {
        parsed = JSON.parse(target);
    } catch (error) {
        throw new Error(`[BROWSER_COMMAND] Target must be valid JSON: ${(error as Error).message}`);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('[BROWSER_COMMAND] Target must be a JSON object.');
    }

    const request = parsed as Record<string, unknown>;
    if (typeof request.name !== 'string' || !commandNames.has(request.name)) {
        throw new Error(`[BROWSER_COMMAND] Unknown command: ${String(request.name)}`);
    }
    if (
        request.args !== undefined
        && (!request.args || typeof request.args !== 'object' || Array.isArray(request.args))
    ) {
        throw new Error('[BROWSER_COMMAND] args must be a JSON object when provided.');
    }

    return request as unknown as BrowserCommandRequest;
}
