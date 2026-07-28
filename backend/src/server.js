import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { createSocketServer } from './socket/index.js';
import { configureHttpServer, createShutdown } from './lifecycle.js';
import { logger } from './utils/logger.js';

const app = createApp({ env });
const server = configureHttpServer(http.createServer(app));
const io = createSocketServer(server, { env });

server.listen(env.PORT, () => {
    logger.info('backend_started', {
        port: env.PORT,
        environment: env.NODE_ENV,
        allowedOrigins: env.FRONTEND_ORIGINS.length
    });
});

const shutdown = createShutdown({ server, io });
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
