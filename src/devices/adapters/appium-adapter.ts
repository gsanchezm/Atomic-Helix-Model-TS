// Appium adapter — translates a driver-agnostic DevicePassport into a
// W3C-style capabilities object that Appium / WebdriverIO consume.
//
// Convention: passport.appium fields are merged in WITHOUT the `appium:`
// prefix; this adapter adds the prefix while building the final cap set.
// Top-level fields become `platformName`/`appium:platformVersion`/etc.

import { resolve, isAbsolute } from 'path';
import { existsSync } from 'fs';
import { logger } from '@utils/logger';
import {
    AppiumDeviceConfig,
    DeviceAppBinding,
    DeviceAppInfo,
    DeviceIdentity,
    DevicePlatform,
    DevicePlatformInfo,
} from '@devices/device-passport.types';

const REPO_ROOT = resolve(__dirname, '../../..');

export interface AppiumCapsOptions {
    /** Cucumber worker id. Used to derive per-worker `wdaLocalPort` for parallel iOS sessions. */
    sessionId?: string;
    /** Override UDID at runtime (e.g. when DEVICE_PROFILES selects a profile but the actual device is picked from env). */
    udidOverride?: string;
    /** Override binary path at runtime (e.g. ANDROID_APP_PATH / IOS_APP_PATH from env). */
    binaryPathOverride?: string;
}

export interface AppiumCapabilitiesPassport
    extends DeviceIdentity, DevicePlatformInfo, DeviceAppBinding, AppiumDeviceConfig {
}

const APPIUM_PREFIX = 'appium:';
const PLATFORM_NAMES: Readonly<Record<DevicePlatform, string>> = {
    android: 'Android',
    ios: 'iOS',
};

type CapabilityWriter = (caps: Record<string, unknown>, app: DeviceAppInfo | undefined) => void;

const APP_CAPABILITY_WRITERS: Readonly<Record<DevicePlatform, CapabilityWriter>> = {
    android(caps, app) {
        if (!app) return;
        if (app.package) caps['appium:appPackage'] = app.package;
        if (app.waitActivity) caps['appium:appWaitActivity'] = app.waitActivity;
    },
    ios(caps, app) {
        if (app?.bundleId) caps['appium:bundleId'] = app.bundleId;
    },
};

function withPrefix(key: string): string {
    return key.startsWith(APPIUM_PREFIX) || key === 'platformName' ? key : `${APPIUM_PREFIX}${key}`;
}

function resolveBinaryPath(rel: string | undefined, override: string | undefined): string | undefined {
    const value = override ?? rel;
    if (!value) return undefined;
    const abs = isAbsolute(value) ? value : resolve(REPO_ROOT, value);
    if (!existsSync(abs)) {
        logger.warn({ path: abs }, '[appium-adapter] App binary not found — Appium may fail to install.');
    }
    return abs;
}

/** Build a W3C capabilities object from a passport. Pure — no side effects. */
export function toAppiumCapabilities(
    passport: AppiumCapabilitiesPassport,
    options: AppiumCapsOptions = {},
): Record<string, unknown> {
    const caps: Record<string, unknown> = {
        platformName: PLATFORM_NAMES[passport.platform],
    };

    if (passport.osVersion) caps['appium:platformVersion'] = passport.osVersion;
    if (passport.model) caps['appium:deviceName'] = passport.model;

    const udid = options.udidOverride ?? passport.udid ?? undefined;
    if (udid) caps['appium:udid'] = udid;

    // App binding — each platform owns its capability mapping.
    APP_CAPABILITY_WRITERS[passport.platform](caps, passport.app);
    const binary = resolveBinaryPath(passport.app?.binaryPath, options.binaryPathOverride);
    if (binary) caps['appium:app'] = binary;

    // Free-form Appium overrides — added with prefix.
    for (const [key, value] of Object.entries(passport.appium ?? {})) {
        caps[withPrefix(key)] = value;
    }

    // Per-worker WDA port for iOS to avoid collisions in parallel runs.
    const sessionId = options.sessionId ?? '0';
    if (passport.platform === 'ios' && sessionId !== '0') {
        const base = parseInt(String(caps['appium:wdaLocalPort'] ?? '8101'), 10);
        caps['appium:wdaLocalPort'] = base + parseInt(sessionId, 10);
    }

    return caps;
}

export const AppiumAdapter = { toAppiumCapabilities };
