import { stableError } from '../utils/socket-errors.js';

export function errorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
    res.status(status).json({
        ok: false,
        error: stableError(error),
        requestId: req.get('x-request-id') || undefined
    });
}
