import type { Device, Locator } from 'mobilewright';
import {
    ActionInvocationContext,
    DriverContext,
    MetadataContext,
    PlatformContext,
} from '@plugins/shared/ActionHandler';
import type { MobilewrightPlatform } from '@plugins/mobilewright/mobilewright-lifecycle';

export interface MobilewrightActionContext
    extends ActionInvocationContext, DriverContext<Device>, PlatformContext, MetadataContext {
    platform: MobilewrightPlatform;
}

export type LocatorStrategy =
    | { kind: 'testId'; value: string }
    | { kind: 'label'; value: string; exact?: boolean }
    | { kind: 'text'; value: string; exact?: boolean }
    | { kind: 'role'; value: string; name?: string }
    | { kind: 'placeholder'; value: string; exact?: boolean }
    | { kind: 'type'; value: string };

function parseJsonLocator(target: string): LocatorStrategy | undefined {
    if (!target.startsWith('{')) return undefined;

    try {
        const parsed = JSON.parse(target) as LocatorStrategy;
        if (!parsed || typeof parsed !== 'object' || !('kind' in parsed) || !('value' in parsed)) {
            return undefined;
        }
        return parsed;
    } catch {
        return undefined;
    }
}

/** Parse a target string into a structured locator strategy.
 *
 *  Accepted forms (in priority order):
 *  - `{"kind":"testId","value":"..."}` JSON — full strategy.
 *  - `testId:value` / `label:value` / `text:value` / etc. — shorthand prefix.
 *  - `value` (anything else) — defaults to testId since OmniPizza uses
 *    React Native testIDs as the primary cross-platform handle.
 */
export function parseLocator(target: string): LocatorStrategy {
    const trimmed = target.trim();
    const jsonLocator = parseJsonLocator(trimmed);
    if (jsonLocator) return jsonLocator;

    const m = trimmed.match(/^(testId|label|text|role|placeholder|type):(.+)$/);
    if (m) {
        const [, kind, value] = m;
        return { kind: kind as LocatorStrategy['kind'], value } as LocatorStrategy;
    }

    return { kind: 'testId', value: trimmed };
}

/** Apply a parsed strategy to the device's root locator. */
export async function locate(device: Device, strategy: LocatorStrategy): Promise<Locator> {
    const { Locator } = await loadCore();
    const root = Locator.root(device.driver);
    const handlers = {
        testId: (value: Extract<LocatorStrategy, { kind: 'testId' }>) => root.getByTestId(value.value),
        label: (value: Extract<LocatorStrategy, { kind: 'label' }>) => root.getByLabel(value.value, { exact: value.exact }),
        text: (value: Extract<LocatorStrategy, { kind: 'text' }>) => root.getByText(value.value, { exact: value.exact }),
        role: (value: Extract<LocatorStrategy, { kind: 'role' }>) => root.getByRole(value.value, value.name ? { name: value.name } : undefined),
        placeholder: (value: Extract<LocatorStrategy, { kind: 'placeholder' }>) => root.getByPlaceholder(value.value, { exact: value.exact }),
        type: (value: Extract<LocatorStrategy, { kind: 'type' }>) => root.getByType(value.value),
    };
    return handlers[strategy.kind](strategy as never);
}

/**
 * Scroll a locator into view, falling back to a swipe anchored away from
 * screen-center if the vendored default attempt fails. When the target node
 * hasn't rendered yet, `Locator.scrollIntoViewIfNeeded()` blindly swipes from
 * screen-center — on some layouts that point lands on an already-rendered
 * EditText, and the drag gets consumed as a text-cursor move instead of
 * reaching the parent scroll container, so the swipe is a no-op every time.
 * Confirmed on-device: SA/ar's checkout form puts a filled "full name" field
 * exactly at vertical-center, silently blocking the scroll needed to reveal
 * the credit-card fields below it. One swipe anchored lower on the screen
 * (clear of that field) is enough to unstick it.
 */
export async function scrollIntoViewSafe(device: Device, locator: Locator): Promise<void> {
    try {
        await locator.scrollIntoViewIfNeeded();
        return;
    } catch {
        const screen = await device.screenSize();
        await device.driver.swipe('up', {
            startX: screen.width / 2,
            startY: screen.height * 0.85,
            distance: screen.height * 0.5,
        });
        await locator.scrollIntoViewIfNeeded();
    }
}

// Lazy ESM import — see mobilewright-lifecycle.ts for the same pattern.
const dynamicImport = new Function('s', 'return import(s)') as <T = unknown>(s: string) => Promise<T>;
let cachedCore: typeof import('mobilewright') | null = null;
async function loadCore(): Promise<typeof import('mobilewright')> {
    if (cachedCore) return cachedCore;
    cachedCore = await dynamicImport<typeof import('mobilewright')>('mobilewright');
    return cachedCore;
}
