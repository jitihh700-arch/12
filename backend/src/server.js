import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { createSocketServer } from './socket/index.js';
import { logger } from './utils/logger.js';

const app = createApp({ env });
const server = http.createServer(app);
createSocketServer(server, { env });

server.listen(env.PORT, () => {
    logger.info(`Memoriz multiplayer backend listening on ${env.PORT}`);
});
