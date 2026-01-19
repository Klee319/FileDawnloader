// Main server entry point
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/bun';
import path from 'path';

import { authMiddleware } from './middleware/auth';
import uploadRoutes from './routes/upload';
import downloadRoutes from './routes/download';
import apiRoutes from './routes/api';
import { startScheduler } from '../utils/scheduler';

// Resolve public directory path
const publicDir = path.resolve(import.meta.dir, '../../public');

// Base path for reverse proxy support (e.g., /node1)
const BASE_PATH = process.env.BASE_PATH || '';

// Start cleanup scheduler
startScheduler();

// Create app with optional base path
const app = BASE_PATH ? new Hono().basePath(BASE_PATH) : new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
    origin: '*',
    credentials: true,
}));

// Trailing slash redirect (remove trailing slash to normalize URLs)
app.use('*', async (c, next) => {
    const path = new URL(c.req.url).pathname;
    // Skip if root path or no trailing slash
    if (path !== '/' && path.endsWith('/')) {
        const url = new URL(c.req.url);
        url.pathname = path.slice(0, -1);
        return c.redirect(url.toString(), 301);
    }
    await next();
});

// Static files - rewrite path to strip base path for correct file lookup
app.use('/css/*', serveStatic({
    root: publicDir,
    rewriteRequestPath: (p) => p.replace(new RegExp(`^${BASE_PATH}`), ''),
}));
app.use('/js/*', serveStatic({
    root: publicDir,
    rewriteRequestPath: (p) => p.replace(new RegExp(`^${BASE_PATH}`), ''),
}));

// Download routes (public)
app.route('/d', downloadRoutes);

// API routes
app.route('/api', apiRoutes);

// Upload routes
app.route('/upload', uploadRoutes);

// Helper to inject base path into HTML
async function serveHtmlWithBasePath(filePath: string, c: any) {
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
        console.error(`Page not found: ${filePath}`);
        return c.text('Page not found', 500);
    }

    let html = await file.text();

    // Inject base tag for reverse proxy support
    if (BASE_PATH) {
        const baseTag = `<base href="${BASE_PATH}/">`;
        html = html.replace('<head>', `<head>\n    ${baseTag}`);
    }

    return c.html(html);
}

// Admin page (requires auth)
app.get('/', authMiddleware, async (c) => {
    const filePath = path.join(publicDir, 'index.html');
    return serveHtmlWithBasePath(filePath, c);
});

// Public upload page
app.get('/public', async (c) => {
    const filePath = path.join(publicDir, 'public.html');
    return serveHtmlWithBasePath(filePath, c);
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404 handler
app.notFound((c) => {
    return c.html(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>404 - FileDawnloader</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #1a1a2e; color: #eee; }
                .container { text-align: center; padding: 2rem; }
                h1 { color: #e94560; font-size: 4rem; margin: 0; }
                p { color: #aaa; }
                a { color: #0f3460; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>404</h1>
                <p>Page not found</p>
            </div>
        </body>
        </html>
    `, 404);
});

const PORT = parseInt(process.env.PORT || '3000');
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const FULL_URL = `${BASE_URL}${BASE_PATH}`;

console.log(`
╔═══════════════════════════════════════════════════════╗
║              FileDawnloader Server                    ║
║───────────────────────────────────────────────────────║
║  Port: ${PORT}                                          ║
║  Base Path: ${BASE_PATH || '(none)'}
║  Admin: ${FULL_URL}/?auth=SECRET
║  Public: ${FULL_URL}/public
╚═══════════════════════════════════════════════════════╝
`);

// Start server
const server = Bun.serve({
    port: PORT,
    fetch: app.fetch,
});

console.log(`Server running on http://localhost:${server.port}`);

export default server;
