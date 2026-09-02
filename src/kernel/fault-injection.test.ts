// Unit tests for the diagnosability fault-injection hook, focused on the
// TOM_INJECT_FAULT_TARGET logical-key narrowing added for Campaign A fault
// positioning (research hardening Phase 2). The module keeps a per-process
// fire latch, so each case re-requires a fresh module instance.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const MODULE = require.resolve('./fault-injection');

const ENV_KEYS = [
    'TOM_INJECT_FAULT',
    'TOM_INJECT_FAULT_ACTION',
    'TOM_INJECT_FAULT_TARGET',
    'TOM_INJECT_FAULT_MAX_FIRES',
];

function freshInjector(): (actionId: string, targetSelector?: string) => { status: 'FAIL'; error: string } | null {
    delete require.cache[MODULE];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./fault-injection').injectedFaultFor;
}

beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
});

test('no env -> normal routing', () => {
    const injectedFaultFor = freshInjector();
    assert.equal(injectedFaultFor('CLICK', 'loginButton'), null);
});

test('action-only match fires on the first matching call regardless of target', () => {
    process.env.TOM_INJECT_FAULT = 'LOCATOR_RESOLUTION_FAILURE';
    process.env.TOM_INJECT_FAULT_ACTION = 'CLICK';
    const injectedFaultFor = freshInjector();
    assert.equal(injectedFaultFor('NAVIGATE', 'homePage'), null);
    const hit = injectedFaultFor('CLICK', 'anythingAtAll');
    assert.equal(hit?.status, 'FAIL');
    // latch spent — second matching call routes normally
    assert.equal(injectedFaultFor('CLICK', 'anythingAtAll'), null);
});

test('TOM_INJECT_FAULT_TARGET narrows to the logical key', () => {
    process.env.TOM_INJECT_FAULT = 'LOCATOR_RESOLUTION_FAILURE';
    process.env.TOM_INJECT_FAULT_ACTION = 'CLICK';
    process.env.TOM_INJECT_FAULT_TARGET = 'placeOrderButton';
    const injectedFaultFor = freshInjector();
    // same action, different key — must NOT fire (and must not spend the latch)
    assert.equal(injectedFaultFor('CLICK', 'loginButton'), null);
    assert.equal(injectedFaultFor('CLICK', 'confirmAddToCartButton'), null);
    const hit = injectedFaultFor('CLICK', 'placeOrderButton');
    assert.equal(hit?.status, 'FAIL');
    assert.match(hit!.error, /Injected fault/);
    assert.equal(injectedFaultFor('CLICK', 'placeOrderButton'), null); // latch spent
});

test('composite key||payload targets match on the key segment', () => {
    process.env.TOM_INJECT_FAULT = 'UI_ACTION_FAILURE';
    process.env.TOM_INJECT_FAULT_ACTION = 'TYPE';
    process.env.TOM_INJECT_FAULT_TARGET = 'streetInput';
    const injectedFaultFor = freshInjector();
    assert.equal(injectedFaultFor('TYPE', 'zipInput||90210'), null);
    assert.equal(injectedFaultFor('TYPE', 'streetInput||123 Luxury Avenue')?.status, 'FAIL');
});

test('empty-string TOM_INJECT_FAULT_TARGET (unset GH input) behaves as no narrowing', () => {
    process.env.TOM_INJECT_FAULT = 'UNKNOWN_FAILURE';
    process.env.TOM_INJECT_FAULT_ACTION = 'CLICK';
    process.env.TOM_INJECT_FAULT_TARGET = '';
    const injectedFaultFor = freshInjector();
    assert.equal(injectedFaultFor('CLICK', 'whatever')?.status, 'FAIL');
});

test('target narrowing respects the fire budget across attempts', () => {
    process.env.TOM_INJECT_FAULT = 'LOCATOR_RESOLUTION_FAILURE';
    process.env.TOM_INJECT_FAULT_ACTION = 'CLICK';
    process.env.TOM_INJECT_FAULT_TARGET = 'loginButton';
    process.env.TOM_INJECT_FAULT_MAX_FIRES = '2';
    const injectedFaultFor = freshInjector();
    assert.equal(injectedFaultFor('CLICK', 'loginButton')?.status, 'FAIL');
    assert.equal(injectedFaultFor('CLICK', 'loginButton')?.status, 'FAIL');
    assert.equal(injectedFaultFor('CLICK', 'loginButton'), null);
});
