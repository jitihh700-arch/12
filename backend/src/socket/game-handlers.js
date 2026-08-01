import {
    createGameSchema,
    gameCodeSchema,
    joinGameSchema,
    parsePayload,
    readySchema,
    submitAnswerSchema
} from '../validators/multiplayer-validator.js';
import { buildGameSnapshot } from '../services/game-engine-service.js';
import { ackError, ackOk } from '../utils/socket-errors.js';

function roomName(gameCode) {
    return `game:${gameCode}`;
}

async function emitState(io, service, socket, gameCode, eventName = 'gameState') {
    const rows = await service.getState(socket.user, { gameCode });
    const snapshot = buildGameSnapshot(rows, socket.user.userId);
    io.to(roomName(gameCode)).emit(eventName, snapshot);
    return snapshot;
}

function withAck(socket, limiter, key, limits, handler) {
    return async function wrapped(payload, ack = () => {}) {
        const requestId = payload?.requestId;
        try {
            if (!limiter.check(`${socket.user.userId}:${key}:${payload?.gameCode || ''}`, limits)) {
                ack(ackError(new Error('rate_limited'), requestId));
                return;
            }
            const data = await handler(payload);
            ack(ackOk(data, requestId));
        } catch (error) {
            ack(ackError(error, requestId));
        }
    };
}

function rememberActiveGame(socket, gameCode) {
    socket.data.activeGameCode = gameCode;
}

async function emitStateIfAvailable(io, service, socket, gameCode, eventName) {
    try {
        return await emitState(io, service, socket, gameCode, eventName);
    } catch (error) {
        io.to(roomName(gameCode)).emit(eventName, { gameCode, status: 'unavailable' });
        return null;
    }
}

export function registerGameHandlers(io, socket, { multiplayerService, limiter }) {
    socket.on('createGame', withAck(socket, limiter, 'createGame', { max: 5, windowMs: 60_000 }, async payload => {
        const input = parsePayload(createGameSchema, payload);
        const created = await multiplayerService.createGame(socket.user, input);
        socket.join(roomName(created.game_code));
        rememberActiveGame(socket, created.game_code);
        const snapshot = await emitState(io, multiplayerService, socket, created.game_code, 'gameCreated');
        return { created, snapshot };
    }));

    socket.on('joinGame', withAck(socket, limiter, 'joinGame', { max: 20, windowMs: 60_000 }, async payload => {
        const input = parsePayload(joinGameSchema, payload);
        const joined = await multiplayerService.joinGame(socket.user, input);
        socket.join(roomName(input.gameCode));
        rememberActiveGame(socket, input.gameCode);
        const snapshot = await emitState(io, multiplayerService, socket, input.gameCode, 'playerJoined');
        return { joined, snapshot };
    }));

    socket.on('setReady', withAck(socket, limiter, 'setReady', { max: 20, windowMs: 60_000 }, async payload => {
        const input = parsePayload(readySchema, payload);
        const updated = await multiplayerService.setReady(socket.user, input);
        const snapshot = await emitState(io, multiplayerService, socket, input.gameCode, 'playerUpdated');
        return { updated, snapshot };
    }));

    socket.on('startGame', withAck(socket, limiter, 'startGame', { max: 10, windowMs: 60_000 }, async payload => {
        const input = parsePayload(gameCodeSchema, payload);
        const started = await multiplayerService.startGame(socket.user, input);
        const snapshot = await emitState(io, multiplayerService, socket, input.gameCode, 'gameStarted');
        return { started, snapshot };
    }));

    socket.on('submitAnswer', withAck(socket, limiter, 'submitAnswer', { max: 30, windowMs: 10_000 }, async payload => {
        const input = parsePayload(submitAnswerSchema, payload);
        const result = await multiplayerService.submitAnswer(socket.user, input);
        const snapshot = await emitState(io, multiplayerService, socket, input.gameCode, 'scoreUpdate');
        socket.emit('answerResult', result);
        return { result, snapshot };
    }));

    socket.on('leaveGame', withAck(socket, limiter, 'leaveGame', { max: 10, windowMs: 60_000 }, async payload => {
        const input = parsePayload(gameCodeSchema, payload);
        const result = await multiplayerService.leaveGame(socket.user, input);
        socket.leave(roomName(input.gameCode));
        if (['finished', 'expired', 'cancelled'].includes(result.status)) {
            io.to(roomName(input.gameCode)).emit('gameFinished', result);
        } else {
            io.to(roomName(input.gameCode)).emit('playerLeft', result);
        }
        if (socket.data.activeGameCode === input.gameCode) delete socket.data.activeGameCode;
        return result;
    }));

    socket.on('leaveActiveGames', withAck(socket, limiter, 'leaveActiveGames', { max: 5, windowMs: 60_000 }, async () => {
        delete socket.data.activeGameCode;
        return multiplayerService.leaveActiveGames(socket.user);
    }));

    socket.on('requestGameState', withAck(socket, limiter, 'requestGameState', { max: 30, windowMs: 60_000 }, async payload => {
        const input = parsePayload(gameCodeSchema, payload);
        await multiplayerService.reconnectGame(socket.user, input);
        socket.join(roomName(input.gameCode));
        rememberActiveGame(socket, input.gameCode);
        return emitState(io, multiplayerService, socket, input.gameCode);
    }));

    socket.on('disconnect', () => {
        const gameCode = socket.data.activeGameCode;
        if (!gameCode) return;
        delete socket.data.activeGameCode;
        // Une coupure reseau retire seulement la presence connectee, pas la place du joueur.
        multiplayerService.disconnectGame(socket.user, { gameCode })
            .then(() => emitStateIfAvailable(io, multiplayerService, socket, gameCode, 'playerDisconnected'))
            .catch(() => {});
    });
}
