/**
 * Memoriz - Module Multijoueur
 * Remplace le fichier multiplayer.js incomplet du repo.
 * Gère l'interface de salon, la partie, le classement final et le fallback.
 */
(function() {
  'use strict';

  // ===================== ÉTAT =====================
  const state = {
    current: null,
    startGamePending: false,
    modalOpen: false,
    activeTab: 'create'
  };

  // ===================== UTILITAIRES DOM =====================
  function byId(id) {
    return document.getElementById(id);
  }

  function els() {
    return {
      modal: byId('multiplayer-modal'),
      // Onglets
      tabCreate: byId('multiplayer-tab-create'),
      tabJoin: byId('multiplayer-tab-join'),
      panelCreate: byId('multiplayer-panel-create'),
      panelJoin: byId('multiplayer-panel-join'),
      // Créer
      createCategory: byId('multiplayer-create-category'),
      createBtn: byId('multiplayer-create-btn'),
      // Rejoindre
      joinCode: byId('multiplayer-join-code'),
      joinBtn: byId('multiplayer-join-btn'),
      // Lobby
      lobbyView: byId('multiplayer-lobby'),
      codeDisplay: byId('multiplayer-code'),
      categoryLabel: byId('multiplayer-category'),
      countLabel: byId('multiplayer-count'),
      hostLabel: byId('multiplayer-host'),
      players: byId('multiplayer-players'),
      startGame: byId('multiplayer-start-btn'),
      ready: byId('multiplayer-ready-btn'),
      leaveLobby: byId('multiplayer-leave-lobby-btn'),
      // Jeu
      gameView: byId('multiplayer-game'),
      answerInput: byId('multiplayer-answer-input'),
      answerGrid: byId('multiplayer-answer-grid'),
      scoreLive: byId('multiplayer-score-live'),
      progressLive: byId('multiplayer-progress-live'),
      timer: byId('multiplayer-timer'),
      found: byId('multiplayer-found'),
      scoreboard: byId('multiplayer-scoreboard'),
      reactions: byId('multiplayer-reactions'),
      leaveGame: byId('multiplayer-leave-game-btn'),
      // Final
      finalView: byId('multiplayer-final'),
      finalRanking: byId('multiplayer-final-ranking'),
      finalCode: byId('multiplayer-final-code'),
      playAgain: byId('multiplayer-play-again'),
      closeFinal: byId('multiplayer-close-final'),
      // Statut
      status: byId('multiplayer-status'),
      // Fallback
      fallback: byId('multiplayer-fallback')
    };
  }

  // ===================== DONNÉES QUIZ =====================
  function totalAnswers(categoryId) {
    const mapping = window.categoryMapping?.[categoryId];
    if (mapping?.data) return mapping.data.length;
    const data = window.quizData?.[categoryId];
    return data?.length || 0;
  }

  function categoryLabel(categoryId) {
    const mapping = window.categoryMapping?.[categoryId];
    if (mapping?.title) return mapping.title;
    return categoryId || 'Inconnu';
  }

  // ===================== CACHE =====================
  const CACHE_KEY = 'memoriz_multiplayer_game';

  function cacheGame(gameCode) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ gameCode, ts: Date.now() }));
    } catch (e) { /* ignore */ }
  }

  function getCachedGame() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Expire après 2h
      if (Date.now() - parsed.ts > 2 * 60 * 60 * 1000) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
      return parsed.gameCode;
    } catch (e) {
      return null;
    }
  }

  function clearCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* ignore */ }
  }

  // ===================== VUES =====================
  function showView(viewName) {
    const nodes = els();
    const views = ['lobbyView', 'gameView', 'finalView', 'fallback'];
    views.forEach(v => {
      if (nodes[v]) nodes[v].hidden = true;
    });
    const target = viewName === 'lobby' ? nodes.lobbyView
                 : viewName === 'game' ? nodes.gameView
                 : viewName === 'final' ? nodes.finalView
                 : nodes.fallback;
    if (target) target.hidden = false;
  }

  function setStatus(msg) {
    const nodes = els();
    if (nodes.status) nodes.status.textContent = msg || '';
  }

  // ===================== RENDU JOUEURS =====================
  function currentPlayer(snapshot) {
    if (!snapshot?.players) return null;
    const api = getApi();
    const userId = api?.client?.auth?.currentSession?.user?.id
                || api?.client?.auth?.session()?.user?.id;
    return snapshot.players.find(p => p.userId === userId) || null;
  }

  function playerItem(player) {
    const div = document.createElement('div');
    div.className = 'multiplayer-player-item';
    const readyIcon = player.isReady ? '✅' : '⏳';
    const hostIcon = player.isHost ? '👑 ' : '';
    div.textContent = `${hostIcon}${player.pseudo || 'Anonyme'} ${readyIcon}`;
    if (player.isHost) div.classList.add('is-host');
    if (player.isReady) div.classList.add('is-ready');
    return div;
  }

  function scoreItem(player) {
    const div = document.createElement('div');
    div.className = 'multiplayer-score-item';
    const rank = player.rank ? `#${player.rank} ` : '';
    div.textContent = `${rank}${player.pseudo || 'Anonyme'} — ${player.score || 0} pts (${player.correctAnswers || 0} bonnes réponses)`;
    if (player.isHost) div.classList.add('is-host');
    return div;
  }

  function foundItem(answer) {
    const div = document.createElement('div');
    div.className = 'multiplayer-found-item';
    div.textContent = answer.display || answer.answer || '???';
    return div;
  }

  // ===================== BOUTONS =====================
  function updateStartButton(snapshot, current) {
    const nodes = els();
    if (!nodes.startGame) return;
    const canStart = snapshot.status === 'waiting'
      && current?.isHost
      && snapshot.currentPlayers >= 2
      && snapshot.players?.every(p => p.isReady || p.isHost);
    nodes.startGame.disabled = !canStart || state.startGamePending;
    nodes.startGame.textContent = state.startGamePending ? 'Lancement…' : 'Lancer la partie';
  }

  function resetStartGamePending() {
    state.startGamePending = false;
    const nodes = els();
    if (nodes.startGame) nodes.startGame.textContent = 'Lancer la partie';
  }

  function renderTimer(snapshot) {
    const nodes = els();
    if (!nodes.timer) return;
    if (snapshot.status === 'playing' && snapshot.endsAt) {
      const remaining = Math.max(0, Math.ceil((new Date(snapshot.endsAt).getTime() - Date.now()) / 1000));
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      nodes.timer.textContent = `⏱️ ${m}:${s.toString().padStart(2, '0')}`;
    } else if (snapshot.status === 'waiting') {
      nodes.timer.textContent = 'En attente…';
    } else {
      nodes.timer.textContent = '';
    }
  }

  function showFinal(snapshot) {
    showView('final');
    setStatus('Partie terminée !');
    const nodes = els();
    if (nodes.finalCode) nodes.finalCode.textContent = snapshot.gameCode || '';
  }

  // ===================== RENDU GRILLE RÉPONSES =====================
  function renderAnswerGrid(snapshot) {
    const nodes = els();
    if (!nodes.answerGrid) return;
    const total = totalAnswers(snapshot.categoryId);
    const found = new Map((snapshot.allFoundAnswers || []).map(a => [Number(a.displayOrder), a]));
    const tbody = nodes.answerGrid.querySelector('tbody') || nodes.answerGrid;
    tbody.replaceChildren();
    for (let i = 1; i <= total; i++) {
      const answer = found.get(i);
      const row = document.createElement('tr');
      row.className = answer ? 'multiplayer-answer-row is-found' : 'multiplayer-answer-row';
      const rank = document.createElement('td');
      rank.textContent = String(i);
      const display = document.createElement('td');
      display.textContent = answer?.display || '???';
      const status = document.createElement('td');
      status.textContent = answer ? '✓' : '⏳';
      row.append(rank, display, status);
      tbody.append(row);
    }
  }

  // ===================== RENDU ÉTAT GLOBAL =====================
  function renderState(snapshot) {
    if (!snapshot) return;

    // Fallback gameCode depuis l'état local si absent du snapshot
    if (!snapshot.gameCode && state.current?.gameCode) {
      snapshot = { ...snapshot, gameCode: state.current.gameCode };
    }
    if (!snapshot?.gameCode) return;

    const previousGameCode = state.current?.gameCode;
    if ((previousGameCode && previousGameCode !== snapshot.gameCode) || snapshot.status !== 'waiting') {
      resetStartGamePending();
    }

    state.current = snapshot;
    cacheGame(snapshot.gameCode);

    const nodes = els();
    const current = currentPlayer(snapshot);
    const host = snapshot.players?.find(p => p.isHost) || null;

    if (nodes.codeDisplay) nodes.codeDisplay.textContent = snapshot.gameCode;
    if (nodes.categoryLabel) nodes.categoryLabel.textContent = categoryLabel(snapshot.categoryId);
    if (nodes.countLabel) nodes.countLabel.textContent = `${snapshot.currentPlayers || 0}/${snapshot.maxPlayers || 4} joueurs`;
    if (nodes.hostLabel) nodes.hostLabel.textContent = host ? `Hôte: ${host.pseudo}` : 'Hôte indisponible';
    if (nodes.players) nodes.players.replaceChildren(...(snapshot.players || []).map(playerItem));
    if (nodes.scoreboard) nodes.scoreboard.replaceChildren(...(snapshot.players || []).map(scoreItem));
    if (nodes.finalRanking) nodes.finalRanking.replaceChildren(...(snapshot.players || []).map(scoreItem));
    if (nodes.found) nodes.found.replaceChildren(...(snapshot.allFoundAnswers || []).map(foundItem));

    renderAnswerGrid(snapshot);
    updateStartButton(snapshot, current);

    if (nodes.ready) nodes.ready.textContent = current?.isReady ? 'Annuler prêt' : 'Prêt';
    if (nodes.scoreLive) nodes.scoreLive.textContent = current ? `Ton score: ${current.score || 0} pts` : '';
    if (nodes.progressLive) {
      const total = totalAnswers(snapshot.categoryId);
      const found = Number(current?.correctAnswers || 0);
      const percent = total ? Math.round((found / total) * 100) : 0;
      nodes.progressLive.textContent = total ? `Ta progression: ${found}/${total} (${percent}%)` : '';
    }

    if (window.MemorizReactions?.setDisabled) {
      window.MemorizReactions.setDisabled(nodes.reactions, snapshot.status !== 'waiting' && snapshot.status !== 'playing');
    }

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

  // ===================== API SUPABASE =====================
  function getApi() {
    try {
      return window.MemorizProfileApi?.init(window.MEMORIZ_SUPABASE_CONFIG || {});
    } catch (e) {
      return null;
    }
  }

  // ===================== SOCKET EVENTS =====================
  function bindSocketEvents() {
    const socket = window.MemorizMultiplayerSocket;
    if (!socket) return;

    socket.on('gameState', (snapshot) => renderState(snapshot));
    socket.on('gameCreated', (snapshot) => renderState(snapshot));
    socket.on('playerJoined', (snapshot) => renderState(snapshot));
    socket.on('playerUpdated', (snapshot) => renderState(snapshot));
    socket.on('gameStarted', (snapshot) => {
      state.startGamePending = false;
      renderState(snapshot);
    });
    socket.on('scoreUpdate', (snapshot) => renderState(snapshot));
    socket.on('gameFinished', (snapshot) => renderState(snapshot));
    socket.on('playerLeft', (snapshot) => renderState(snapshot));
    socket.on('playerDisconnected', (snapshot) => renderState(snapshot));
  }

  // ===================== ACTIONS =====================
  async function createGame() {
    const nodes = els();
    const categoryId = nodes.createCategory?.value;
    if (!categoryId) {
      setStatus('Veuillez choisir une catégorie.');
      return;
    }
    try {
      setStatus('Création du salon…');
      const socket = await ensureConnected();
      const result = await window.MemorizMultiplayerSocket.emitWithAck('createGame', {
        categoryId,
        maxPlayers: 4,
        timeLimitSeconds: 300
      });
      if (result?.created?.game_code) {
        state.current = { gameCode: result.created.game_code };
        renderState(result.snapshot);
      }
    } catch (err) {
      setStatus(`Erreur: ${err.message || 'Impossible de créer le salon'}`);
    }
  }

  async function joinGame() {
    const nodes = els();
    const code = nodes.joinCode?.value?.trim().toUpperCase();
    if (!code) {
      setStatus('Veuillez saisir un code de partie.');
      return;
    }
    try {
      setStatus('Connexion au salon…');
      const socket = await ensureConnected();
      const result = await window.MemorizMultiplayerSocket.emitWithAck('joinGame', { gameCode: code });
      if (result?.joined) {
        state.current = { gameCode: code };
        renderState(result.snapshot);
      }
    } catch (err) {
      setStatus(`Erreur: ${err.message || 'Impossible de rejoindre le salon'}`);
    }
  }

  async function setReady() {
    if (!state.current?.gameCode) return;
    try {
      const result = await window.MemorizMultiplayerSocket.emitWithAck('setReady', {
        gameCode: state.current.gameCode,
        isReady: !(currentPlayer(state.current)?.isReady)
      });
      if (result?.snapshot) renderState(result.snapshot);
    } catch (err) {
      setStatus(`Erreur: ${err.message || 'Action impossible'}`);
    }
  }

  async function startGame() {
    if (!state.current?.gameCode) return;
    state.startGamePending = true;
    updateStartButton(state.current, currentPlayer(state.current));
    try {
      const result = await window.MemorizMultiplayerSocket.emitWithAck('startGame', {
        gameCode: state.current.gameCode
      });
      if (result?.snapshot) renderState(result.snapshot);
    } catch (err) {
      state.startGamePending = false;
      setStatus(`Erreur: ${err.message || 'Lancement impossible'}`);
    }
  }

  async function submitAnswer() {
    const nodes = els();
    const input = nodes.answerInput;
    if (!input || !state.current?.gameCode) return;
    const answer = input.value.trim();
    if (!answer) return;
    input.value = '';
    try {
      await window.MemorizMultiplayerSocket.emitWithAck('submitAnswer', {
        gameCode: state.current.gameCode,
        answer
      });
    } catch (err) {
      setStatus(`Erreur: ${err.message || 'Réponse refusée'}`);
    }
  }

  async function leaveGame() {
    if (!state.current?.gameCode) {
      close();
      return;
    }
    try {
      await window.MemorizMultiplayerSocket.emitWithAck('leaveGame', {
        gameCode: state.current.gameCode
      });
    } catch (err) {
      // ignore
    }
    clearCache();
    state.current = null;
    close();
  }

  async function reconnect() {
    const code = getCachedGame();
    if (!code) return;
    try {
      setStatus('Reconnexion…');
      await ensureConnected();
      const result = await window.MemorizMultiplayerSocket.emitWithAck('requestGameState', {
        gameCode: code
      });
      if (result) {
        state.current = { gameCode: code };
        renderState(result);
      }
    } catch (err) {
      clearCache();
    }
  }

  // ===================== CONNEXION =====================
  async function ensureConnected() {
    const socketState = window.MemorizMultiplayerSocket?.getState?.();
    if (socketState?.connected) return window.MemorizMultiplayerSocket;
    try {
      return await window.MemorizMultiplayerSocket.connect();
    } catch (err) {
      throw new Error('multiplayer_unavailable');
    }
  }

  // ===================== MODALE =====================
  function populateCategories() {
    const nodes = els();
    if (!nodes.createCategory) return;
    nodes.createCategory.replaceChildren();
    const mapping = window.categoryMapping || {};
    Object.entries(mapping).forEach(([key, info]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = info.title || key;
      nodes.createCategory.append(opt);
    });
  }

  function switchTab(tab) {
    state.activeTab = tab;
    const nodes = els();
    if (nodes.tabCreate) nodes.tabCreate.classList.toggle('is-active', tab === 'create');
    if (nodes.tabJoin) nodes.tabJoin.classList.toggle('is-active', tab === 'join');
    if (nodes.panelCreate) nodes.panelCreate.hidden = tab !== 'create';
    if (nodes.panelJoin) nodes.panelJoin.hidden = tab !== 'join';
  }

  function open() {
    const nodes = els();
    if (!nodes.modal) return;
    populateCategories();
    nodes.modal.hidden = false;
    nodes.modal.classList.add('is-open');
    state.modalOpen = true;
    switchTab(state.activeTab);
    bindSocketEvents();
    // Tente de reconnecter une partie en cache
    reconnect().catch(() => {});
  }

  function close() {
    const nodes = els();
    if (!nodes.modal) return;
    nodes.modal.hidden = true;
    nodes.modal.classList.remove('is-open');
    state.modalOpen = false;
    state.current = null;
    showView('lobby');
  }

  // ===================== BINDINGS =====================
  function bindEvents() {
    const nodes = els();

    // Onglets
    nodes.tabCreate?.addEventListener('click', () => switchTab('create'));
    nodes.tabJoin?.addEventListener('click', () => switchTab('join'));

    // Créer
    nodes.createBtn?.addEventListener('click', createGame);

    // Rejoindre
    nodes.joinBtn?.addEventListener('click', joinGame);
    nodes.joinCode?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') joinGame();
    });

    // Lobby
    nodes.ready?.addEventListener('click', setReady);
    nodes.startGame?.addEventListener('click', startGame);
    nodes.leaveLobby?.addEventListener('click', leaveGame);

    // Jeu
    nodes.answerInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitAnswer();
    });
    nodes.leaveGame?.addEventListener('click', leaveGame);

    // Final
    nodes.playAgain?.addEventListener('click', () => {
      clearCache();
      state.current = null;
      switchTab('create');
      showView('lobby');
    });
    nodes.closeFinal?.addEventListener('click', close);

    // Fermer modale via backdrop
    nodes.modal?.addEventListener('click', (e) => {
      if (e.target === nodes.modal && !state.current?.gameCode) {
        close();
      }
    });

    // Écouter les erreurs réseau
    document.addEventListener('memoriz:multiplayer-error', (e) => {
      setStatus(`Réseau: ${e.detail?.error || 'déconnecté'}`);
    });

    // Écouter les connexions
    document.addEventListener('memoriz:multiplayer-network', (e) => {
      if (e.detail?.connected) {
        setStatus('Connecté au serveur multijoueur.');
      }
    });
  }

  // ===================== INIT =====================
  function init() {
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ===================== API GLOBALE =====================
  window.MemorizMultiplayer = {
    open,
    close,
    getState: () => ({ ...state }),
    createGame,
    joinGame,
    setReady,
    startGame,
    submitAnswer,
    leaveGame
  };
})();
