import rateLimit from 'express-rate-limit';

/** Ceiling for every route: generous for real clients, enough to stop a single address from hammering the disk or GitHub. */
export const globalRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests'
});

export const updateRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests'
});

/** Only failed attempts count, so guessing the secret is throttled without limiting legitimate notifications. */
export const internalAuthRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: 'Too many requests'
});
