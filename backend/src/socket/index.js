import { Server } from 'socket.io';
import { EventRateLimiter } from '../middlewares/rate-limit.js';
import { MultiplayerService } from '../services/multiplayer-service.js';
import { ReactionService } from '../services/reaction-service.js';
import { createSocketAuthMiddleware } from './auth-middleware.js';
import { registerGameHandlers } from './game-handlers.js';
import { registerReactionHandlers } from './reaction-handlers.js';
import { isAllowedOrigin } from '../app.js';

const MAX_SOCKET_PAYLOAD_BYTES = 4096;

function allowSocketRequest(env) {
    return (req, callback) => {
        const origin = req.headers.origin;
        if (!origin && env.NODE_ENV !== 'production') {
            callback(null, true);
            return;
        }
        callback(null, Boolean(origin && isAllowedOrigin(env, origin)));
    };
}

export function createSocketServer(httpServer, {
    env,
    authVerifier,
    multiplayerService = new MultiplayerService(env),
    reactionService = new ReactionService(env),
    limiter = new EventRateLimiter()
} = {}) {
    const io = new Server(httpServer, {
        cors: {
            origin: env.FRONTEND_ORIGINS || env.FRONTEND_ORIGIN,
            methods: ['GET', 'POST']
        },
        allowRequest: allowSocketRequest(env),
        maxHttpBufferSize: MAX_SOCKET_PAYLOAD_BYTES
    });

    io.use(createSocketAuthMiddleware(env, authVerifier));
    io.on('connection', socket => {
        registerGameHandlers(io, socket, { multiplayerService, limiter });
        registerReactionHandlers(io, socket, { reactionService, limiter });
    });

    return io;
}
