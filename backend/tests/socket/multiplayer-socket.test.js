import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as Client } from 'socket.io-client';
import { createApp } from '../../src/app.js';
import { createSocketServer } from '../../src/socket/index.js';

const env = {
    FRONTEND_ORIGIN: 'http://127.0.0.1:4173',
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
    let status = 'waiting';
    return {
        multiplayerService: {
            async createGame(context) {
                players.set(context.userId, { pseudo: context.pseudo, score: 0, ready: true, host: true });
                return { game_code: 'ABC234', category_id: 'series', status, max_players: 4 };
            },
            async joinGame(context) {
                players.set(context.userId, { pseudo: context.pseudo, score: 0, ready: false, host: false });
                return { result: 'joined', game_code: 'ABC234' };
            },
            async setReady(context, input) {
                players.get(context.userId).ready = input.ready;
                return { result: 'ready_updated' };
            },
            async startGame() {
                status = 'playing';
                return { result: 'started', game_code: 'ABC234', category_id: 'series' };
            },
            async submitAnswer(context) {
                const player = players.get(context.userId);
                player.score += 10;
                return { result: 'correct', points_current: player.score, correct_answers: player.score / 10 };
            },
            async leaveGame(context) {
                players.delete(context.userId);
                return { result: 'left', game_code: 'ABC234' };
            },
            async reconnectGame() {
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
                    is_connected: true,
                    is_host: player.host,
                    rank: rank++,
                    my_found_answer_display: userId === context.userId && player.score ? 'Walter White' : null,
                    my_found_display_order: userId === context.userId && player.score ? 1 : null
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
    let sockets = [];

    beforeEach(async () => {
        const app = createApp({ env, multiplayerService: {}, authVerifier: fakeAuth() });
        server = http.createServer(app);
        const services = fakeServices();
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

    it('refuse un token invalide sans l exposer', async () => {
        const socket = connect('bad-token');
        const error = await waitEvent(socket, 'connect_error');
        expect(error.message).toBe('invalid_token');
        expect(error.message).not.toContain('bad-token');
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

        const answerEvent = waitEvent(b, 'answerResult');
        const answerAck = await emitAck(b, 'submitAnswer', {
            requestId: '70000000-0000-4000-8000-000000000005',
            gameCode: 'ABC234',
            answer: 'Walter White'
        });
        expect(answerAck.ok).toBe(true);
        expect((await answerEvent).result).toBe('correct');
        expect(answerAck.data.snapshot.players.find(player => player.pseudo === 'Beta').score).toBe(10);

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
});
