// Main server entry point
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/bun';

import { authMiddleware } from './middleware/auth';
import uploadRoutes from './routes/upload';
import downloadRoutes from './routes/download';
import apiRoutes from './routes/api';
import { startScheduler } from '../utils/scheduler';

// Start cleanup scheduler
startScheduler();

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
    origin: '*',
    credentials: true,
}));

// Static files
app.use('/css/*', serveStatic({ root: './public' }));
app.use('/js/*', serveStatic({ root: './public' }));

// Download routes (public)
app.route('/d', downloadRoutes);

// API routes
app.route('/api', apiRoutes);

// Upload routes
app.route('/upload', uploadRoutes);

// Admin page (requires auth)
app.get('/', authMiddleware, async (c) => {
    const file = Bun.file('./public/index.html');
    return new Response(file, {
        headers: { 'Content-Type': 'text/html' },
    });
});

// Public upload page
app.get('/public', async (c) => {
    const code = c.req.query('code');
    const file = Bun.file('./public/public.html');
    return new Response(file, {
        headers: { 'Content-Type': 'text/html' },
    });
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

console.log(`
╔═══════════════════════════════════════════╗
║         FileDawnloader Server             ║
║───────────────────────────────────────────║
║  Port: ${PORT}                              ║
║  Admin: http://localhost:${PORT}/?auth=SECRET║
║  Public: http://localhost:${PORT}/public     ║
╚═══════════════════════════════════════════╝
`);

export default {
    port: PORT,
    fetch: app.fetch,
};
