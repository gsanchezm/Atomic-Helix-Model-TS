import { ActionHandler } from '@plugins/shared/ActionHandler';
import { PlaywrightActionContext } from '@plugins/playwright/actions/PlaywrightActionContext';
import {
    BROWSER_COMMAND,
    BrowserCommandName,
    BrowserCommandRequest,
    parseBrowserCommand,
} from '@kernel/browser-command';

type Page = PlaywrightActionContext['page'];
type CommandHandler = (page: Page, request: BrowserCommandRequest) => Promise<string>;

function requireArgs(request: BrowserCommandRequest): Record<string, unknown> {
    if (!request.args) throw new Error(`[BROWSER_COMMAND] ${request.name} requires args.`);
    return request.args;
}

function requireString(args: Record<string, unknown>, key: string): string {
    const value = args[key];
    if (typeof value !== 'string') {
        throw new Error(`[BROWSER_COMMAND] args.${key} must be a string.`);
    }
    return value;
}

const commandHandlers: Readonly<Record<BrowserCommandName, CommandHandler>> = {
    [BROWSER_COMMAND.CLEAR_STORAGE]: async (page) => {
        await page.evaluate(() => {
            localStorage.clear();
            sessionStorage.clear();
        });
        return '';
    },

    [BROWSER_COMMAND.CLEAR_LOGIN_INPUTS]: (page) => page.evaluate(() => {
        const inputs = [
            document.querySelector<HTMLInputElement>("[data-testid^='username-']"),
            document.querySelector<HTMLInputElement>("[data-testid^='password-']"),
        ];
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (!setter) throw new Error('HTMLInputElement value setter is unavailable.');

        for (const input of inputs) {
            if (!input) continue;
            setter.call(input, '');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return 'cleared';
    }),

    [BROWSER_COMMAND.SET_LOGIN_ATTEMPT_SENTINEL]: async (page) => {
        await page.evaluate(() => {
            (window as typeof window & { __loginAttemptSentinel?: boolean }).__loginAttemptSentinel = true;
        });
        return '';
    },

    [BROWSER_COMMAND.HAS_LOGIN_ATTEMPT_SENTINEL]: async (page) => String(await page.evaluate(() => (
        (window as typeof window & { __loginAttemptSentinel?: boolean }).__loginAttemptSentinel === true
    ))),

    [BROWSER_COMMAND.SEED_PERSISTED_STORES]: async (page, request) => {
        const args = requireArgs(request);
        const data = {
            token: requireString(args, 'token'),
            username: requireString(args, 'username'),
            market: requireString(args, 'market'),
            language: requireString(args, 'language'),
            locale: requireString(args, 'locale'),
            currency: requireString(args, 'currency'),
        };
        await page.evaluate((seed) => {
            const auth = {
                state: { token: seed.token, username: seed.username, behavior: null },
                version: 0,
            };
            const country = {
                state: {
                    countryCode: seed.market,
                    language: seed.language,
                    locale: seed.locale,
                    currency: seed.currency,
                    countryInfo: null,
                },
                version: 0,
            };
            localStorage.setItem('token', seed.token);
            localStorage.setItem('username', seed.username);
            localStorage.setItem('countryCode', seed.market);
            if (seed.market === 'CH') localStorage.setItem('chLang', seed.language);
            localStorage.setItem('omnipizza-auth', JSON.stringify(auth));
            localStorage.setItem('omnipizza-country', JSON.stringify(country));
        }, data);
        return '';
    },

    [BROWSER_COMMAND.SEED_CHECKOUT_SESSION]: async (page, request) => {
        const args = requireArgs(request);
        const data = {
            token: requireString(args, 'token'),
            username: requireString(args, 'username'),
            countryCode: requireString(args, 'countryCode'),
            countryState: requireString(args, 'countryState'),
        };
        await page.evaluate((seed) => {
            localStorage.setItem('token', seed.token);
            localStorage.setItem('access_token', seed.token);
            localStorage.setItem('accessToken', seed.token);
            localStorage.setItem('username', seed.username);
            localStorage.setItem('user', seed.username);
            localStorage.setItem('country_code', seed.countryCode);
            localStorage.setItem('countryCode', seed.countryCode);
            localStorage.setItem('omnipizza-country', seed.countryState);
            localStorage.removeItem('omnipizza-cart');
            localStorage.removeItem('omnipizza-order');
        }, data);
        return '';
    },

    [BROWSER_COMMAND.GET_CHECKOUT_DIAGNOSTICS]: (page) => page.evaluate(() => JSON.stringify({
        currentUrl: window.location.href,
        localStorageKeys: Object.keys(localStorage),
        pageContent: document.body?.innerText?.substring(0, 500) ?? '',
        dataTestIds: [...document.querySelectorAll('[data-testid]')]
            .map((element) => element.getAttribute('data-testid')),
        viewport: { width: window.innerWidth, height: window.innerHeight },
    })),

    [BROWSER_COMMAND.DISPATCH_ESCAPE]: async (page) => {
        await page.evaluate(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                which: 27,
                bubbles: true,
            }));
        });
        return '';
    },

    [BROWSER_COMMAND.GET_VISIBLE_PIZZA_NAMES]: (page) => page.evaluate(() => JSON.stringify(
        [...document.querySelectorAll("[data-testid^='pizza-name-']")]
            .map((element) => (element.textContent ?? '').trim())
            .filter(Boolean),
    )),

    [BROWSER_COMMAND.GET_FIRST_PIZZA_ID]: (page) => page.evaluate(() => {
        const element = document.querySelector("[data-testid^='add-to-cart-']");
        const testId = element?.getAttribute('data-testid') ?? '';
        return testId.replace(/^add-to-cart-/, '').replace(/-(desktop|responsive)$/, '');
    }),

    [BROWSER_COMMAND.HAS_HEADING_TEXT]: async (page, request) => {
        const text = requireString(requireArgs(request), 'text');
        return String(await page.evaluate((expected) => (
            [...document.querySelectorAll('h1, h2, h3, h4')]
                .some((heading) => (heading.textContent ?? '').trim().includes(expected))
        ), text));
    },

    [BROWSER_COMMAND.IS_BUILDER_CLOSED]: async (page) => String(await page.evaluate(() => (
        document.querySelector("[data-testid='customizer-close']") === null
    ))),

    [BROWSER_COMMAND.READ_CART_COUNT]: (page) => page.evaluate(() => (
        document.querySelector("[data-testid='nav-cart-count']")?.textContent?.trim() ?? ''
    )),
};

export const BrowserCommandAction: ActionHandler<PlaywrightActionContext> = {
    name: 'BROWSER_COMMAND',
    async execute({ page, target }) {
        const request = parseBrowserCommand(target);
        return commandHandlers[request.name](page, request);
    },
};
