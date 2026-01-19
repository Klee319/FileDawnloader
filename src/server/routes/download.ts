// Download route handlers
import { Hono } from 'hono';
import { db } from '../../db';
import fs from 'fs/promises';
import path from 'path';

const download = new Hono();

// Helper: Format file size
function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Helper: Generate error page HTML
function errorPage(title: string, message: string): string {
    return `
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="robots" content="noindex, nofollow">
            <title>${title} - FileDawnloader</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }
                .container { text-align: center; padding: 2rem; }
                h1 { color: #e94560; }
                p { color: #aaa; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>${title}</h1>
                <p>${message}</p>
            </div>
        </body>
        </html>
    `;
}

// Download landing page or direct download based on max_downloads
download.get('/:code', async (c) => {
    const code = c.req.param('code');

    const fileData = db.getFileByDownloadCode(code);

    if (!fileData) {
        return c.html(errorPage(
            'ファイルが見つかりません',
            'このダウンロードリンクは無効、期限切れ、またはダウンロード回数の上限に達しました。'
        ), 404);
    }

    // Check if file exists on disk
    try {
        await fs.access(fileData.file_path);
    } catch {
        return c.html(errorPage(
            'ファイルが見つかりません',
            'このファイルはサーバーから削除されました。'
        ), 404);
    }

    const fileName = fileData.display_name || fileData.original_name;
    const isUnlimited = fileData.max_downloads === null;

    // 無制限リンク: 直接ダウンロード（カウントするが無制限なので問題なし）
    if (isUnlimited) {
        db.incrementDownloadCount(fileData.download_link_id);

        const file = Bun.file(fileData.file_path);

        return new Response(file, {
            headers: {
                'Content-Type': fileData.mime_type || 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
                'Content-Length': String(fileData.file_size),
            },
        });
    }

    // 制限ありリンク: 中間ページを表示（カウントしない）
    const fileSize = formatFileSize(fileData.file_size);

    return c.html(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta name="robots" content="noindex, nofollow">
            <title>ダウンロード - FileDawnloader</title>
            <style>
                * { box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background: #1a1a2e;
                    color: #eee;
                }
                .container {
                    text-align: center;
                    padding: 2rem;
                    max-width: 500px;
                }
                .file-icon {
                    font-size: 4rem;
                    margin-bottom: 1rem;
                }
                h1 {
                    color: #e94560;
                    font-size: 1.5rem;
                    word-break: break-all;
                    margin-bottom: 0.5rem;
                }
                .file-info {
                    color: #888;
                    font-size: 0.9rem;
                    margin-bottom: 2rem;
                }
                .download-btn {
                    display: inline-block;
                    background: #e94560;
                    color: white;
                    padding: 1rem 2rem;
                    border-radius: 8px;
                    text-decoration: none;
                    font-weight: bold;
                    font-size: 1.1rem;
                    transition: background 0.2s;
                }
                .download-btn:hover {
                    background: #d63850;
                }
                .warning {
                    color: #888;
                    font-size: 0.8rem;
                    margin-top: 2rem;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="file-icon">📁</div>
                <h1>${fileName}</h1>
                <div class="file-info">${fileSize}</div>
                <a href="${code}/file" class="download-btn">ダウンロード</a>
                <p class="warning">※ このリンクはダウンロード回数に制限があります</p>
            </div>
        </body>
        </html>
    `);
});

// Actual file download (for limited links)
download.get('/:code/file', async (c) => {
    const code = c.req.param('code');

    const fileData = db.getFileByDownloadCode(code);

    if (!fileData) {
        return c.html(errorPage(
            'ファイルが見つかりません',
            'このダウンロードリンクは無効、期限切れ、またはダウンロード回数の上限に達しました。'
        ), 404);
    }

    // Check if file exists on disk
    try {
        await fs.access(fileData.file_path);
    } catch {
        return c.html(errorPage(
            'ファイルが見つかりません',
            'このファイルはサーバーから削除されました。'
        ), 404);
    }

    // Increment download count
    db.incrementDownloadCount(fileData.download_link_id);

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
