import { sendIntent, IntentResult } from '@kernel/client';
import {
    BROWSER_COMMAND,
    BrowserCommandName,
    encodeBrowserCommand,
} from '@kernel/browser-command';
import { INTENT } from '@kernel/intents';

export function sendBrowserCommand(
    name: BrowserCommandName,
    args?: Record<string, unknown>,
): Promise<IntentResult> {
    return sendIntent(INTENT.BROWSER_COMMAND, encodeBrowserCommand(name, args));
}

export function seedWebPersistedStores(args: {
    market: string;
    language: string;
    token: string;
    username?: string;
}): Promise<IntentResult> {
    return sendBrowserCommand(BROWSER_COMMAND.SEED_PERSISTED_STORES, {
        token: args.token,
        username: args.username ?? 'standard_user',
        market: args.market,
        language: args.language,
        locale: localeFor(args.market, args.language),
        currency: currencyFor(args.market),
    });
}

function localeFor(market: string, language: string): string {
    const locales: Readonly<Record<string, Readonly<Record<string, string>>>> = {
        CH: { fr: 'fr-CH', default: 'de-CH' },
        US: { default: 'en-US' },
        MX: { default: 'es-MX' },
        JP: { default: 'ja-JP' },
        SA: { default: 'ar-SA' },
    };
    return locales[market]?.[language] ?? locales[market]?.default ?? 'en-US';
}

function currencyFor(market: string): string {
    const currencies: Readonly<Record<string, string>> = {
        US: 'USD',
        MX: 'MXN',
        CH: 'CHF',
        JP: 'JPY',
        SA: 'SAR',
    };
    return currencies[market] ?? 'USD';
}
