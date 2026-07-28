(function() {
    const DEFAULT_TIMEOUT = 8000;

    const state = {
        socket: null,
        connected: false,
        connecting: false,
        lastError: null
    };

    function getBackendUrl() {
        const config = window.MEMORIZ_MULTIPLAYER_CONFIG || {};
        return config.url || '';
    }

    function getApi() {
        try {
            return window.MemorizProfileApi?.init(window.MEMORIZ_SUPABASE_CONFIG || {});
        } catch (error) {
            return null;
        }
    }

    async function getAccessToken() {
        const api = getApi();
        const sessionResult = await api?.client?.auth?.getSession?.();
        return sessionResult?.data?.session?.access_token || '';
    }

    function requestId() {
        if (window.crypto?.randomUUID) return window.crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/[x]/g, () => Math.floor(Math.random() * 16).toString(16));
    }

    function emitWithAck(eventName, payload = {}, timeoutMs = DEFAULT_TIMEOUT) {
        return new Promise((resolve, reject) => {
            if (!state.socket || !state.connected) {
                reject(new Error('socket_unavailable'));
                return;
            }

            const body = { ...payload, requestId: payload.requestId || requestId() };
            state.socket.timeout(timeoutMs).emit(eventName, body, (error, response) => {
                if (error) {
                    reject(new Error('socket_timeout'));
                    return;
                }
                if (!response?.ok) {
                    reject(new Error(response?.error || 'socket_error'));
                    return;
                }
                resolve(response.data);
            });
        });
    }

    async function connect() {
        if (state.socket?.connected) return state.socket;
        if (state.connecting) return state.socket;

        const url = getBackendUrl();
        if (!url || !window.io) throw new Error('multiplayer_config_missing');

        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('authentication_required');

        state.connecting = true;
        state.socket = window.io(url, {
            auth: { accessToken },
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 8
        });

        state.socket.on('connect', () => {
            state.connected = true;
            state.connecting = false;
            document.dispatchEvent(new CustomEvent('memoriz:multiplayer-network', { detail: { connected: true } }));
        });
        state.socket.on('disconnect', () => {
            state.connected = false;
            document.dispatchEvent(new CustomEvent('memoriz:multiplayer-network', { detail: { connected: false } }));
        });
        state.socket.on('connect_error', error => {
            state.connected = false;
            state.connecting = false;
            state.lastError = error?.message || 'socket_error';
            document.dispatchEvent(new CustomEvent('memoriz:multiplayer-error', { detail: { error: state.lastError } }));
        });

        await new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error('socket_timeout')), DEFAULT_TIMEOUT);
            state.socket.once('connect', () => {
                window.clearTimeout(timer);
                resolve();
            });
            state.socket.once('connect_error', error => {
                window.clearTimeout(timer);
                reject(error);
            });
        });

        return state.socket;
    }

    function on(eventName, handler) {
        state.socket?.on(eventName, handler);
    }

    function disconnect() {
        state.socket?.disconnect();
        state.socket = null;
        state.connected = false;
        state.connecting = false;
    }

    function getState() {
        return { connected: state.connected, connecting: state.connecting, lastError: state.lastError };
    }

    window.MemorizMultiplayerSocket = {
        connect,
        disconnect,
        emitWithAck,
        on,
        getState,
        _requestId: requestId
    };
})();
