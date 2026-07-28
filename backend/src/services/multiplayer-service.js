import { createSupabaseForUser } from '../config/supabase.js';

function firstRow(data) {
    return Array.isArray(data) ? data[0] || null : data || null;
}

function throwIfError(error) {
    if (error) throw error;
}

export class MultiplayerService {
    constructor(env, clientFactory = createSupabaseForUser) {
        this.env = env;
        this.clientFactory = clientFactory;
    }

    client(context) {
        return this.clientFactory(this.env, context.accessToken);
    }

    async createGame(context, { categoryId, maxPlayers }) {
        const { data, error } = await this.client(context).rpc('create_multiplayer_game', {
            p_category_id: categoryId,
            p_max_players: maxPlayers
        });
        throwIfError(error);
        return firstRow(data);
    }

    async joinGame(context, { gameCode }) {
        const { data, error } = await this.client(context).rpc('join_multiplayer_game', { p_game_code: gameCode });
        throwIfError(error);
        return firstRow(data);
    }

    async setReady(context, { gameCode, ready }) {
        const { data, error } = await this.client(context).rpc('set_multiplayer_ready', {
            p_game_code: gameCode,
            p_is_ready: ready
        });
        throwIfError(error);
        return firstRow(data);
    }

    async startGame(context, { gameCode }) {
        const { data, error } = await this.client(context).rpc('start_multiplayer_game', { p_game_code: gameCode });
        throwIfError(error);
        return firstRow(data);
    }

    async submitAnswer(context, { gameCode, answer, requestId }) {
        const { data, error } = await this.client(context).rpc('submit_multiplayer_answer', {
            p_game_code: gameCode,
            p_answer: answer,
            p_client_submission_id: requestId || null
        });
        throwIfError(error);
        return firstRow(data);
    }

    async finishGame(context, { gameCode }) {
        const { data, error } = await this.client(context).rpc('finish_multiplayer_game', { p_game_code: gameCode });
        throwIfError(error);
        return firstRow(data);
    }

    async leaveGame(context, { gameCode }) {
        const { data, error } = await this.client(context).rpc('leave_multiplayer_game', { p_game_code: gameCode });
        throwIfError(error);
        return firstRow(data);
    }

    async disconnectGame(context, { gameCode }) {
        const { data, error } = await this.client(context).rpc('disconnect_multiplayer_game', { p_game_code: gameCode });
        throwIfError(error);
        return firstRow(data);
    }

    async reconnectGame(context, { gameCode }) {
        const { data, error } = await this.client(context).rpc('reconnect_multiplayer_game', { p_game_code: gameCode });
        throwIfError(error);
        return firstRow(data);
    }

    async getState(context, { gameCode }) {
        const { data, error } = await this.client(context).rpc('get_my_multiplayer_game_state', { p_game_code: gameCode });
        throwIfError(error);
        return Array.isArray(data) ? data : [];
    }
}
