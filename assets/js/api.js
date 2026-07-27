(function() {
    const RPC_NAMES = {
        registerProfile: 'register_profile',
        getMyProfile: 'get_my_profile',
        changeMyPseudo: 'change_my_pseudo'
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
