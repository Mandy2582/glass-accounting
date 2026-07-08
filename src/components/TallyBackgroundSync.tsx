'use client';

import { useEffect, useRef } from 'react';
import { db } from '@/lib/storage';
import { tallyApi } from '@/lib/tally';

// After this many consecutive failures (roughly 3 sync intervals), stop
// retrying and disable auto-sync instead of hammering an unreachable Tally
// server forever. Most common cause: the app is now cloud-hosted, so it can
// no longer reach a Tally instance on the shop's local network at all.
const MAX_CONSECUTIVE_FAILURES = 3;

export default function TallyBackgroundSync() {
    const isSyncingRef = useRef(false);

    useEffect(() => {
        // Run initial check after a brief delay so page loading is not blocked
        const initialTimeout = setTimeout(() => {
            checkAndRunSync();
        }, 10000); // 10 seconds after load

        // Run check every 5 minutes
        const intervalId = setInterval(() => {
            checkAndRunSync();
        }, 5 * 60 * 1000); // 5 minutes

        return () => {
            clearTimeout(initialTimeout);
            clearInterval(intervalId);
        };
    }, []);

    const checkAndRunSync = async () => {
        if (isSyncingRef.current) return;

        let config: Awaited<ReturnType<typeof db.businessConfig.get>> | undefined;

        try {
            config = await db.businessConfig.get();
            if (!config.tallyAutoSyncEnabled) return;

            const ip = config.tallyServerIp;
            const port = config.tallyServerPort;
            const companyName = config.tallyCompanyName;
            const intervalMinutes = config.tallySyncInterval || 60;
            const lastSyncStr = config.tallyLastSyncTime;

            if (!ip || !port || !companyName) {
                console.warn('Tally Background Sync: Configuration missing.');
                return;
            }

            let shouldSync = false;

            if (!lastSyncStr) {
                // Never synced before
                shouldSync = true;
            } else {
                const lastSyncDate = new Date(lastSyncStr);
                const diffMs = Date.now() - lastSyncDate.getTime();
                const diffMinutes = diffMs / (60 * 1000);

                if (diffMinutes >= intervalMinutes) {
                    shouldSync = true;
                }
            }

            if (shouldSync) {
                console.log(`[Tally Background Sync] Starting autonomous sync at ${new Date().toLocaleTimeString()}...`);
                isSyncingRef.current = true;

                const result = await tallyApi.syncFromTally(ip, port, companyName);

                if (result.hadErrors) {
                    const failures = (config.tallyConsecutiveFailures || 0) + 1;
                    const disableSync = failures >= MAX_CONSECUTIVE_FAILURES;

                    if (disableSync) {
                        console.warn(
                            `[Tally Background Sync] Disabling auto-sync after ${failures} consecutive failed attempts ` +
                            `(Tally at ${ip}:${port} appears unreachable from this deployment). ` +
                            `Re-enable it in Settings once Tally is reachable again.`
                        );
                    } else {
                        console.warn(`[Tally Background Sync] Attempt ${failures}/${MAX_CONSECUTIVE_FAILURES} had errors, see logs.`);
                    }

                    await db.businessConfig.update({
                        ...config,
                        tallyLastSyncTime: new Date().toISOString(),
                        tallySyncLogs: result.logs,
                        tallyConsecutiveFailures: failures,
                        ...(disableSync ? { tallyAutoSyncEnabled: false } : {}),
                    });
                } else {
                    await db.businessConfig.update({
                        ...config,
                        tallyLastSyncTime: new Date().toISOString(),
                        tallySyncLogs: result.logs,
                        tallyConsecutiveFailures: 0,
                    });
                    console.log(`[Tally Background Sync] Completed! Synced ${result.itemsSynced} stock items and ${result.partiesSynced} ledgers.`);
                }
            }
        } catch (error) {
            // Only reachable for genuine unexpected failures (e.g. config fetch
            // itself failing) since syncFromTally catches its own errors.
            console.warn('[Tally Background Sync] Unexpected error:', error);
        } finally {
            isSyncingRef.current = false;
        }
    };

    return null; // This component has no visual representation
}
