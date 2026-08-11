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

function normalizeGameCode(gameCode) {
    return String(gameCode || '').trim().toUpperCase();
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
        const code = normalizeGameCode(gameCode);
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
        const result = firstRow(data);
        return this.ensureAnswerWasNotAlreadyClaimed(context, { gameCode, requestId }, result);
    }

    async ensureAnswerWasNotAlreadyClaimed(context, { gameCode, requestId }, result) {
        if (result?.result !== 'correct' || !requestId) return result;

        const code = normalizeGameCode(gameCode);
        if (!code) return result;

        const admin = this.admin();
        const { data: game, error: gameError } = await admin
            .from('multiplayer_games')
            .select('id')
            .eq('game_code', code)
            .maybeSingle();

        throwIfError(gameError);
        if (!game?.id) return result;

        const { data: player, error: playerError } = await admin
            .from('multiplayer_players')
            .select('id,score,correct_answers')
            .eq('game_id', game.id)
            .eq('user_id', context.userId)
            .maybeSingle();

        throwIfError(playerError);
        if (!player?.id) return result;

        const { data: ownAnswer, error: ownAnswerError } = await admin
            .from('multiplayer_answers')
            .select('id,answer_id,answered_at')
            .eq('game_id', game.id)
            .eq('player_id', player.id)
            .eq('client_submission_id', requestId)
            .maybeSingle();

        throwIfError(ownAnswerError);
        if (!ownAnswer?.answer_id) return result;

        const { data: claims, error: claimsError } = await admin
            .from('multiplayer_answers')
            .select('id,player_id,answered_at')
            .eq('game_id', game.id)
            .eq('answer_id', ownAnswer.answer_id)
            .order('answered_at', { ascending: true })
            .order('id', { ascending: true });

        throwIfError(claimsError);
        const firstClaim = Array.isArray(claims) ? claims[0] : null;
        if (!firstClaim || firstClaim.player_id === player.id) return result;

        const nextScore = Math.max(0, Number(player.score || 0) - 10);
        const nextCorrectAnswers = Math.max(0, Number(player.correct_answers || 0) - 1);

        const { error: deleteError } = await admin
            .from('multiplayer_answers')
            .delete()
            .eq('id', ownAnswer.id);
        throwIfError(deleteError);

        const { error: updateError } = await admin
            .from('multiplayer_players')
            .update({ score: nextScore, correct_answers: nextCorrectAnswers })
            .eq('id', player.id);
        throwIfError(updateError);

        return {
            ...result,
            result: 'already_found_by_other',
            points_current: nextScore,
            correct_answers: nextCorrectAnswers
        };
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
