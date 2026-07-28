(function() {
    const CACHE_KEY = 'memoriz_active_quiz_session';
    const STATES = {
        PRACTICE_READY: 'PRACTICE_READY',
        RANKED_INITIALIZING: 'RANKED_INITIALIZING',
        RANKED_ACTIVE: 'RANKED_ACTIVE',
        SUBMITTING: 'SUBMITTING',
        FINALIZING: 'FINALIZING',
        COMPLETED: 'COMPLETED',
        EXPIRED: 'EXPIRED',
        ABANDONED: 'ABANDONED',
        RESTORING: 'RESTORING',
        SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
        ERROR: 'ERROR'
    };

    const state = {
        api: null,
        mode: 'practice',
        status: STATES.PRACTICE_READY,
        session: null,
        profile: null,
        requestSeq: 0,
        submitting: false,
        finalizing: false,
        unavailableReason: 'profile_required'
    };

    function getApi() {
        if (state.api) return state.api;
        try {
            const config = window.MEMORIZ_SUPABASE_CONFIG || {};
            if (!config.url || !config.publishableKey || !window.MemorizProfileApi) return null;
            state.api = window.MemorizProfileApi.init(config);
            return state.api;
        } catch (error) {
            return null;
        }
    }

    function currentProfile() {
        const authState = window.memorizAuth?.getState?.();
        return authState?.profile || window.memorizProfile || state.profile || null;
    }

    function canUseRanked() {
        return Boolean(getApi() && currentProfile());
    }

    function cacheSession(session) {
        if (!session || !session.session_id || !session.category_id) return;
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            sessionId: session.session_id,
            categoryId: session.category_id
        }));
    }

    function readCachedSession() {
        try {
            const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            if (!parsed || typeof parsed.sessionId !== 'string' || typeof parsed.categoryId !== 'string') return null;
            return parsed;
        } catch (error) {
            return null;
        }
    }

    function clearCache() {
        localStorage.removeItem(CACHE_KEY);
    }

    function mapError(error) {
        const haystack = [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(' ');
        const keys = [
            'authentication_required',
            'profile_required',
            'category_not_found',
            'category_inactive',
            'active_session_exists',
            'session_not_found',
            'session_forbidden',
            'session_not_active',
            'session_expired',
            'invalid_answer',
            'answer_too_long',
            'session_already_completed',
            'invalid_leaderboard_limit',
            'rpc_timeout'
        ];
        return keys.find(key => haystack.includes(key)) || (error ? 'network_error' : '');
    }

    function userMessage(error) {
        const messages = {
            authentication_required: 'Connexion requise pour le mode classé.',
            profile_required: 'Crée ton profil pour jouer en mode classé.',
            category_not_found: 'Cette catégorie est indisponible.',
            category_inactive: 'Cette catégorie est temporairement fermée.',
            active_session_exists: 'Une session classée est déjà active.',
            session_not_found: 'La session classée est introuvable.',
            session_forbidden: 'Cette session appartient à un autre profil.',
            session_not_active: 'Cette session n’est plus active.',
            session_expired: 'Le temps est écoulé.',
            invalid_answer: 'Réponse invalide.',
            answer_too_long: 'Réponse trop longue.',
            session_already_completed: 'Cette session est déjà terminée.',
            invalid_leaderboard_limit: 'Limite de classement invalide.',
            rpc_timeout: 'Le serveur met trop de temps à répondre.',
            network_error: 'Service classé momentanément indisponible.'
        };
        return messages[mapError(error)] || messages.network_error;
    }

    function normalizeRows(rows) {
        const list = Array.isArray(rows) ? rows : [];
        const first = list[0] || null;
        const foundAnswers = list
            .filter(row => row && row.found_display_order)
            .map(row => ({
                displayOrder: Number(row.found_display_order),
                display: row.found_answer_display,
                answerYear: row.found_answer_year,
                hint: row.found_hint,
                answeredAt: row.answered_at
            }));

        return first ? {
            session_id: first.session_id,
            category_id: first.category_id,
            status: first.status,
            correct_answers: Number(first.correct_answers || 0),
            points_current: Number(first.points_current || 0),
            duration_seconds: Number(first.duration_seconds || 600),
            started_at: first.started_at,
            expires_at: first.expires_at,
            completed_at: first.completed_at,
            abandoned_at: first.abandoned_at,
            last_activity_at: first.last_activity_at,
            foundAnswers
        } : null;
    }

    async function start(categoryId) {
        state.profile = currentProfile();
        if (!canUseRanked()) {
            state.mode = 'practice';
            state.status = STATES.PRACTICE_READY;
            state.session = null;
            state.unavailableReason = getApi() ? 'profile_required' : 'service_unavailable';
            return { mode: 'practice', reason: state.unavailableReason };
        }

        state.mode = 'ranked';
        state.status = STATES.RANKED_INITIALIZING;
        const result = await getApi().startQuizSession(categoryId);
        if (result.error || !result.data?.session_id) {
            state.mode = 'practice';
            state.status = STATES.SERVICE_UNAVAILABLE;
            state.session = null;
            return { mode: 'practice', reason: mapError(result.error), message: userMessage(result.error) };
        }

        state.session = result.data;
        state.status = STATES.RANKED_ACTIVE;
        cacheSession(result.data);
        return { mode: 'ranked', session: { ...result.data } };
    }

    async function restore() {
        const cached = readCachedSession();
        if (!cached || !canUseRanked()) return { restored: false };

        state.status = STATES.RESTORING;
        const result = await getApi().getMyQuizSessionState(cached.sessionId);
        if (result.error) {
            clearCache();
            state.status = STATES.ERROR;
            return { restored: false, error: result.error };
        }

        const session = normalizeRows(result.data);
        if (!session || session.category_id !== cached.categoryId) {
            clearCache();
            return { restored: false };
        }

        if (['abandoned', 'expired'].includes(session.status)) {
            clearCache();
            state.session = session;
            state.status = session.status === 'expired' ? STATES.EXPIRED : STATES.ABANDONED;
            return { restored: false, session };
        }

        state.mode = 'ranked';
        state.session = session;
        state.status = session.status === 'completed' ? STATES.COMPLETED : STATES.RANKED_ACTIVE;
        return { restored: true, session };
    }

    async function submit(answer) {
        if (state.mode !== 'ranked' || !state.session?.session_id || state.submitting || state.finalizing) {
            return { ignored: true };
        }
        const requestId = ++state.requestSeq;
        state.submitting = true;
        state.status = STATES.SUBMITTING;
        const result = await getApi().submitQuizAnswer(state.session.session_id, answer);
        state.submitting = false;
        if (requestId !== state.requestSeq) return { stale: true };
        if (result.error) {
            state.status = STATES.ERROR;
            return { error: result.error, message: userMessage(result.error) };
        }

        state.session = { ...state.session, ...result.data };
        state.status = result.data.status === 'completed' ? STATES.COMPLETED : STATES.RANKED_ACTIVE;
        return { data: result.data };
    }

    async function complete() {
        if (state.mode !== 'ranked' || !state.session?.session_id || state.finalizing) return { ignored: true };
        state.finalizing = true;
        state.status = STATES.FINALIZING;
        const result = await getApi().completeQuizSession(state.session.session_id);
        state.finalizing = false;
        if (result.error) {
            state.status = STATES.ERROR;
            return { error: result.error, message: userMessage(result.error) };
        }
        state.session = { ...state.session, ...result.data };
        state.status = result.data.status === 'expired' ? STATES.EXPIRED : STATES.COMPLETED;
        if (['completed', 'already_completed', 'expired'].includes(result.data.result)) clearCache();
        await window.memorizAuth?.refreshProfile?.();
        document.dispatchEvent(new CustomEvent('memoriz:quiz-finalized', { detail: { result: result.data } }));
        return { data: result.data };
    }

    async function abandon() {
        if (state.mode !== 'ranked' || !state.session?.session_id || state.finalizing) {
            clearCache();
            return { ignored: true };
        }
        const result = await getApi().abandonQuizSession(state.session.session_id);
        clearCache();
        state.status = STATES.ABANDONED;
        return result.error ? { error: result.error, message: userMessage(result.error) } : { data: result.data };
    }

    function getState() {
        return {
            mode: state.mode,
            status: state.status,
            session: state.session ? { ...state.session } : null,
            profile: currentProfile(),
            unavailableReason: state.unavailableReason
        };
    }

    document.addEventListener('memoriz:profile-ready', event => {
        state.profile = event.detail.profile;
        state.api = getApi();
    });
    document.addEventListener('memoriz:profile-unavailable', event => {
        state.profile = null;
        state.unavailableReason = event.detail?.reason || 'service_unavailable';
    });

    window.MemorizQuizSession = {
        STATES,
        start,
        restore,
        submit,
        complete,
        abandon,
        clearCache,
        getState,
        _readCachedSession: readCachedSession
    };
})();
