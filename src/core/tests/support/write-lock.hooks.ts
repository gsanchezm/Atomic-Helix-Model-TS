import { After, Before, World } from '@cucumber/cucumber';
import { randomUUID } from 'node:crypto';
import { sendIntent } from '@kernel/client';
import { INTENT } from '@kernel/intents';
import { logger } from '@utils/logger';

const WRITE_LOCK_HEARTBEAT_MS = 60_000;

interface WriteLockWorld extends World {
    writeLockLeaseId?: string;
    writeLockHeartbeat?: NodeJS.Timeout;
}

Before({ tags: '@writes-shared-state', timeout: 30 * 60_000 }, async function (this: WriteLockWorld) {
    const leaseId = randomUUID();
    await sendIntent(INTENT.ACQUIRE_WRITE_LOCK, leaseId);
    this.writeLockLeaseId = leaseId;
    this.writeLockHeartbeat = setInterval(() => {
        void sendIntent(INTENT.ACQUIRE_WRITE_LOCK, leaseId).catch((error) => {
            logger.warn(
                { leaseId, error: (error as Error).message },
                '[WriteLock] Lease heartbeat failed; the proxy timeout remains the recovery boundary.',
            );
        });
    }, WRITE_LOCK_HEARTBEAT_MS);
    this.writeLockHeartbeat.unref();
});

After({ tags: '@writes-shared-state' }, async function (this: WriteLockWorld) {
    const leaseId = this.writeLockLeaseId;
    if (!leaseId) return;

    if (this.writeLockHeartbeat) clearInterval(this.writeLockHeartbeat);

    try {
        await sendIntent(INTENT.RELEASE_WRITE_LOCK, leaseId);
    } finally {
        this.writeLockLeaseId = undefined;
        this.writeLockHeartbeat = undefined;
    }
});
