import { verifyAccessToken } from '../config/supabase.js';
import { stableError } from '../utils/socket-errors.js';

export function createSocketAuthMiddleware(env, authVerifier = verifyAccessToken) {
    return async function socketAuth(socket, next) {
        try {
            const token = socket.handshake.auth?.accessToken;
            socket.user = await authVerifier(env, token);
            next();
        } catch (error) {
            next(new Error(stableError(error)));
        }
    };
}
