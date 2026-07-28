import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createRestLimiter } from './middlewares/rate-limit.js';
import { errorHandler } from './middlewares/error-handler.js';
import { createHealthRouter } from './routes/health.js';
import { createMultiplayerRouter } from './routes/multiplayer.js';
import { MultiplayerService } from './services/multiplayer-service.js';

export function createApp({ env, multiplayerService = new MultiplayerService(env), authVerifier } = {}) {
    const app = express();

    app.disable('x-powered-by');
    app.use(helmet());
    app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: false }));
    app.use(express.json({ limit: '16kb' }));
    app.use(createRestLimiter());

    app.use('/health', createHealthRouter());
    app.use('/api/multiplayer', createMultiplayerRouter({ env, multiplayerService, authVerifier }));
    app.use(errorHandler);

    return app;
}
