import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as Client } from 'socket.io-client';
import { createApp } from '../../src/app.js';
import { createSocketServer } from '../../src/socket/index.js';

const env = {
    NODE_ENV: 'development',
    FRONTEND_ORIGIN: 'http://127.0.0.1:4173',
    FRONTEND_ORIGINS: ['http://127.0.0.1:4173'],
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-placeholder',
    SUPABASE_SECRET_KEY: 'secret-placeholder'
};

function waitEvent(socket, event) {
    return new Promise(resolve => socket.once(event, resolve));
}

function emitAck(socket, event, payload) {
    return new Promise(resolve => socket.emit(event, payload, resolve));
}

function fakeAuth() {
    return async (unusedEnv, token) => {
        if (token === 'a') return { userId: 'u1', pseudo: 'Alpha', accessToken: token };
        if (token === 'b') return { userId: 'u2', pseudo: 'Beta', accessToken: token };
        throw Object.assign(new Error('invalid_token'), { code: 'invalid_token' });
    };
}

function fakeServices() {
    const players = new Map();
    const claimedAnswers = new Map();
    const calls = [];
    let status = 'waiting';
    return {
        calls,
        expireGame(nextStatus = 'expired') {
            status = nextStatus;
        },
        multiplayerService: {
            async createGame(context) {
                calls.push({ method: 'createGame', userId: context.userId });
                players.set(context.userId, { pseudo: context.pseudo, score: 0, ready: true, host: true, connected: true });
                return { game_code: 'ABC234', category_id: 'series', status, max_players: 4 };
            },
            async joinGame(context) {
                calls.push({ method: 'joinGame', userId: context.userId });
                players.set(context.userId, { pseudo: context.pseudo, score: 0, ready: false, host: false, connected: true });
                return { result: 'joined', game_code: 'ABC234' };
            },
            async setReady(context, input) {
                calls.push({ method: 'setReady', userId: context.userId });
                players.get(context.userId).ready = input.ready;
                return { result: 'ready_updated' };
            },
            async startGame() {
                calls.push({ method: 'startGame' });
                status = 'playing';
                return { result: 'started', game_code: 'ABC234', category_id: 'series' };
            },
            async submitAnswer(context, input) {
                calls.push({ method: 'submitAnswer', userId: context.userId });
                const player = players.get(context.userId);
                const normalized = String(input.answer || '').trim().toLowerCase();
                const currentOwner = claimedAnswers.get(normalized);
                if (currentOwner === context.userId) {
                    return { result: 'duplicate', points_current: player.score, correct_answers: player.score / 10 };
                }
                if (currentOwner) {
                    return {
                        result: 'already_found_by_other',
                        points_current: player.score,
                        correct_answers: player.score / 10,
                        matched_answer_display: 'Walter White'
                    };
                }
                claimedAnswers.set(normalized, context.userId);
                player.score += 10;
                return {
                    result: 'correct',
                    points_current: player.score,
                    correct_answers: player.score / 10,
                    matched_answer_display: 'Walter White'
                };
            },
            async leaveGame(context) {
                calls.push({ method: 'leaveGame', userId: context.userId });
                players.delete(context.userId);
                return { result: 'left', game_code: 'ABC234' };
            },
            async leaveActiveGames(context) {
                calls.push({ method: 'leaveActiveGames', userId: context.userId });
                players.delete(context.userId);
                return { result: 'released', released_count: 1 };
            },
            async disconnectGame(context) {
                calls.push({ method: 'disconnectGame', userId: context.userId });
                const player = players.get(context.userId);
                if (player) player.connected = false;
                return { result: 'disconnected', game_code: 'ABC234', status };
            },
            async reconnectGame(context) {
                calls.push({ method: 'reconnectGame', userId: context.userId });
                if (['finished', 'expired', 'cancelled'].includes(status)) {
                    const error = new Error('game_expired');
                    error.code = 'game_expired';
                    throw error;
                }
                const player = players.get(context.userId);
                if (player) player.connected = true;
                return { result: 'reconnected' };
            },
            async getState(context) {
                let rank = 1;
                return [...players.entries()].map(([userId, player]) => ({
                    game_code: 'ABC234',
                    category_id: 'series',
                    status,
                    max_players: 4,
                    current_players: players.size,
                    host_id: 'u1',
                    duration_seconds: 600,
                    expires_at: '2026-01-01T00:10:00Z',
                    player_id: `p-${userId}`,
                    user_id: userId,
                    pseudo: player.pseudo,
                    score: player.score,
                    correct_answers: player.score / 10,
                    is_ready: player.ready,
                    is_connected: player.connected,
                    is_host: player.host,
                    rank: rank++,
                    my_found_answer_display: userId === context.userId && player.score ? 'Walter White' : null,
                    my_found_display_order: userId === context.userId && player.score ? 1 : null,
                    all_found_answers: claimedAnswers.size
                        ? [{ display: 'Walter White', displayOrder: 1 }]
                        : []
                }));
            }
        },
        reactionService: {
            async sendReaction(context, input) {
                return { result: 'sent', reaction_type: input.reactionType, created_at: '2026-01-01T00:00:00Z' };
            }
        }
    };
}

