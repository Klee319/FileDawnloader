// Authentication middleware for admin pages
import { Context, Next } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

const COOKIE_NAME = 'filedawnloader_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const authMiddleware = async (c: Context, next: Next) => {
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret) {
        console.error('ADMIN_SECRET is not set in environment variables');
        return c.text('Server configuration error', 500);
    }

    const authCookie = getCookie(c, COOKIE_NAME);

    if (authCookie === adminSecret) {
        await next();
        return;
    }

    // Check for auth query parameter (for initial login)
    const authParam = c.req.query('auth');
    if (authParam === adminSecret) {
        const basePath = process.env.BASE_PATH || '/';
        const isHttps = process.env.BASE_URL?.startsWith('https');

        setCookie(c, COOKIE_NAME, adminSecret, {
            httpOnly: true,
            secure: isHttps,
            sameSite: 'Lax',
            maxAge: COOKIE_MAX_AGE,
            path: basePath,
        });
        // Redirect to remove auth from URL
        const url = new URL(c.req.url);
        url.searchParams.delete('auth');
        let redirectPath = url.pathname;
        // Ensure trailing slash for root paths
        if (!redirectPath.endsWith('/') && !url.search) {
            redirectPath += '/';
        }
        return c.redirect(redirectPath + url.search);
    }

    return c.text('Unauthorized', 401);
};

export const isAdmin = (c: Context): boolean => {
    const adminSecret = process.env.ADMIN_SECRET;
    const authCookie = getCookie(c, COOKIE_NAME);
    return authCookie === adminSecret;
};
