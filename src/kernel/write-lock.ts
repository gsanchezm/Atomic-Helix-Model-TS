import { logger } from '@utils/logger';

interface WriteLockHolder {
    leaseId: string;
    timer: NodeJS.Timeout;
}

interface WriteLockWaiter {
    leaseId: string;
    resolve: () => void;
}

/**
 * FIFO mutex for scenarios that mutate OmniPizza's shared `standard_user`.
 *
 * A random lease ID identifies ownership without partitioning the resource by
 * worker or browser. Ownership matters when an expired scenario eventually
 * sends a late RELEASE: that stale release must not unlock the next holder.
 */
export class WriteLock {
    private holder: WriteLockHolder | null = null;
    private readonly queue: WriteLockWaiter[] = [];

    constructor(private readonly maxHoldMs: number = 6 * 60_000) {
        if (!Number.isFinite(maxHoldMs) || maxHoldMs <= 0) {
            throw new Error('WriteLock maxHoldMs must be a positive finite number.');
        }
    }

    async acquire(leaseId: string): Promise<void> {
        this.assertLeaseId(leaseId);

        if (this.holder?.leaseId === leaseId) {
            this.renew(leaseId);
            return;
        }
        if (this.queue.some((waiter) => waiter.leaseId === leaseId)) {
            throw new Error(`[WriteLock] Lease "${leaseId}" is already queued.`);
        }

        if (!this.holder) {
            this.grant(leaseId);
            return;
        }

        await new Promise<void>((resolve) => {
            this.queue.push({ leaseId, resolve });
        });
    }

    release(leaseId: string): boolean {
        this.assertLeaseId(leaseId);

        if (!this.holder || this.holder.leaseId !== leaseId) {
            logger.warn(
                { leaseId, holder: this.holder?.leaseId ?? null },
                '[WriteLock] Ignoring release from a lease that does not own the lock.',
            );
            return false;
        }

        clearTimeout(this.holder.timer);
        this.holder = null;
        this.grantNext();
        return true;
    }

    private grant(leaseId: string, resolve?: () => void): void {
        this.holder = { leaseId, timer: this.createHoldTimer(leaseId) };
        resolve?.();
    }

    private renew(leaseId: string): void {
        if (this.holder?.leaseId !== leaseId) return;
        clearTimeout(this.holder.timer);
        this.holder.timer = this.createHoldTimer(leaseId);
    }

    private createHoldTimer(leaseId: string): NodeJS.Timeout {
        const timer = setTimeout(() => {
            if (this.holder?.leaseId !== leaseId) return;
            logger.warn(
                { leaseId, maxHoldMs: this.maxHoldMs },
                '[WriteLock] Lease heartbeat timeout exceeded; releasing the stale lease.',
            );
            this.holder = null;
            this.grantNext();
        }, this.maxHoldMs);
        timer.unref();
        return timer;
    }

    private grantNext(): void {
        const next = this.queue.shift();
        if (next) this.grant(next.leaseId, next.resolve);
    }

    private assertLeaseId(leaseId: string): void {
        if (!leaseId.trim()) throw new Error('[WriteLock] A non-empty lease ID is required.');
    }
}
