import rateLimit from 'express-rate-limit';

export const updateRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests'
});
