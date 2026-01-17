// Download route handlers
import { Hono } from 'hono';
import { db } from '../../db';
import fs from 'fs/promises';
import path from 'path';

const download = new Hono();

// Download file by code
download.get('/:code', async (c) => {
    const code = c.req.param('code');

    const fileData = db.getFileByDownloadCode(code);

    if (!fileData) {
        return c.html(`
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>ファイルが見つかりません - FileDawnloader</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }
                    .container { text-align: center; padding: 2rem; }
                    h1 { color: #e94560; }
                    p { color: #aaa; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>ファイルが見つかりません</h1>
                    <p>このダウンロードリンクは無効、期限切れ、またはダウンロード回数の上限に達しました。</p>
                </div>
            </body>
            </html>
        `, 404);
    }

    // Check if file exists on disk
    try {
        await fs.access(fileData.file_path);
    } catch {
        return c.html(`
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>ファイルが見つかりません - FileDawnloader</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }
                    .container { text-align: center; padding: 2rem; }
                    h1 { color: #e94560; }
                    p { color: #aaa; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>ファイルが見つかりません</h1>
                    <p>このファイルはサーバーから削除されました。</p>
                </div>
            </body>
            </html>
        `, 404);
    }

    // Increment download count
    db.incrementDownloadCount(fileData.download_link_id);

    // Read file and serve
    const file = Bun.file(fileData.file_path);
    const fileName = fileData.display_name || fileData.original_name;

    return new Response(file, {
        headers: {
            'Content-Type': fileData.mime_type || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
            'Content-Length': String(fileData.file_size),
        },
    });
});

// File info page (for preview)
download.get('/:code/info', async (c) => {
    const code = c.req.param('code');

    const fileData = db.getFileByDownloadCode(code);

    if (!fileData) {
        return c.json({ error: 'ファイルが見つかりません' }, 404);
    }

    return c.json({
        name: fileData.display_name || fileData.original_name,
        originalName: fileData.original_name,
        size: fileData.file_size,
        mimeType: fileData.mime_type,
        expiresAt: fileData.expires_at,
    });
});

export default download;
