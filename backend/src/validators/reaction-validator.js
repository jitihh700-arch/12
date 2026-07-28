import { z } from 'zod';
import { normalizeGameCode } from '../utils/game-code.js';

export const REACTION_TYPES = ['like', 'heart', 'fire', 'party', 'shocked'];

export const reactionSchema = z.object({
    requestId: z.string().uuid().optional(),
    gameCode: z.string().transform(normalizeGameCode).refine(value => /^[A-Z0-9]{6}$/.test(value), 'invalid_game_code'),
    reactionType: z.enum(REACTION_TYPES)
}).strict();
