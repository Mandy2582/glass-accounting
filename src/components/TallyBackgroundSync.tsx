'use client';

import { useEffect, useRef } from 'react';
import { db } from '@/lib/storage';
import { tallyApi } from '@/lib/tally';

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

        try {
            const config = await db.businessConfig.get();
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
                
                // Save updated sync details to DB
                const updatedConfig = {
                    ...config,
                    tallyLastSyncTime: new Date().toISOString(),
                    tallySyncLogs: result.logs
                };
                
                await db.businessConfig.update(updatedConfig);
                console.log(`[Tally Background Sync] Completed! Synced ${result.itemsSynced} stock items and ${result.partiesSynced} ledgers.`);
            }
        } catch (error) {
            console.error('[Tally Background Sync] Error during check/sync:', error);
        } finally {
            isSyncingRef.current = false;
        }
    };

    return null; // This component has no visual representation
}
