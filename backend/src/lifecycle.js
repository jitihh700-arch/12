import { logger } from './utils/logger.js';

export function configureHttpServer(server, {
    requestTimeout = 15_000,
    headersTimeout = 20_000,
    keepAliveTimeout = 5_000
} = {}) {
    server.requestTimeout = requestTimeout;
    server.headersTimeout = headersTimeout;
    server.keepAliveTimeout = keepAliveTimeout;
    return server;
}

export function createShutdown({ server, io, timeoutMs = 10_000, exit = code => process.exit(code) }) {
    let shuttingDown = false;

    return function shutdown(signal = 'manual') {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info('shutdown_started', { signal });

        const timer = setTimeout(() => {
            logger.error('shutdown_timeout', { signal });
            exit(1);
        }, timeoutMs);
        timer.unref?.();

        io?.close?.(() => {
            server.close(error => {
                clearTimeout(timer);
                if (error) {
                    logger.error('shutdown_error', { error: error.message });
                    exit(1);
                    return;
                }
                logger.info('shutdown_complete', { signal });
                exit(0);
            });
        });
    };
}
