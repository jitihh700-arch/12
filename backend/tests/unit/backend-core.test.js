import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { ALPHABET, generateGameCode, isGameCode, normalizeGameCode } from '../../src/utils/game-code.js';
import { EventRateLimiter } from '../../src/middlewares/rate-limit.js';
import { logger } from '../../src/utils/logger.js';
import { buildGameSnapshot } from '../../src/services/game-engine-service.js';
import { MultiplayerService } from '../../src/services/multiplayer-service.js';
import { createGameSchema, parsePayload } from '../../src/validators/multiplayer-validator.js';
import { configureHttpServer, createShutdown } from '../../src/lifecycle.js';

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
        expect(env.FRONTEND_ORIGINS).toEqual(['http://127.0.0.1:4173']);
        expect(env.MULTIPLAYER_REACTION_MAX_COUNT).toBe(5);
    });

    it('accepte une liste fermee d origines et refuse localhost en production', () => {
        const env = loadEnv({
            NODE_ENV: 'development',
            FRONTEND_ORIGIN: 'http://127.0.0.1:4173,https://memoriz.example',
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_PUBLISHABLE_KEY: 'publishable-placeholder',
            SUPABASE_SECRET_KEY: 'secret-placeholder'
        });
        expect(env.FRONTEND_ORIGINS).toEqual(['http://127.0.0.1:4173', 'https://memoriz.example']);
        expect(() => loadEnv({
            NODE_ENV: 'production',
            FRONTEND_ORIGIN: 'http://127.0.0.1:4173',
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_PUBLISHABLE_KEY: 'publishable-placeholder',
            SUPABASE_SECRET_KEY: 'secret-placeholder'
        })).toThrow(/missing_or_invalid_env/);
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
    it('construit un etat avec reponses globales trouvees', () => {
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
                my_answered_at: '2026-01-01T00:00:01Z',
                all_found_answers: [
                    { display: 'Walter White', displayOrder: 1, answerYear: '2008', hint: 'Chimie' }
                ]
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
        expect(snapshot.allFoundAnswers).toEqual([expect.objectContaining({ display: 'Walter White' })]);
        expect(snapshot.players[0].rank).toBe(1);
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

    it('accepte les reponses globales renvoyees comme objet JSON', () => {
        const snapshot = buildGameSnapshot([
            {
                game_code: 'ABC234',
                category_id: 'sportsMusique',
                status: 'playing',
                max_players: 2,
                current_players: 2,
                player_id: 'p1',
                user_id: 'u1',
                pseudo: 'A',
                score: 10,
                correct_answers: 1,
                is_ready: true,
                is_connected: true,
                is_host: true,
                all_found_answers: {
                    0: { display: 'Drake', displayOrder: 34, answerYear: null, hint: null }
                }
            }
        ], 'u2');

        expect(snapshot.allFoundAnswers).toEqual([expect.objectContaining({ display: 'Drake' })]);
    });
});

describe('multiplayer service', () => {
    it('libere les anciennes salles puis retente la creation', async () => {
        const calls = [];
        const service = new MultiplayerService({}, () => ({
            async rpc(name, payload) {
                calls.push({ name, payload });
                if (name === 'create_multiplayer_game' && calls.filter(call => call.name === name).length === 1) {
                    return { data: null, error: { message: 'active_game_exists' } };
                }
                if (name === 'leave_my_active_multiplayer_games') {
                    return { data: [{ result: 'released', released_count: 1 }], error: null };
                }
                return { data: [{ game_code: 'AB234C', category_id: payload.p_category_id }], error: null };
            }
        }));

        const created = await service.createGame({ accessToken: 'token' }, { categoryId: 'series', maxPlayers: 2 });

        expect(created.game_code).toBe('AB234C');
        expect(calls.map(call => call.name)).toEqual([
            'create_multiplayer_game',
            'leave_my_active_multiplayer_games',
            'create_multiplayer_game'
        ]);
    });

    it('marque les joueurs connectes prets puis retente le lancement', async () => {
        const userCalls = [];
        const adminCalls = [];
        const service = new MultiplayerService(
            {},
            () => ({
                async rpc(name, payload) {
                    userCalls.push({ name, payload });
                    if (name === 'start_multiplayer_game' && userCalls.length === 1) {
                        return { data: null, error: { message: 'players_not_ready' } };
                    }
                    return { data: [{ result: 'started', game_code: payload.p_game_code, status: 'playing' }], error: null };
                }
            }),
            () => ({
                from(table) {
                    adminCalls.push({ table });
                    if (table === 'multiplayer_games') {
                        return {
                            select() { return this; },
                            eq() { return this; },
                            async maybeSingle() {
                                return { data: { id: 'game-1' }, error: null };
                            }
                        };
                    }
                    return {
                        update(values) {
                            adminCalls.push({ table, values });
                            return this;
                        },
                        eq() { return this; },
                        is() { return this; },
                        then(resolve) {
                            resolve({ error: null });
                        }
                    };
                }
            })
        );

        const started = await service.startGame({ accessToken: 'token' }, { gameCode: 'AB234C' });

        expect(started.status).toBe('playing');
        expect(userCalls.map(call => call.name)).toEqual(['start_multiplayer_game', 'start_multiplayer_game']);
        expect(adminCalls).toContainEqual({ table: 'multiplayer_players', values: { is_ready: true } });
    });

    it('annule les points quand une reponse est deja prise par un autre joueur', async () => {
        const adminCalls = [];
        let multiplayerAnswersRead = 0;
        const service = new MultiplayerService(
            {},
            () => ({
                async rpc(name, payload) {
                    expect(name).toBe('submit_multiplayer_answer');
                    expect(payload.p_answer).toBe('Drake');
                    return {
                        data: [{
                            result: 'correct',
                            matched_answer_display: 'Drake',
                            matched_display_order: 34,
                            points_current: 10,
                            correct_answers: 1
                        }],
                        error: null
                    };
                }
            }),
            () => ({
                from(table) {
                    if (table === 'multiplayer_games') {
                        return {
                            select() { return this; },
                            eq() { return this; },
                            async maybeSingle() {
                                return { data: { id: 'game-1' }, error: null };
                            }
                        };
                    }

                    if (table === 'multiplayer_players') {
                        return {
                            select() { return this; },
                            eq() { return this; },
                            async maybeSingle() {
                                return { data: { id: 'player-b', score: 10, correct_answers: 1 }, error: null };
                            },
                            update(values) {
                                adminCalls.push({ table, values });
                                return this;
                            },
                            then(resolve) {
                                resolve({ error: null });
                            }
                        };
                    }

                    return {
                        select() { return this; },
                        eq() { return this; },
                        order() { return this; },
                        async maybeSingle() {
                            multiplayerAnswersRead += 1;
                            expect(multiplayerAnswersRead).toBe(1);
                            return {
                                data: {
                                    id: 'answer-row-b',
                                    answer_id: 'answer-drake',
                                    answered_at: '2026-08-11T22:00:02Z'
                                },
                                error: null
                            };
                        },
                        delete() {
                            adminCalls.push({ table, delete: true });
                            return this;
                        },
                        then(resolve) {
                            multiplayerAnswersRead += 1;
                            if (multiplayerAnswersRead === 2) {
                                resolve({
                                    data: [
                                        { id: 'answer-row-a', player_id: 'player-a', answered_at: '2026-08-11T22:00:01Z' },
                                        { id: 'answer-row-b', player_id: 'player-b', answered_at: '2026-08-11T22:00:02Z' }
                                    ],
                                    error: null
                                });
                                return;
                            }
                            resolve({ error: null });
                        }
                    };
                }
            })
        );

        const result = await service.submitAnswer(
            { accessToken: 'token-b', userId: 'user-b' },
            { gameCode: 'AB234C', answer: 'Drake', requestId: '00000000-0000-4000-8000-000000000002' }
        );

        expect(result.result).toBe('already_found_by_other');
        expect(result.points_current).toBe(0);
        expect(result.correct_answers).toBe(0);
        expect(adminCalls).toContainEqual({ table: 'multiplayer_answers', delete: true });
        expect(adminCalls).toContainEqual({
            table: 'multiplayer_players',
            values: { score: 0, correct_answers: 0 }
        });
    });
});

describe('logger', () => {
    it('masque les tokens et cles dans les logs', () => {
        const text = logger.sanitize('Bearer abc.def.ghi sb_secret_abc123 eyJaaa.bbb.ccc postgres://user:pass@host/db Authorization: raw-token access_token: raw');
        expect(text).not.toContain('sb_secret_abc123');
        expect(text).not.toContain('Bearer abc');
        expect(text).not.toContain('postgres://');
        expect(text).not.toContain('raw-token');
        expect(text).not.toContain('access_token: raw');
    });
});

describe('lifecycle', () => {
    it('configure des timeouts HTTP bornes', () => {
        const server = {};
        configureHttpServer(server, { requestTimeout: 1, headersTimeout: 2, keepAliveTimeout: 3 });
        expect(server.requestTimeout).toBe(1);
        expect(server.headersTimeout).toBe(2);
        expect(server.keepAliveTimeout).toBe(3);
    });

    it('ferme Socket.io puis HTTP une seule fois', async () => {
        const calls = [];
        const server = { close: callback => { calls.push('server'); callback(); } };
        const io = { close: callback => { calls.push('io'); callback(); } };
        const exits = [];
        const shutdown = createShutdown({ server, io, timeoutMs: 100, exit: code => exits.push(code) });
        shutdown('SIGTERM');
        shutdown('SIGINT');
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(calls).toEqual(['io', 'server']);
        expect(exits).toEqual([0]);
    });
});
