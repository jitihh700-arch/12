import { Router } from 'express';
import { createAuthMiddleware } from '../middlewares/auth.js';
import { gameCodeSchema, parsePayload } from '../validators/multiplayer-validator.js';
import { buildGameSnapshot } from '../services/game-engine-service.js';

export function createMultiplayerRouter({ env, multiplayerService, authVerifier }) {
    const router = Router();
    const auth = createAuthMiddleware(env, authVerifier);

    async function sendState(req, res) {
        const payload = parsePayload(gameCodeSchema, { gameCode: req.params.gameCode });
        const rows = await multiplayerService.getState(req.user, payload);
        res.json({ ok: true, data: buildGameSnapshot(rows, req.user.userId) });
    }

    router.get('/game/:gameCode', auth, sendState);
    router.get('/status/:gameCode', auth, sendState);

    return router;
}
