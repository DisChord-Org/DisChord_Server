import { NextFunction, Request, RequestHandler, Response } from 'express';

/** Sends rejections of an async handler to the error middleware; Express 4 would leave the request hanging. */
export const asyncHandler = (handler: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler =>
    (req, res, next) => {
        Promise.resolve().then(() => handler(req, res, next)).catch(next);
    };

export const notFound: RequestHandler = (_req, res) => {
    res.status(404).json({ error: 'Not found' });
};

/** Last middleware: logs the real error and answers without leaking it. */
export const errorHandler = (err: unknown, _req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) return next(err);

    const info = (err ?? {}) as { status?: number; statusCode?: number };
    const status = Number(info.status ?? info.statusCode);
    if (status >= 400 && status < 500) {
        res.status(status).json({ error: 'Bad request' });
        return;
    }

    console.error('[DisChord Server] Error no controlado:', err);
    res.status(500).json({ error: 'Internal server error' });
};
