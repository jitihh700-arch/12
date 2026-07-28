import { verifyAccessToken } from '../config/supabase.js';
import { stableError } from '../utils/socket-errors.js';

export function createAuthMiddleware(env, authVerifier = verifyAccessToken) {
    return async function authMiddleware(req, res, next) {
        try {
            const header = req.get('authorization') || '';
            const token = header.startsWith('Bearer ') ? header.slice(7) : '';
            req.user = await authVerifier(env, token);
            next();
        } catch (error) {
            res.status(stableError(error) === 'authentication_required' ? 401 : 403).json({
                ok: false,
                error: stableError(error)
            });
        }
    };
}
