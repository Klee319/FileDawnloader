// Upload route handlers
import { Hono } from 'hono';
import { db } from '../../db';
import { isAdmin } from '../middleware/auth';
import path from 'path';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';
import { updateAllPanels } from '../../bot/index';

const upload = new Hono();

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '500');

// Ensure upload directory exists
async function ensureUploadDir() {
    try {
        await fs.access(UPLOAD_DIR);
    } catch {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
    }
}

// Admin upload (no code required)
upload.post('/admin', async (c) => {
    if (!isAdmin(c)) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    await ensureUploadDir();

    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const displayName = formData.get('displayName') as string | null;

    if (!file) {
        return c.json({ error: 'No file provided' }, 400);
    }

    // Admin has no file size limit

    // Generate unique filename
    const ext = path.extname(file.name);
    const uniqueName = `${nanoid()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, uniqueName);

    // Save file
    const arrayBuffer = await file.arrayBuffer();
    await Bun.write(filePath, arrayBuffer);

    // Create database entry
    const fileRecord = db.createFile({
        originalName: file.name,
        displayName: displayName || undefined,
        filePath: filePath,
        fileSize: file.size,
        mimeType: file.type || undefined,
        uploadedBy: 'admin',
    });

    // Create unlimited download link for admin
    const downloadLink = db.createDownloadLink({
        fileId: fileRecord.id,
    });

    const baseUrl = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`) + (process.env.BASE_PATH || '');
    const downloadUrl = `${baseUrl}/d/${downloadLink.code}`;

    // Update Discord panels
    updateAllPanels().catch(console.error);

    return c.json({
        success: true,
        file: {
            id: fileRecord.id,
            name: fileRecord.display_name || fileRecord.original_name,
            originalName: fileRecord.original_name,
            size: fileRecord.file_size,
            createdAt: fileRecord.created_at,
            expiresAt: fileRecord.expires_at,
        },
        downloadUrl,
        downloadCode: downloadLink.code,
    });
});

// Public upload (requires upload code)
upload.post('/public', async (c) => {
    await ensureUploadDir();

    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const displayName = formData.get('displayName') as string | null;
    const uploadCode = formData.get('code') as string | null;

    if (!file) {
        return c.json({ error: 'No file provided' }, 400);
    }

    if (!uploadCode) {
        return c.json({ error: 'Upload code required' }, 400);
    }

    // Validate upload code
    const codeRecord = db.validateUploadCode(uploadCode);
    if (!codeRecord) {
        return c.json({ error: 'Invalid or expired upload code' }, 400);
    }

    // Check file size against code's limit
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > codeRecord.max_file_size_mb) {
        return c.json({ error: `File size exceeds ${codeRecord.max_file_size_mb}MB limit` }, 400);
    }

    // Generate unique filename
    const ext = path.extname(file.name);
    const uniqueName = `${nanoid()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, uniqueName);

    // Save file
    const arrayBuffer = await file.arrayBuffer();
    await Bun.write(filePath, arrayBuffer);

    // Increment code usage
    db.incrementUploadCodeUse(codeRecord.id);

    // Create database entry
    const fileRecord = db.createFile({
        originalName: file.name,
        displayName: displayName || undefined,
        filePath: filePath,
        fileSize: file.size,
        mimeType: file.type || undefined,
        uploadedBy: 'public',
        uploadCodeId: codeRecord.id,
    });

    // Create unlimited download link
    const downloadLink = db.createDownloadLink({
        fileId: fileRecord.id,
    });

    const baseUrl = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`) + (process.env.BASE_PATH || '');
    const downloadUrl = `${baseUrl}/d/${downloadLink.code}`;

    // Update Discord panels
    updateAllPanels().catch(console.error);

    return c.json({
        success: true,
        file: {
            id: fileRecord.id,
            name: fileRecord.display_name || fileRecord.original_name,
            originalName: fileRecord.original_name,
            size: fileRecord.file_size,
            createdAt: fileRecord.created_at,
            expiresAt: fileRecord.expires_at,
        },
        downloadUrl,
        downloadCode: downloadLink.code,
    });
});

export default upload;
