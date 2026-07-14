import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WriteLock } from '@kernel/write-lock';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

test('write lock grants queued leases in FIFO order', async () => {
    const lock = new WriteLock(1_000);
    const granted: string[] = [];

    await lock.acquire('a');
    const b = lock.acquire('b').then(() => granted.push('b'));
    const c = lock.acquire('c').then(() => granted.push('c'));

    await delay(5);
    assert.deepEqual(granted, []);

    assert.equal(lock.release('a'), true);
    await b;
    assert.deepEqual(granted, ['b']);

    assert.equal(lock.release('b'), true);
    await c;
    assert.deepEqual(granted, ['b', 'c']);
    assert.equal(lock.release('c'), true);
});

test('late release from an expired lease cannot unlock the next holder', async () => {
    const lock = new WriteLock(20);

    await lock.acquire('expired');
    await lock.acquire('next');

    const third = lock.acquire('third');
    let thirdGranted = false;
    void third.then(() => { thirdGranted = true; });

    assert.equal(lock.release('expired'), false);
    await delay(5);
    assert.equal(thirdGranted, false);

    assert.equal(lock.release('next'), true);
    await third;
    assert.equal(thirdGranted, true);
    assert.equal(lock.release('third'), true);
});

test('reacquiring the current lease renews its inactivity timeout', async () => {
    const lock = new WriteLock(80);
    await lock.acquire('owner');

    await delay(50);
    await lock.acquire('owner');

    let nextGranted = false;
    const next = lock.acquire('next').then(() => { nextGranted = true; });
    await delay(50);
    assert.equal(nextGranted, false);

    assert.equal(lock.release('owner'), true);
    await next;
    assert.equal(lock.release('next'), true);
});
