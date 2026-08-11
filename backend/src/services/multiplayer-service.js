import { createSupabaseAdmin, createSupabaseForUser } from '../config/supabase.js';

function firstRow(data) {
    return Array.isArray(data) ? data[0] || null : data || null;
}

function throwIfError(error) {
    if (error) throw error;
}

function errorKey(error) {
    return [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
}

export class MultiplayerService {
    constructor(env, clientFactory = createSupabaseForUser, adminFactory = createSupabaseAdmin) {
        this.env = env;
        this.clientFactory = clientFactory;
        this.adminFactory = adminFactory;
    }

    client(context) {
        return this.clientFactory(this.env, context.accessToken);
    }

    admin() {
        return this.adminFactory(this.env);
    }

    async createGame(context, { categoryId, maxPlayers }, retryAfterActiveGame = true) {
        const { data, error } = await this.client(context).rpc('create_multiplayer_game', {
            p_category_id: categoryId,
            p_max_players: maxPlayers
        });
        if (retryAfterActiveGame && errorKey(error).includes('active_game_exists')) {
            await this.leaveActiveGames(context);
            return this.createGame(context, { categoryId, maxPlayers }, false);
        }
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

    async markConnectedPlayersReady(gameCode) {
        const code = String(gameCode || '').trim().toUpperCase();
        if (!code) return;

        const admin = this.admin();
        const { data: game, error: gameError } = await admin
            .from('multiplayer_games')
            .select('id')
            .eq('game_code', code)
            .eq('status', 'waiting')
            .maybeSingle();

        if (gameError) throw gameError;
        if (!game?.id) return;

        const { error } = await admin
            .from('multiplayer_players')
            .update({ is_ready: true })
            .eq('game_id', game.id)
            .is('left_at', null)
            .eq('is_connected', true);

        throwIfError(error);
    }

    async startGame(context, { gameCode }, retryAfterReadyError = true) {
        const { data, error } = await this.client(context).rpc('start_multiplayer_game', { p_game_code: gameCode });
        if (retryAfterReadyError && errorKey(error).includes('players_not_ready')) {
            await this.markConnectedPlayersReady(gameCode);
            return this.startGame(context, { gameCode }, false);
        }
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

    async leaveActiveGames(context) {
        const { data, error } = await this.client(context).rpc('leave_my_active_multiplayer_games');
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
