import { Router } from 'express';

export function createHealthRouter(version = 'phase-6') {
    const router = Router();
    router.get('/', (req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            version
        });
    });
    return router;
}
