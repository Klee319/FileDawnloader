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
        setCookie(c, COOKIE_NAME, adminSecret, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
            maxAge: COOKIE_MAX_AGE,
            path: '/',
        });
        // Redirect to remove auth from URL
        const url = new URL(c.req.url);
        url.searchParams.delete('auth');
        return c.redirect(url.pathname + url.search);
    }

    return c.text('Unauthorized', 401);
};

export const isAdmin = (c: Context): boolean => {
    const adminSecret = process.env.ADMIN_SECRET;
    const authCookie = getCookie(c, COOKIE_NAME);
    return authCookie === adminSecret;
};
