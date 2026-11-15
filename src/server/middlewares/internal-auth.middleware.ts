import { createHash, timingSafeEqual } from 'crypto';
import { RequestHandler } from 'express';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/**
 * Guards the internal endpoints with the shared `INTERNAL_SECRET` sent in the body.
 * Fails closed when the secret is not configured, and compares digests in constant time.
 */
export const requireInternalSecret: RequestHandler = (req, res, next) => {
    const expected = process.env.INTERNAL_SECRET;
    const secret: unknown = req.body?.secret;

    if (!expected || typeof secret !== 'string' || !timingSafeEqual(digest(secret), digest(expected))) {
        res.status(403).send('Forbidden');
        return;
    }

    next();
};
