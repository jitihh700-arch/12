const STABLE_ERRORS = new Set([
    'authentication_required',
    'invalid_token',
    'profile_required',
    'service_unavailable',
    'invalid_game_code',
    'game_not_found',
    'game_expired',
    'game_already_started',
    'game_full',
    'already_joined',
    'active_game_exists',
    'host_required',
    'not_enough_players',
    'players_not_ready',
    'not_a_player',
    'invalid_answer',
    'answer_too_long',
    'game_finished',
    'reaction_rate_limited',
    'invalid_reaction_type',
    'rate_limited',
    'invalid_payload',
    'cors_origin_denied'
]);

export function stableError(error) {
    const haystack = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
    for (const key of STABLE_ERRORS) {
        if (haystack.includes(key)) return key;
    }
    return 'service_unavailable';
}

export function ackOk(data, requestId) {
    return { ok: true, data, requestId };
}

export function ackError(error, requestId) {
    return { ok: false, error: stableError(error), requestId };
}
