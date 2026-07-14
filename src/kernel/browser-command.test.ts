import assert from 'node:assert/strict';
import test from 'node:test';
import {
    BROWSER_COMMAND,
    encodeBrowserCommand,
    parseBrowserCommand,
} from '@kernel/browser-command';
import { assertActionAllowed, bindAddress } from '@kernel/grpc-security';
import { getPlaywrightActionRegistry } from '@plugins/playwright/actions/registerPlaywrightActions';
import { getAppiumActionRegistry } from '@plugins/appium/actions/registerAppiumActions';
import { maskActionTarget } from '@plugins/shared/maskActionTarget';

test('browser commands round-trip as structured JSON', () => {
    const encoded = encodeBrowserCommand(BROWSER_COMMAND.HAS_HEADING_TEXT, { text: "customer's order" });
    assert.deepEqual(parseBrowserCommand(encoded), {
        name: BROWSER_COMMAND.HAS_HEADING_TEXT,
        args: { text: "customer's order" },
    });
});

test('unknown browser commands are rejected', () => {
    assert.throws(
        () => parseBrowserCommand('{"name":"RUN_JAVASCRIPT","args":{"source":"1+1"}}'),
        /Unknown command/,
    );
});

test('browser command arguments are redacted from action logs', () => {
    const target = encodeBrowserCommand(BROWSER_COMMAND.SEED_PERSISTED_STORES, {
        token: 'secret-token',
    });
    const masked = maskActionTarget(target, 'BROWSER_COMMAND');
    assert.match(masked, /SEED_PERSISTED_STORES/);
    assert.doesNotMatch(masked, /secret-token/);
});

test('EVALUATE is rejected and absent from UI plugin registries', () => {
    assert.throws(() => assertActionAllowed('EVALUATE'), /has been removed/);
    assert.equal(getPlaywrightActionRegistry().has('EVALUATE'), false);
    assert.equal(getAppiumActionRegistry().has('EVALUATE'), false);
    assert.equal(getPlaywrightActionRegistry().has('BROWSER_COMMAND'), true);
});

test('insecure non-loopback binds fail closed', () => {
    const previous = {
        bindAddress: process.env.TOM_BIND_ADDRESS,
        tlsEnabled: process.env.TOM_TLS_ENABLED,
        ca: process.env.TOM_TLS_CA_PATH,
        cert: process.env.TOM_TLS_SERVER_CERT_PATH,
        key: process.env.TOM_TLS_SERVER_KEY_PATH,
    };

    try {
        process.env.TOM_BIND_ADDRESS = '0.0.0.0';
        delete process.env.TOM_TLS_ENABLED;
        delete process.env.TOM_TLS_CA_PATH;
        delete process.env.TOM_TLS_SERVER_CERT_PATH;
        delete process.env.TOM_TLS_SERVER_KEY_PATH;
        assert.throws(() => bindAddress(50051), /Refusing insecure non-loopback bind/);
    } finally {
        restoreEnv('TOM_BIND_ADDRESS', previous.bindAddress);
        restoreEnv('TOM_TLS_ENABLED', previous.tlsEnabled);
        restoreEnv('TOM_TLS_CA_PATH', previous.ca);
        restoreEnv('TOM_TLS_SERVER_CERT_PATH', previous.cert);
        restoreEnv('TOM_TLS_SERVER_KEY_PATH', previous.key);
    }
});

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}
