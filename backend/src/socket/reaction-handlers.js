import { reactionSchema } from '../validators/reaction-validator.js';
import { parsePayload } from '../validators/multiplayer-validator.js';
import { ackError, ackOk } from '../utils/socket-errors.js';

function roomName(gameCode) {
    return `game:${gameCode}`;
}

export function registerReactionHandlers(io, socket, { reactionService, limiter }) {
    socket.on('sendReaction', async (payload, ack = () => {}) => {
        const requestId = payload?.requestId;
        try {
            const input = parsePayload(reactionSchema, payload);
            const key = `${socket.user.userId}:reaction:${input.gameCode}`;
            if (!limiter.check(key, { max: 5, windowMs: 10_000 })) {
                ack(ackError(new Error('reaction_rate_limited'), requestId));
                return;
            }
            const result = await reactionService.sendReaction(socket.user, input);
            const event = {
                gameCode: input.gameCode,
                reactionType: input.reactionType,
                pseudo: socket.user.pseudo,
                createdAt: result?.created_at || new Date().toISOString()
            };
            io.to(roomName(input.gameCode)).emit('reactionReceived', event);
            ack(ackOk(event, requestId));
        } catch (error) {
            ack(ackError(error, requestId));
        }
    });
}
