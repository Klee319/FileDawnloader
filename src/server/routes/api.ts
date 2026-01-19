// API routes for admin operations
import { Hono } from 'hono';
import { db } from '../../db';
import { isAdmin } from '../middleware/auth';
import fs from 'fs/promises';
import path from 'path';
import { updateAllPanels } from '../../bot/index';

const api = new Hono();

// ==================== Files ====================

// Get all files (admin only)
api.get('/files', async (c) => {
    if (!isAdmin(c)) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const files = db.getAllActiveFiles();
    const baseUrl = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`) + (process.env.BASE_PATH || '');

    const filesWithLinks = files.map(file => {
        const adminLink = db.getAdminDownloadLink(file.id);
        return {
            id: file.id,
            name: file.display_name || file.original_name,
            originalName: file.original_name,
            size: file.file_size,
            mimeType: file.mime_type,
            uploadedBy: file.uploaded_by,
            createdAt: file.created_at,
            expiresAt: file.expires_at,
            downloadUrl: adminLink ? `${baseUrl}/d/${adminLink.code}` : null,
            downloadCode: adminLink?.code || null,
        };
    });

    return c.json({ files: filesWithLinks });
});

// Delete a file (admin only)
api.delete('/files/:id', async (c) => {
    if (!isAdmin(c)) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    const file = db.getFileById(id);

    if (!file) {
        return c.json({ error: 'File not found' }, 404);
    }

    // Delete physical file
    try {
        const absolutePath = path.resolve(file.file_path);
        await fs.unlink(absolutePath);
    } catch (e) {
        console.error(`Failed to delete physical file: ${file.file_path}`, e);
    }

    // Delete database record
    db.deleteFile(id);

    // Update Discord panels
    updateAllPanels().catch(console.error);

    return c.json({ success: true });
});

// ==================== Upload Codes ====================

// Generate upload code (admin only)
api.post('/codes/upload', async (c) => {
    if (!isAdmin(c)) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const maxUses = body.maxUses || 1;
    const maxFileSizeMb = body.maxFileSizeMb || 500;
    const expiresInHours = body.expiresInHours || 24;

    const code = db.createUploadCode({
        maxUses,
        maxFileSizeMb,
        expiresInHours,
    });

    const baseUrl = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`) + (process.env.BASE_PATH || '');
    const uploadUrl = `${baseUrl}/public?code=${code.code}`;

    return c.json({
        success: true,
        code: code.code,
        uploadUrl,
        maxUses: code.max_uses,
        maxFileSizeMb: code.max_file_size_mb,
        expiresAt: code.expires_at,
    });
});

// Validate upload code
api.get('/codes/upload/:code', async (c) => {
    const code = c.req.param('code');
    const codeRecord = db.validateUploadCode(code);

    if (!codeRecord) {
        return c.json({ error: 'Invalid or expired code' }, 404);
    }

    return c.json({
        valid: true,
        maxFileSizeMb: codeRecord.max_file_size_mb,
        remainingUses: codeRecord.max_uses - codeRecord.current_uses,
    });
});

// ==================== Download Links ====================

// Create limited download link (admin only)
api.post('/links/download', async (c) => {
    if (!isAdmin(c)) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const fileId = body.fileId;
    const maxDownloads = body.maxDownloads || 2;
    const expiresInHours = body.expiresInHours;

    const file = db.getFileById(fileId);
    if (!file) {
        return c.json({ error: 'File not found' }, 404);
    }

    const link = db.createDownloadLink({
        fileId,
        maxDownloads,
        expiresInHours,
    });

    const baseUrl = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`) + (process.env.BASE_PATH || '');
    const downloadUrl = `${baseUrl}/d/${link.code}`;

    return c.json({
        success: true,
        downloadUrl,
        code: link.code,
        maxDownloads: link.max_downloads,
        expiresAt: link.expires_at,
    });
});

// Get download links for a file
api.get('/links/:fileId', async (c) => {
    if (!isAdmin(c)) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const fileId = c.req.param('fileId');
    const links = db.getDownloadLinksByFileId(fileId);
    const baseUrl = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`) + (process.env.BASE_PATH || '');

    return c.json({
        links: links.map(link => ({
            id: link.id,
            code: link.code,
            downloadUrl: `${baseUrl}/d/${link.code}`,
            maxDownloads: link.max_downloads,
            currentDownloads: link.current_downloads,
            createdAt: link.created_at,
            expiresAt: link.expires_at,
        })),
    });
});

export default api;
