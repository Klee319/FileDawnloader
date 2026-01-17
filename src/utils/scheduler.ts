// Scheduler for periodic cleanup
// Run this as part of the server to automatically clean up expired files

import { db } from '../db';
import fs from 'fs/promises';

const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

export async function runCleanup(): Promise<number> {
    console.log(`[${new Date().toISOString()}] Running cleanup...`);

    try {
        const expiredFilePaths = db.deleteExpiredFiles();

        for (const filePath of expiredFilePaths) {
            try {
                await fs.unlink(filePath);
                console.log(`[Cleanup] Deleted: ${filePath}`);
            } catch (e) {
                // File might already be deleted
            }
        }

        console.log(`[Cleanup] Removed ${expiredFilePaths.length} expired files`);
        return expiredFilePaths.length;
    } catch (error) {
        console.error('[Cleanup] Error:', error);
        return 0;
    }
}

export function startScheduler() {
    console.log('Starting cleanup scheduler...');

    // Run immediately on start
    runCleanup();

    // Then run periodically
    setInterval(() => {
        runCleanup();
    }, CLEANUP_INTERVAL);
}
