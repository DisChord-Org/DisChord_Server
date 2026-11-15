import express from 'express';
import apiRouter from './routes/api';
import { errorHandler, notFound } from './middlewares/error.middleware';
import { globalRateLimit } from './middlewares/ratelimit.middleware';

/**
 * How many proxies sit in front of the server (`TRUST_PROXY`, default 1). It decides which address
 * the rate limiters see, so it must match the real deployment: `false` when exposed directly.
 */
export function parseTrustProxy(value: string | undefined): number | boolean | string {
    if (value === undefined || value === '') return 1;
    if (value === 'false') return false;
    if (value === 'true') return true;
    if (/^\d+$/.test(value)) return Number(value);

    return value;
}

const app = express();

app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
app.disable('x-powered-by');
app.use(globalRateLimit);
app.use(express.json({ limit: '10kb' }));
app.use('/', apiRouter);
app.use(notFound);
app.use(errorHandler);

export default app;
