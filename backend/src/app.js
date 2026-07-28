import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createRestLimiter } from './middlewares/rate-limit.js';
import { errorHandler } from './middlewares/error-handler.js';
import { createHealthRouter } from './routes/health.js';
import { createMultiplayerRouter } from './routes/multiplayer.js';
import { MultiplayerService } from './services/multiplayer-service.js';

export function isAllowedOrigin(env, origin) {
    const origins = env.FRONTEND_ORIGINS || env.FRONTEND_ORIGIN || [];
    return Array.isArray(origins) && origins.includes(origin);
}

export function createCorsOptions(env) {
    return {
        origin(origin, callback) {
            if (!origin && env.NODE_ENV !== 'production') {
                callback(null, true);
                return;
            }
            if (origin && isAllowedOrigin(env, origin)) {
                callback(null, true);
                return;
            }
            callback(Object.assign(new Error('cors_origin_denied'), { status: 403, code: 'cors_origin_denied' }));
        },
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Authorization', 'Content-Type'],
        credentials: false,
        maxAge: 600
    };
}

export function createApp({ env, multiplayerService = new MultiplayerService(env), authVerifier } = {}) {
    const app = express();

    app.disable('x-powered-by');
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    }));
    app.use(cors(createCorsOptions(env)));
    app.use(express.json({ limit: '16kb' }));
    app.use(createRestLimiter());

    app.use('/health', createHealthRouter());
    app.use('/api/multiplayer', createMultiplayerRouter({ env, multiplayerService, authVerifier }));
    app.use(errorHandler);

    return app;
}