describe('Socket.io multiplayer', () => {
    let server;
    let io;
    let port;
    let services;
    let sockets = [];

    beforeEach(async () => {
        const app = createApp({ env, multiplayerService: {}, authVerifier: fakeAuth() });
        server = http.createServer(app);
        services = fakeServices();
        io = createSocketServer(server, { env, authVerifier: fakeAuth(), ...services });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        port = server.address().port;
    });

    afterEach(async () => {
        sockets.forEach(socket => socket.close());
        sockets = [];
        await new Promise(resolve => io.close(resolve));
        await new Promise(resolve => server.close(resolve));
    });

    function connect(token) {
        const socket = Client(`http://127.0.0.1:${port}`, {
            auth: { accessToken: token },
            transports: ['websocket'],
            forceNew: true
        });
        sockets.push(socket);
        return socket;
    }

    function connectFromOrigin(token, origin) {
        const socket = Client(`http://127.0.0.1:${port}`, {
            auth: { accessToken: token },
            transports: ['websocket'],
            forceNew: true,
            extraHeaders: { Origin: origin }
        });
        sockets.push(socket);
        return socket;
    }

    it('refuse un token invalide sans l exposer', async () => {
        const socket = connect('bad-token');
        const error = await waitEvent(socket, 'connect_error');
        expect(error.message).toBe('invalid_token');
        expect(error.message).not.toContain('bad-token');
    });

    it('refuse une origine Socket.io non autorisee', async () => {
        const socket = connectFromOrigin('a', 'https://evil.example');
        const error = await waitEvent(socket, 'connect_error');
        expect(error.message).not.toContain('a');
        expect(socket.connected).toBe(false);
    });

    it('synchronise creation, join, start, score et reactions avec ack', async () => {
        const a = connect('a');
        const b = connect('b');
        await Promise.all([waitEvent(a, 'connect'), waitEvent(b, 'connect')]);

        const createdEvent = waitEvent(a, 'gameCreated');
        const createdAck = await emitAck(a, 'createGame', {
            requestId: '70000000-0000-4000-8000-000000000001',
            categoryId: 'series',
            maxPlayers: 4
        });
        expect(createdAck.ok).toBe(true);
        expect((await createdEvent).gameCode).toBe('ABC234');

        const joinedEvent = waitEvent(a, 'playerJoined');
        const joinedAck = await emitAck(b, 'joinGame', {
            requestId: '70000000-0000-4000-8000-000000000002',
            gameCode: 'ABC234'
        });
        expect(joinedAck.ok).toBe(true);
        expect((await joinedEvent).players).toHaveLength(2);

        await emitAck(b, 'setReady', {
            requestId: '70000000-0000-4000-8000-000000000003',
            gameCode: 'ABC234',
            ready: true
        });
        const startAck = await emitAck(a, 'startGame', {
            requestId: '70000000-0000-4000-8000-000000000004',
            gameCode: 'ABC234'
        });
        expect(startAck.ok).toBe(true);
        expect(startAck.data.snapshot.status).toBe('playing');

        const answerEvent = waitEvent(b, 'scoreUpdate');
        const answerAck = await emitAck(b, 'submitAnswer', {
            requestId: '70000000-0000-4000-8000-000000000005',
            gameCode: 'ABC234',
            answer: 'Walter White'
        });
        expect(answerAck.ok).toBe(true);
        expect((await answerEvent).allFoundAnswers).toEqual([
            expect.objectContaining({ display: 'Walter White' })
        ]);
        expect(answerAck.data.snapshot.players.find(player => player.pseudo === 'Beta').score).toBe(10);
        expect(answerAck.data.snapshot.allFoundAnswers).toEqual([
            expect.objectContaining({ display: 'Walter White' })
        ]);

        const alreadyFoundAck = await emitAck(a, 'submitAnswer', {
            requestId: '70000000-0000-4000-8000-000000000007',
            gameCode: 'ABC234',
            answer: 'Walter White'
        });
        expect(alreadyFoundAck.ok).toBe(true);
        expect(alreadyFoundAck.data.result.result).toBe('already_found_by_other');
        expect(alreadyFoundAck.data.snapshot.players.find(player => player.pseudo === 'Alpha').score).toBe(0);

        const reactionEvent = waitEvent(a, 'reactionReceived');
        const reactionAck = await emitAck(b, 'sendReaction', {
            requestId: '70000000-0000-4000-8000-000000000006',
            gameCode: 'ABC234',
            reactionType: 'fire'
        });
        expect(reactionAck.ok).toBe(true);
        expect(await reactionEvent).toEqual(expect.objectContaining({ reactionType: 'fire', pseudo: 'Beta' }));
    });

    it('refuse les payloads malformes et rate limite les reactions', async () => {
        const a = connect('a');
        await waitEvent(a, 'connect');
        const invalid = await emitAck(a, 'createGame', { categoryId: 'series', maxPlayers: 4, score: 999 });
        expect(invalid.ok).toBe(false);
        expect(invalid.error).toBe('invalid_payload');

        await emitAck(a, 'createGame', {
            requestId: '70000000-0000-4000-8000-000000000011',
            categoryId: 'series',
            maxPlayers: 4
        });
        for (let index = 0; index < 5; index += 1) {
            const ack = await emitAck(a, 'sendReaction', {
                requestId: `70000000-0000-4000-8000-00000000002${index}`,
                gameCode: 'ABC234',
                reactionType: 'like'
            });
            expect(ack.ok).toBe(true);
        }
        const limited = await emitAck(a, 'sendReaction', {
            requestId: '70000000-0000-4000-8000-000000000099',
            gameCode: 'ABC234',
            reactionType: 'like'
        });
        expect(limited.ok).toBe(false);
        expect(limited.error).toBe('reaction_rate_limited');
    });

    it('libere les anciennes salles actives sans exiger de code client', async () => {
        const a = connect('a');
        await waitEvent(a, 'connect');

        const ack = await emitAck(a, 'leaveActiveGames', {});

        expect(ack.ok).toBe(true);
        expect(ack.data).toEqual({ result: 'released', released_count: 1 });
        expect(services.calls).toContainEqual({ method: 'leaveActiveGames', userId: 'u1' });
    });

    it('distingue deconnexion reseau et depart volontaire', async () => {
        const a = connect('a');
        const b = connect('b');
        await Promise.all([waitEvent(a, 'connect'), waitEvent(b, 'connect')]);

        await emitAck(a, 'createGame', {
            requestId: '70000000-0000-4000-8000-000000000501',
            categoryId: 'series',
            maxPlayers: 4
        });
        await emitAck(b, 'joinGame', {
            requestId: '70000000-0000-4000-8000-000000000502',
            gameCode: 'ABC234'
        });

        const disconnectedEvent = waitEvent(a, 'playerDisconnected');
        b.disconnect();
        const disconnected = await disconnectedEvent;
        expect(disconnected.players.find(player => player.pseudo === 'Beta').isConnected).toBe(false);
        expect(disconnected.players).toHaveLength(2);
        expect(services.calls).toContainEqual({ method: 'disconnectGame', userId: 'u2' });
        expect(services.calls).not.toContainEqual({ method: 'leaveGame', userId: 'u2' });

        const b2 = connect('b');
        await waitEvent(b2, 'connect');
        const reconnectAck = await emitAck(b2, 'requestGameState', {
            requestId: '70000000-0000-4000-8000-000000000503',
            gameCode: 'ABC234'
        });
        expect(reconnectAck.ok).toBe(true);
        expect(reconnectAck.data.players.find(player => player.pseudo === 'Beta').isConnected).toBe(true);

        const leftEvent = waitEvent(a, 'playerLeft');
        const leftAck = await emitAck(b2, 'leaveGame', {
            requestId: '70000000-0000-4000-8000-000000000504',
            gameCode: 'ABC234'
        });
        expect(leftAck.ok).toBe(true);
        expect(await leftEvent).toEqual(expect.objectContaining({ result: 'left', game_code: 'ABC234' }));
    });

    it('refuse la reconnexion quand le cleanup a finalise la partie vide apres delai', async () => {
        const a = connect('a');
        const b = connect('b');
        await Promise.all([waitEvent(a, 'connect'), waitEvent(b, 'connect')]);

        await emitAck(a, 'createGame', {
            requestId: '70000000-0000-4000-8000-000000000601',
            categoryId: 'series',
            maxPlayers: 4
        });
        await emitAck(b, 'joinGame', {
            requestId: '70000000-0000-4000-8000-000000000602',
            gameCode: 'ABC234'
        });

        const disconnectedEvent = waitEvent(a, 'playerDisconnected');
        b.disconnect();
        await disconnectedEvent;

        services.expireGame('expired');
        const b2 = connect('b');
        await waitEvent(b2, 'connect');
        const reconnectAfterTimeout = await emitAck(b2, 'requestGameState', {
            requestId: '70000000-0000-4000-8000-000000000603',
            gameCode: 'ABC234'
        });

        expect(reconnectAfterTimeout.ok).toBe(false);
        expect(reconnectAfterTimeout.error).toBe('game_expired');
        expect(services.calls).not.toContainEqual({ method: 'leaveGame', userId: 'u2' });
    });

    it('supporte une charge locale legere sans crash ni fuite de score par reaction', async () => {
        const clients = Array.from({ length: 12 }, () => connect('a'));
        await Promise.all(clients.map(socket => waitEvent(socket, 'connect')));
        await emitAck(clients[0], 'createGame', {
            requestId: '70000000-0000-4000-8000-000000000101',
            categoryId: 'series',
            maxPlayers: 4
        });

        const results = await Promise.all(clients.map((socket, index) => emitAck(socket, 'requestGameState', {
            requestId: `70000000-0000-4000-8000-0000000002${String(index).padStart(2, '0')}`,
            gameCode: 'ABC234'
        })));
        expect(results.every(result => result.ok)).toBe(true);

        const reactions = await Promise.all(clients.slice(0, 5).map((socket, index) => emitAck(socket, 'sendReaction', {
            requestId: `70000000-0000-4000-8000-0000000003${String(index).padStart(2, '0')}`,
            gameCode: 'ABC234',
            reactionType: 'party'
        })));
        expect(reactions.every(result => result.ok)).toBe(true);
        const state = await emitAck(clients[0], 'requestGameState', {
            requestId: '70000000-0000-4000-8000-000000000401',
            gameCode: 'ABC234'
        });
        expect(state.data.players[0].score).toBe(0);
    });
});
