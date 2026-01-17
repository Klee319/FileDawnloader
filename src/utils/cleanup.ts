// File cleanup utility
// Deletes expired files from database and filesystem

import { db } from '../db';
import fs from 'fs/promises';

async function cleanup() {
    console.log('Starting cleanup...');
    console.log(`Time: ${new Date().toISOString()}`);

    try {
        // Get and delete expired files from database
        const expiredFilePaths = db.deleteExpiredFiles();

        console.log(`Found ${expiredFilePaths.length} expired files`);

        // Delete physical files
        for (const filePath of expiredFilePaths) {
            try {
                await fs.unlink(filePath);
                console.log(`Deleted: ${filePath}`);
            } catch (e) {
                console.warn(`Failed to delete file: ${filePath}`, e);
            }
        }

        console.log('Cleanup completed successfully');
    } catch (error) {
        console.error('Cleanup failed:', error);
        process.exit(1);
    }
}

// Run cleanup
cleanup();
