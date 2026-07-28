import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { ALPHABET, generateGameCode, isGameCode, normalizeGameCode } from '../../src/utils/game-code.js';
import { EventRateLimiter } from '../../src/middlewares/rate-limit.js';
import { logger } from '../../src/utils/logger.js';
import { buildGameSnapshot } from '../../src/services/game-engine-service.js';
import { createGameSchema, parsePayload } from '../../src/validators/multiplayer-validator.js';

describe('env validation', () => {
    it('refuse les variables essentielles absentes', () => {
        expect(() => loadEnv({})).toThrow(/missing_or_invalid_env/);
    });

    it('charge une configuration backend sans exposer de secret', () => {
        const env = loadEnv({
            FRONTEND_ORIGIN: 'http://127.0.0.1:4173',
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_PUBLISHABLE_KEY: 'publishable-placeholder',
            SUPABASE_SECRET_KEY: 'secret-placeholder'
        });
        expect(env.PORT).toBe(3001);
        expect(env.MULTIPLAYER_REACTION_MAX_COUNT).toBe(5);
    });
});

describe('game code', () => {
    it('genere six caracteres dans alphabet non ambigu', () => {
        const code = generateGameCode();
        expect(code).toHaveLength(6);
        expect([...code].every(char => ALPHABET.includes(char))).toBe(true);
        expect(code).not.toMatch(/[O0I1]/);
    });

    it('normalise et valide les codes recus', () => {
        expect(normalizeGameCode(' ab12cd ')).toBe('AB12CD');
        expect(isGameCode('AB12CD')).toBe(true);
        expect(isGameCode('court')).toBe(false);
    });
});

describe('validators', () => {
    it('refuse les champs clients interdits', () => {
        expect(() => parsePayload(createGameSchema, {
            categoryId: 'series',
            maxPlayers: 4,
            score: 999
        })).toThrow(/invalid_payload/);
    });

    it('refuse les payloads non objets', () => {
        expect(() => parsePayload(createGameSchema, null)).toThrow(/invalid_payload/);
        expect(() => parsePayload(createGameSchema, 'series')).toThrow(/invalid_payload/);
    });
});

describe('rate limiter', () => {
    it('limite par cle et fenetre', () => {
        let now = 0;
        const limiter = new EventRateLimiter(() => now);
        expect(limiter.check('u:reaction', { max: 2, windowMs: 1000 })).toBe(true);
        expect(limiter.check('u:reaction', { max: 2, windowMs: 1000 })).toBe(true);
        expect(limiter.check('u:reaction', { max: 2, windowMs: 1000 })).toBe(false);
        now = 1001;
        expect(limiter.check('u:reaction', { max: 2, windowMs: 1000 })).toBe(true);
    });
});

describe('snapshot', () => {
    it('construit un etat sans reponses des autres joueurs', () => {
        const snapshot = buildGameSnapshot([
            {
                game_code: 'ABC234',
                category_id: 'series',
                status: 'playing',
                max_players: 4,
                current_players: 2,
                host_id: 'u1',
                duration_seconds: 600,
                started_at: '2026-01-01T00:00:00Z',
                expires_at: '2026-01-01T00:10:00Z',
                player_id: 'p1',
                user_id: 'u1',
                pseudo: 'A',
                score: 10,
                correct_answers: 1,
                is_ready: true,
                is_connected: true,
                is_host: true,
                rank: 1,
                my_found_answer_display: 'Walter White',
                my_found_display_order: 1,
                my_answered_at: '2026-01-01T00:00:01Z'
            },
            {
                game_code: 'ABC234',
                category_id: 'series',
                status: 'playing',
                max_players: 4,
                current_players: 2,
                host_id: 'u1',
                player_id: 'p2',
                user_id: 'u2',
                pseudo: '<script>',
                score: 0,
                correct_answers: 0,
                is_ready: true,
                is_connected: true,
                is_host: false,
                rank: 2,
                my_found_answer_display: null,
                my_found_display_order: null
            }
        ], 'u1');

        expect(snapshot.players).toHaveLength(2);
        expect(snapshot.myFoundAnswers).toEqual([expect.objectContaining({ display: 'Walter White' })]);
        expect(snapshot.players[1].pseudo).toBe('<script>');
    });

    it('ne renvoie jamais les identifiants de reponses canoniques', () => {
        const snapshot = buildGameSnapshot([
            {
                game_code: 'ABC234',
                category_id: 'series',
                status: 'playing',
                max_players: 2,
                current_players: 1,
                host_id: 'u1',
                player_id: 'p1',
                user_id: 'u1',
                pseudo: 'Alpha',
                score: 10,
                correct_answers: 1,
                is_ready: true,
                is_connected: true,
                is_host: true,
                rank: 1,
                answer_id: '90000000-0000-4000-8000-000000000001',
                answer_normalized: 'walter white',
                my_found_answer_display: 'Walter White',
                my_found_display_order: 1
            }
        ], 'u1');

        const serialized = JSON.stringify(snapshot);
        expect(serialized).not.toContain('answer_id');
        expect(serialized).not.toContain('answer_normalized');
        expect(serialized).not.toContain('90000000-0000-4000-8000-000000000001');
    });
});

describe('logger', () => {
    it('masque les tokens et cles dans les logs', () => {
        const text = logger.sanitize('Bearer abc.def.ghi sb_secret_abc123 eyJaaa.bbb.ccc');
        expect(text).not.toContain('sb_secret_abc123');
        expect(text).not.toContain('Bearer abc');
    });
});
