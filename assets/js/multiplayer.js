(function() {
    const CACHE_KEY = 'memoriz_multiplayer_game';

    const state = {
        profile: null,
        current: null,
        timerId: null,
        lastFocus: null,
        submitting: false,
        startGamePending: false,
        retryAfterProfileRequired: false,
        reconnectingAfterProfile: false
    };

    const CONNECTION_MESSAGES = {
        multiplayer_config_missing: 'La configuration du serveur multijoueur est absente.',
        authentication_required: 'La session doit être disponible avant d’utiliser le multijoueur.',
        profile_required: 'Ton profil doit être chargé avant d’utiliser le multijoueur.',
        socket_timeout: 'Le serveur multijoueur ne répond pas pour le moment.',
        websocket_error: 'La connexion multijoueur est refusée pour le moment.',
        socket_error: 'Le multijoueur est temporairement indisponible.'
    };

    function els() {
        return {
            open: document.getElementById('multiplayer-open'),
            modal: document.getElementById('multiplayer-modal'),
            close: document.getElementById('multiplayer-close'),
            status: document.getElementById('multiplayer-status'),
            tabCreate: document.getElementById('multiplayer-tab-create'),
            tabJoin: document.getElementById('multiplayer-tab-join'),
            createPanel: document.getElementById('multiplayer-create-panel'),
            joinPanel: document.getElementById('multiplayer-join-panel'),
            category: document.getElementById('multiplayer-category'),
            maxPlayers: document.getElementById('multiplayer-max-players'),
            create: document.getElementById('multiplayer-create'),
            codeInput: document.getElementById('multiplayer-code-input'),
            join: document.getElementById('multiplayer-join'),
            lobby: document.getElementById('multiplayer-lobby'),
            game: document.getElementById('multiplayer-game'),
            final: document.getElementById('multiplayer-final'),
            codeDisplay: document.getElementById('multiplayer-code-display'),
            copy: document.getElementById('multiplayer-copy-code'),
            categoryLabel: document.getElementById('multiplayer-category-label'),
            countLabel: document.getElementById('multiplayer-count-label'),
            hostLabel: document.getElementById('multiplayer-host-label'),
            players: document.getElementById('multiplayer-players'),
            ready: document.getElementById('multiplayer-ready'),
            start: document.getElementById('multiplayer-start'),
            startHint: document.getElementById('multiplayer-start-hint'),
            leave: document.getElementById('multiplayer-leave'),
            timer: document.getElementById('multiplayer-timer'),
            scoreLive: document.getElementById('multiplayer-score-live'),
            progressLive: document.getElementById('multiplayer-progress-live'),
            scoreboard: document.getElementById('multiplayer-scoreboard'),
            form: document.getElementById('multiplayer-answer-form'),
            answer: document.getElementById('multiplayer-answer-input'),
            answerGrid: document.getElementById('multiplayer-answer-grid'),
            found: document.getElementById('multiplayer-found-list'),
            reactions: document.getElementById('multiplayer-reactions'),
            finalRanking: document.getElementById('multiplayer-final-ranking'),
            finalClose: document.getElementById('multiplayer-final-close')
        };
    }

    function setStatus(text) {
        const nodes = els();
        if (nodes.status) nodes.status.textContent = text;
    }

    function connectionErrorKey(error) {
        const key = error?.message || error?.detail?.error || window.MemorizMultiplayerSocket?.getState?.().lastError || '';
        if (key === 'websocket error') return 'websocket_error';
        return key || 'socket_error';
    }

    function describeConnectionError(error) {
        const key = connectionErrorKey(error);
        return CONNECTION_MESSAGES[key] || 'Erreur multijoueur inattendue.';
    }

    function cacheGame(gameCode) {
        if (!gameCode) return;
        localStorage.setItem(CACHE_KEY, JSON.stringify({ gameCode }));
    }

    function readCachedGame() {
        try {
            const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            return typeof parsed?.gameCode === 'string' ? parsed.gameCode : '';
        } catch (error) {
            return '';
        }
    }

    function clearCache() {
        localStorage.removeItem(CACHE_KEY);
    }

    function categoryLabel(categoryId) {
        const category = window.categoryMapping?.[categoryId];
        return category?.title || categoryId || 'Catégorie';
    }

    function totalAnswers(categoryId) {
        const category = window.categoryMapping?.[categoryId];
        return Array.isArray(category?.data) ? category.data.length : 0;
    }

    function populateCategories() {
        const nodes = els();
        if (!nodes.category || nodes.category.options.length) return;
        Object.entries(window.categoryMapping || {}).forEach(([id, category]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = category.title || id;
            nodes.category.append(option);
        });
    }

    function focusable(modal) {
        return [...modal.querySelectorAll('button, input, select, [href], [tabindex]:not([tabindex="-1"])')]
            .filter(element => !element.disabled && !element.hidden && element.getClientRects().length > 0);
    }

    async function ensureSocket() {
        await waitForProfile();
        await window.MemorizMultiplayerSocket.connect();
        bindSocketEvents();
    }

    async function waitForProfile() {
        if (state.profile) return state.profile;

        const auth = window.memorizAuth;
        let authState = auth?.getState?.();
        if (authState?.hasProfile && authState.profile) {
            state.profile = authState.profile;
            return state.profile;
        }

        if (typeof auth?.initProfile === 'function') {
            await auth.initProfile();
            authState = auth.getState?.();
            if (authState?.hasProfile && authState.profile) {
                state.profile = authState.profile;
                return state.profile;
            }
        }

        throw new Error('profile_required');
    }

    let socketEventsBound = false;
    function bindSocketEvents() {
        if (socketEventsBound) return;
        socketEventsBound = true;
        const socketApi = window.MemorizMultiplayerSocket;
        socketApi.on('gameState', renderState);
        socketApi.on('gameCreated', renderState);
        socketApi.on('playerJoined', renderState);
        socketApi.on('playerUpdated', renderState);
        socketApi.on('gameStarted', renderState);
        socketApi.on('scoreUpdate', renderState);
        socketApi.on('playerDisconnected', renderState);
        socketApi.on('playerLeft', refreshCurrentGame);
        socketApi.on('gameFinished', snapshot => {
            renderState(snapshot);
            showFinal(snapshot);
        });
        socketApi.on('gameExpired', snapshot => {
            renderState(snapshot);
            showFinal(snapshot);
        });
        socketApi.on('reactionReceived', event => window.MemorizReactions?.showReaction(event));
    }

    async function emit(eventName, payload) {
        await ensureSocket();
        return window.MemorizMultiplayerSocket.emitWithAck(eventName, payload);
    }

    async function refreshCurrentGame() {
        if (!state.current?.gameCode) return;
        try {
            const snapshot = await emit('requestGameState', { gameCode: state.current.gameCode });
            renderState(snapshot);
        } catch (error) {
            setStatus('La salle n’est plus disponible.');
            clearCache();
            state.current = null;
            showView('none');
        }
    }

    function showView(view) {
        const nodes = els();
        nodes.lobby.hidden = view !== 'lobby';
        nodes.game.hidden = view !== 'game';
        nodes.final.hidden = view !== 'final';
    }

    function playerItem(player) {
        const item = document.createElement('li');
        item.className = 'multiplayer-player';
        if (player.isCurrent) item.classList.add('is-current');

        const rank = document.createElement('span');
        rank.textContent = player.isHost ? 'Hôte' : `#${player.rank || '-'}`;
        const pseudo = document.createElement('strong');
        pseudo.textContent = player.pseudo || 'Joueur';
        const ready = document.createElement('span');
        ready.textContent = player.isReady ? 'Prêt' : 'En attente';
        const online = document.createElement('span');
        online.textContent = player.isConnected ? 'Connecté' : 'Déconnecté';
        item.append(rank, pseudo, ready, online);
        return item;
    }

    function scoreItem(player) {
        const item = document.createElement('li');
        item.className = 'multiplayer-score-row';
        if (player.isCurrent) item.classList.add('is-current');

        const rank = document.createElement('span');
        rank.textContent = `#${player.rank || '-'}`;
        const pseudo = document.createElement('strong');
        pseudo.textContent = player.pseudo || 'Joueur';
        const score = document.createElement('span');
        score.textContent = `${Number(player.score || 0)} pts`;
        const progress = document.createElement('span');
        progress.textContent = `${Number(player.correctAnswers || 0)} trouvées`;
        item.append(rank, pseudo, score, progress);
        return item;
    }

    function foundItem(answer) {
        const item = document.createElement('li');
        item.className = 'multiplayer-found-item';
        const order = document.createElement('span');
        order.textContent = `#${answer.displayOrder}`;
        const label = document.createElement('strong');
        label.textContent = answer.display || 'Réponse';
        const meta = document.createElement('span');
        meta.textContent = answer.answerYear || answer.hint || '';
        item.append(order, label, meta);
        return item;
    }

    function currentPlayer(snapshot) {
        return snapshot.players?.find(player => player.isCurrent) || null;
    }

    function currentUserIsHost(snapshot, current) {
        const profileId = state.profile?.id || window.memorizAuth?.getState?.().profile?.id || '';
        return Boolean(current?.isHost || (snapshot.hostId && profileId && snapshot.hostId === profileId));
    }

    function canStartGame(snapshot, current) {
        const players = snapshot.players || [];
        const connectedPlayers = players.filter(player => player.isConnected);
        return currentUserIsHost(snapshot, current)
            && snapshot.status === 'waiting'
            && connectedPlayers.length >= 2
            && connectedPlayers.every(player => player.isReady);
    }

    function startBlockedReason(snapshot, current) {
        if (!currentUserIsHost(snapshot, current)) return '';
        const players = snapshot.players || [];
        const connectedPlayers = players.filter(player => player.isConnected);
        if (snapshot.status !== 'waiting') return '';
        if (connectedPlayers.length < 2) return 'Il faut au moins 2 joueurs connectés.';
        if (!connectedPlayers.every(player => player.isReady)) return 'La partie démarre quand tous les joueurs connectés sont prêts.';
        return '';
    }

    function resetStartGamePending() {
        state.startGamePending = false;
    }

    function updateStartButton(snapshot, current) {
        const nodes = els();
        if (!nodes.start) return;
        const isHost = currentUserIsHost(snapshot, current);
        const canStart = canStartGame(snapshot, current);
        nodes.start.hidden = !isHost || snapshot.status !== 'waiting';
        nodes.start.disabled = state.startGamePending || !canStart;
        if (nodes.startHint) nodes.startHint.textContent = startBlockedReason(snapshot, current);
    }

    function renderAnswerGrid(snapshot) {
        const nodes = els();
        if (!nodes.answerGrid) return;
        const total = totalAnswers(snapshot.categoryId);
        const found = new Map((snapshot.myFoundAnswers || []).map(answer => [Number(answer.displayOrder), answer]));
        const cells = Array.from({ length: total }, (unused, index) => {
            const order = index + 1;
            const answer = found.get(order);
            const cell = document.createElement('span');
            cell.className = answer ? 'multiplayer-answer-cell is-found' : 'multiplayer-answer-cell';
            cell.textContent = answer?.display || String(order);
            return cell;
        });
        nodes.answerGrid.replaceChildren(...cells);
    }

    function renderTimer(snapshot) {
        const nodes = els();
        window.clearInterval(state.timerId);
        function tick() {
            const expiresAt = snapshot?.expiresAt ? new Date(snapshot.expiresAt).getTime() : 0;
            const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
            const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
            const seconds = String(remaining % 60).padStart(2, '0');
            if (nodes.timer) nodes.timer.textContent = `${minutes}:${seconds}`;
        }
        tick();
        if (snapshot?.status === 'playing') state.timerId = window.setInterval(tick, 1000);
    }

    function renderState(snapshot) {
        if (!snapshot?.gameCode) return;
        const previousGameCode = state.current?.gameCode;
        if ((previousGameCode && previousGameCode !== snapshot.gameCode) || snapshot.status !== 'waiting') {
            resetStartGamePending();
        }
        state.current = snapshot;
        cacheGame(snapshot.gameCode);
        const nodes = els();
        const current = currentPlayer(snapshot);
        const host = snapshot.players?.find(player => player.isHost) || null;

        nodes.codeDisplay.textContent = snapshot.gameCode;
        nodes.categoryLabel.textContent = categoryLabel(snapshot.categoryId);
        nodes.countLabel.textContent = `${snapshot.currentPlayers}/${snapshot.maxPlayers} joueurs`;
        nodes.hostLabel.textContent = host ? `Hôte: ${host.pseudo}` : 'Hôte indisponible';
        nodes.players.replaceChildren(...(snapshot.players || []).map(playerItem));
        nodes.scoreboard.replaceChildren(...(snapshot.players || []).map(scoreItem));
        nodes.finalRanking.replaceChildren(...(snapshot.players || []).map(scoreItem));
        nodes.found.replaceChildren(...(snapshot.myFoundAnswers || []).map(foundItem));
        renderAnswerGrid(snapshot);

        updateStartButton(snapshot, current);
        if (nodes.ready) nodes.ready.textContent = current?.isReady ? 'Annuler prêt' : 'Prêt';
        if (nodes.scoreLive) nodes.scoreLive.textContent = current ? `Ton score: ${current.score} pts` : '';
        if (nodes.progressLive) {
            const total = totalAnswers(snapshot.categoryId);
            const found = Number(current?.correctAnswers || 0);
            const percent = total ? Math.round((found / total) * 100) : 0;
            nodes.progressLive.textContent = total ? `Ta progression: ${found}/${total} (${percent}%)` : '';
        }
        window.MemorizReactions?.setDisabled(nodes.reactions, snapshot.status !== 'waiting' && snapshot.status !== 'playing');
        renderTimer(snapshot);

        if (snapshot.status === 'playing') {
            showView('game');
            setStatus('Partie en cours.');
        } else if (['finished', 'expired', 'cancelled'].includes(snapshot.status)) {
            showFinal(snapshot);
        } else {
            showView('lobby');
            setStatus('Lobby synchronisé.');
        }
    }

    function showFinal(snapshot) {
        showView('final');
        setStatus(snapshot?.status === 'expired' ? 'Partie expirée.' : 'Partie terminée.');
        clearCache();
        window.clearInterval(state.timerId);
        document.dispatchEvent(new CustomEvent('memoriz:quiz-finalized', { detail: { multiplayer: true } }));
    }

    async function openModal() {
        const nodes = els();
        state.lastFocus = document.activeElement;
        populateCategories();
        nodes.modal.hidden = false;
        nodes.modal.setAttribute('aria-hidden', 'false');
        window.setTimeout(() => nodes.close?.focus(), 0);
        setStatus('Connexion multijoueur...');
        try {
            await ensureSocket();
            setStatus('Choisis une catégorie ou rejoins un code.');
            const cached = readCachedGame();
            if (cached) {
                const snapshot = await emit('requestGameState', { gameCode: cached });
                renderState(snapshot);
            }
        } catch (error) {
            if (connectionErrorKey(error) === 'profile_required') state.retryAfterProfileRequired = true;
            setStatus(describeConnectionError(error));
        }
    }

    function closeModal() {
        resetStartGamePending();
        const nodes = els();
        nodes.modal.hidden = true;
        nodes.modal.setAttribute('aria-hidden', 'true');
        if (state.lastFocus?.focus) state.lastFocus.focus();
    }

    async function createGame() {
        const nodes = els();
        resetStartGamePending();
        nodes.create.disabled = true;
        try {
            const data = await emit('createGame', {
                categoryId: nodes.category.value,
                maxPlayers: Number(nodes.maxPlayers.value)
            });
            renderState(data.snapshot);
        } catch (error) {
            setStatus('Impossible de créer la partie.');
        } finally {
            nodes.create.disabled = false;
        }
    }

    async function joinGame() {
        const nodes = els();
        resetStartGamePending();
        nodes.join.disabled = true;
        try {
            const data = await emit('joinGame', { gameCode: nodes.codeInput.value });
            renderState(data.snapshot);
        } catch (error) {
            setStatus('Impossible de rejoindre cette partie.');
        } finally {
            nodes.join.disabled = false;
        }
    }

    async function setReady() {
        const current = state.current?.players?.find(player => player.isCurrent);
        try {
            const data = await emit('setReady', {
                gameCode: state.current.gameCode,
                ready: !current?.isReady
            });
            renderState(data.snapshot);
        } catch (error) {
            setStatus('Statut prêt non modifié.');
        }
    }

    async function startGame() {
        if (state.startGamePending) return;
        const current = currentPlayer(state.current || {});
        if (!canStartGame(state.current || {}, current)) return;

        state.startGamePending = true;
        updateStartButton(state.current, current);
        setStatus('Lancement...');
        try {
            const data = await emit('startGame', { gameCode: state.current.gameCode });
            renderState(data.snapshot);
        } catch (error) {
            setStatus('Démarrage refusé par le serveur.');
            resetStartGamePending();
            updateStartButton(state.current || {}, currentPlayer(state.current || {}));
        }
    }

    async function submitAnswer(event) {
        event.preventDefault();
        const nodes = els();
        const answer = nodes.answer.value.trim();
        if (!answer || state.submitting) return;
        state.submitting = true;
        nodes.answer.disabled = true;
        try {
            const data = await emit('submitAnswer', { gameCode: state.current.gameCode, answer });
            nodes.answer.value = '';
            renderState(data.snapshot);
            setStatus(data.result?.result === 'correct' ? 'Bonne réponse serveur.' : 'Réponse reçue.');
        } catch (error) {
            setStatus('Réponse refusée ou réseau indisponible.');
        } finally {
            state.submitting = false;
            nodes.answer.disabled = false;
            nodes.answer.focus();
        }
    }

    async function sendReaction(reactionType) {
        if (!state.current?.gameCode) return;
        try {
            await emit('sendReaction', { gameCode: state.current.gameCode, reactionType });
        } catch (error) {
            setStatus('Réaction temporairement limitée.');
        }
    }

    async function leaveGame() {
        if (!state.current?.gameCode) return;
        resetStartGamePending();
        try {
            await emit('leaveGame', { gameCode: state.current.gameCode });
        } catch (error) {
            setStatus('Départ non confirmé.');
        }
        clearCache();
        state.current = null;
        showView('none');
        setStatus('Tu as quitté la partie.');
    }

    function bind() {
        const nodes = els();
        if (!nodes.modal || !nodes.open) return;
        populateCategories();
        window.MemorizReactions?.render(nodes.reactions, sendReaction);
        nodes.open.addEventListener('click', openModal);
        nodes.close.addEventListener('click', closeModal);
        nodes.finalClose.addEventListener('click', closeModal);
        nodes.create.addEventListener('click', createGame);
        nodes.join.addEventListener('click', joinGame);
        nodes.ready.addEventListener('click', setReady);
        nodes.start.addEventListener('click', startGame);
        nodes.leave.addEventListener('click', leaveGame);
        nodes.form.addEventListener('submit', submitAnswer);
        nodes.copy.addEventListener('click', async () => {
            await navigator.clipboard?.writeText?.(state.current?.gameCode || '');
            setStatus('Code copié.');
        });
        nodes.tabCreate.addEventListener('click', () => {
            nodes.tabCreate.classList.add('is-active');
            nodes.tabJoin.classList.remove('is-active');
            nodes.tabCreate.setAttribute('aria-selected', 'true');
            nodes.tabJoin.setAttribute('aria-selected', 'false');
            nodes.createPanel.hidden = false;
            nodes.joinPanel.hidden = true;
        });
        nodes.tabJoin.addEventListener('click', () => {
            nodes.tabJoin.classList.add('is-active');
            nodes.tabCreate.classList.remove('is-active');
            nodes.tabJoin.setAttribute('aria-selected', 'true');
            nodes.tabCreate.setAttribute('aria-selected', 'false');
            nodes.joinPanel.hidden = false;
            nodes.createPanel.hidden = true;
        });
        nodes.modal.addEventListener('click', event => {
            if (event.target === nodes.modal) closeModal();
        });
        nodes.modal.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeModal();
            }
            if (event.key === 'Tab') {
                const items = focusable(nodes.modal);
                if (!items.length) return;
                event.preventDefault();
                const index = items.indexOf(document.activeElement);
                const direction = event.shiftKey ? -1 : 1;
                items[(index + direction + items.length) % items.length].focus();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', bind);
    document.addEventListener('memoriz:profile-ready', event => {
        state.profile = event.detail.profile;
        const nodes = els();
        if (nodes.open) nodes.open.disabled = false;
        if (!state.retryAfterProfileRequired || state.reconnectingAfterProfile || nodes.modal?.hidden) return;

        state.retryAfterProfileRequired = false;
        state.reconnectingAfterProfile = true;
        setStatus('Connexion multijoueur...');
        ensureSocket()
            .then(() => setStatus('Choisis une catégorie ou rejoins un code.'))
            .catch(error => {
                if (connectionErrorKey(error) === 'profile_required') state.retryAfterProfileRequired = true;
                setStatus(describeConnectionError(error));
            })
            .finally(() => {
                state.reconnectingAfterProfile = false;
            });
    });
    document.addEventListener('memoriz:profile-unavailable', () => {
        resetStartGamePending();
        state.profile = null;
        const nodes = els();
        if (nodes.open) nodes.open.disabled = true;
    });
    document.addEventListener('memoriz:multiplayer-network', event => {
        if (!event.detail?.connected) resetStartGamePending();
    });

    window.MemorizMultiplayer = { open: openModal, renderState, clearCache, startGame, getState: () => ({ ...state }) };
})();
