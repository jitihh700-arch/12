(function() {
    const RPC_NAMES = {
        registerProfile: 'register_profile',
        getMyProfile: 'get_my_profile',
        changeMyPseudo: 'change_my_pseudo',
        listComments: 'list_comments',
        createComment: 'create_comment',
        updateMyComment: 'update_my_comment',
        deleteMyComment: 'delete_my_comment',
        startQuizSession: 'start_quiz_session',
        submitQuizAnswer: 'submit_quiz_answer',
        completeQuizSession: 'complete_quiz_session',
        abandonQuizSession: 'abandon_quiz_session',
        getMyQuizSession: 'get_my_quiz_session',
        getMyQuizSessionState: 'get_my_quiz_session_state',
        getLeaderboard: 'get_leaderboard',
        getMyLeaderboardRank: 'get_my_leaderboard_rank'
    };

    let client = null;
    let api = null;

    function firstRow(data) {
        if (Array.isArray(data)) return data[0] || null;
        return data || null;
    }

    function assertClient(supabaseClient) {
        if (!supabaseClient || typeof supabaseClient.rpc !== 'function') {
            throw new Error('supabase_client_missing');
        }
    }

    function createProfileApi(supabaseClient) {
        assertClient(supabaseClient);

        async function callRpc(name, params, options = {}) {
            const timeoutMs = Number(options.timeoutMs || 8000);
            let timeoutId;
            const timeout = new Promise(resolve => {
                timeoutId = window.setTimeout(() => resolve({
                    data: null,
                    error: new Error('rpc_timeout')
                }), timeoutMs);
            });
            const request = supabaseClient.rpc(name, params || {})
                .then(({ data, error }) => ({ data, error }))
                .catch(error => ({ data: null, error }));

            return Promise.race([request, timeout]).finally(() => window.clearTimeout(timeoutId));
        }

        function isUuid(value) {
            return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
        }

        return {
            get client() {
                return supabaseClient;
            },

            async registerProfile(pseudo) {
                const { data, error } = await supabaseClient.rpc(RPC_NAMES.registerProfile, { p_pseudo: pseudo });
                return { data: firstRow(data), error };
            },

            async getMyProfile() {
                const { data, error } = await supabaseClient.rpc(RPC_NAMES.getMyProfile);
                return { data: firstRow(data), error };
            },

            async changeMyPseudo(pseudo) {
                const { data, error } = await supabaseClient.rpc(RPC_NAMES.changeMyPseudo, { p_pseudo: pseudo });
                return { data: firstRow(data), error };
            },

            async listComments({ limit = 20, offset = 0 } = {}) {
                const { data, error } = await supabaseClient.rpc(RPC_NAMES.listComments, { p_limit: limit, p_offset: offset });
                return { data: Array.isArray(data) ? data : [], error };
            },

            async createComment(contentOrPayload) {
                // 🔴 CORRECTION : gère string simple OU objet { content, parent_id }
                let p_content = contentOrPayload;
                let p_parent_id = null;
                if (contentOrPayload && typeof contentOrPayload === 'object') {
                    p_content = contentOrPayload.content;
                    p_parent_id = contentOrPayload.parent_id || null;
                }
                const params = { p_content: String(p_content || '') };
                if (p_parent_id && isUuid(p_parent_id)) {
                    params.p_parent_id = p_parent_id;
                }
                const { data, error } = await supabaseClient.rpc(RPC_NAMES.createComment, params);
                return { data: firstRow(data), error };
            },

            async updateMyComment(commentId, content) {
                const { data, error } = await supabaseClient.rpc(RPC_NAMES.updateMyComment, { p_comment_id: commentId, p_content: content });
                return { data: firstRow(data), error };
            },

            async deleteMyComment(commentId) {
                const { data, error } = await supabaseClient.rpc(RPC_NAMES.deleteMyComment, { p_comment_id: commentId });
                return { data: firstRow(data), error };
            },

            async startQuizSession(categoryId) {
                if (typeof categoryId !== 'string' || !categoryId.trim()) {
                    return { data: null, error: new Error('category_not_found') };
                }
                const { data, error } = await callRpc(RPC_NAMES.startQuizSession, { p_category_id: categoryId.trim() });
                return { data: firstRow(data), error };
            },

            async submitQuizAnswer(sessionId, answer) {
                if (!isUuid(sessionId)) return { data: null, error: new Error('session_not_found') };
                if (typeof answer !== 'string') return { data: null, error: new Error('invalid_answer') };
                const { data, error } = await callRpc(RPC_NAMES.submitQuizAnswer, {
                    p_session_id: sessionId,
                    p_answer: answer
                });
                return { data: firstRow(data), error };
            },

            async completeQuizSession(sessionId) {
                if (!isUuid(sessionId)) return { data: null, error: new Error('session_not_found') };
                const { data, error } = await callRpc(RPC_NAMES.completeQuizSession, { p_session_id: sessionId });
                return { data: firstRow(data), error };
            },

            async abandonQuizSession(sessionId) {
                if (!isUuid(sessionId)) return { data: null, error: new Error('session_not_found') };
                const { data, error } = await callRpc(RPC_NAMES.abandonQuizSession, { p_session_id: sessionId });
                return { data: firstRow(data), error };
            },

            async getMyQuizSession(sessionId) {
                if (!isUuid(sessionId)) return { data: null, error: new Error('session_not_found') };
                const { data, error } = await callRpc(RPC_NAMES.getMyQuizSession, { p_session_id: sessionId });
                return { data: firstRow(data), error };
            },

            async getMyQuizSessionState(sessionId) {
                if (!isUuid(sessionId)) return { data: [], error: new Error('session_not_found') };
                const { data, error } = await callRpc(RPC_NAMES.getMyQuizSessionState, { p_session_id: sessionId });
                return { data: Array.isArray(data) ? data : [], error };
            },

            async getLeaderboard(limit = 20) {
                const parsedLimit = Number(limit);
                if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 20) {
                    return { data: [], error: new Error('invalid_leaderboard_limit') };
                }
                const { data, error } = await callRpc(RPC_NAMES.getLeaderboard, { p_limit: parsedLimit });
                return { data: Array.isArray(data) ? data : [], error };
            },

            async getMyLeaderboardRank() {
                const { data, error } = await callRpc(RPC_NAMES.getMyLeaderboardRank);
                return { data: firstRow(data), error };
            }
        };
    }

    function init(config) {
        if (api) return api;
        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            throw new Error('supabase_sdk_missing');
        }
        if (!config || !config.url || !config.publishableKey) {
            throw new Error('supabase_config_missing');
        }

        client = window.supabase.createClient(config.url, config.publishableKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: false
            }
        });
        api = createProfileApi(client);
        return api;
    }

    function resetForTests() {
        client = null;
        api = null;
    }

    window.MemorizProfileApi = { init, resetForTests, createProfileApi, RPC_NAMES };
})();
