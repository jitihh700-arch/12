import { createSupabaseForUser } from '../config/supabase.js';

export class ReactionService {
    constructor(env, clientFactory = createSupabaseForUser) {
        this.env = env;
        this.clientFactory = clientFactory;
    }

    async sendReaction(context, { gameCode, reactionType }) {
        const { data, error } = await this.clientFactory(this.env, context.accessToken).rpc('create_multiplayer_reaction', {
            p_game_code: gameCode,
            p_reaction_type: reactionType
        });
        if (error) throw error;
        return Array.isArray(data) ? data[0] || null : data || null;
    }
}
