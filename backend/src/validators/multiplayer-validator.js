import { z } from 'zod';
import { normalizeGameCode } from '../utils/game-code.js';

const requestId = z.string().uuid().optional();
const gameCode = z.string().transform(normalizeGameCode).refine(value => /^[A-Z0-9]{6}$/.test(value), 'invalid_game_code');

export const createGameSchema = z.object({
    requestId,
    categoryId: z.string().min(1).max(80),
    maxPlayers: z.number().int().min(2).max(4).default(4)
}).strict();

export const joinGameSchema = z.object({ requestId, gameCode }).strict();
export const readySchema = z.object({ requestId, gameCode, ready: z.boolean() }).strict();
export const gameCodeSchema = z.object({ requestId, gameCode }).strict();
export const submitAnswerSchema = z.object({
    requestId,
    gameCode,
    answer: z.string().min(1).max(200)
}).strict();

export function parsePayload(schema, payload) {
    const parsed = schema.safeParse(payload || {});
    if (!parsed.success) {
        throw Object.assign(new Error('invalid_payload'), { code: 'invalid_payload' });
    }
    return parsed.data;
}
