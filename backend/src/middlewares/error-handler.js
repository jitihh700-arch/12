import { stableError } from '../utils/socket-errors.js';

export function errorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);
    res.status(error.status || 500).json({ ok: false, error: stableError(error) });
}
