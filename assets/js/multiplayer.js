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
      // Modale
      modal: byId('multiplayer-modal'),
      closeBtn: byId('multiplayer-close'),
      title: byId('multiplayer-title'),
      status: byId('multiplayer-status'),
      // Onglets
      tabCreate: byId('multiplayer-tab-create'),
      tabJoin: byId('multiplayer-tab-join'),
      panelCreate: byId('multiplayer-create-panel'),
      panelJoin: byId('multiplayer-join-panel'),
      // Créer
      createCategory: byId('multiplayer-category'),
      createMaxPlayers: byId('multiplayer-max-players'),
      createBtn: byId('multiplayer-create'),
      // Rejoindre
      joinCode: byId('multiplayer-code-input'),
      joinBtn: byId('multiplayer-join'),
      // Lobby
      lobbyView: byId('multiplayer-lobby'),
      lobbyTitle: byId('multiplayer-lobby-title'),
      codeDisplay: byId('multiplayer-code-display'),
      copyCodeBtn: byId('multiplayer-copy-code'),
      categoryLabel: byId('multiplayer-category-label'),
      countLabel: byId('multiplayer-count-label'),
      hostLabel: byId('multiplayer-host-label'),
      players: byId('multiplayer-players'),
      readyBtn: byId('multiplayer-ready'),
      startBtn: byId('multiplayer-start'),
      leaveLobbyBtn: byId('multiplayer-leave'),
      startHint: byId('multiplayer-start-hint'),
      // Jeu
      gameView: byId('multiplayer-game'),
      gameTitle: byId('multiplayer-game-title'),
      answerForm: byId('multiplayer-answer-form'),
      answerInput: byId('multiplayer-answer-input'),
      answerGrid: byId('multiplayer-answer-grid'),
      scoreLive: byId('multiplayer-score-live'),
      progressLive: byId('multiplayer-progress-live'),
      timer: byId('multiplayer-timer'),
      foundList: byId('multiplayer-found-list'),
      scoreboard: byId('multiplayer-scoreboard'),
      reactions: byId('multiplayer-reactions'),
      // Final
      finalView: byId('multiplayer-final'),
      finalTitle: byId('multiplayer-final-title'),
      finalRanking: byId('multiplayer-final-ranking'),
      closeFinalBtn: byId('multiplayer-final-close')
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
    const views = ['lobbyView', 'gameView', 'finalView'];
    views.forEach(v => {
      if (nodes[v]) nodes[v].hidden = true;
    });
    // Masquer aussi les panels portail
    if (nodes.panelCreate) nodes.panelCreate.hidden = true;
    if (nodes.panelJoin) nodes.panelJoin.hidden = true;

    const target = viewName === 'lobby' ? nodes.lobbyView
                 : viewName === 'game' ? nodes.gameView
                 : viewName === 'final' ? nodes.finalView
                 : null;
    if (target) {
      target.hidden = false;
    } else if (viewName === 'portal') {
      // Retour aux onglets créer/rejoindre
      switchTab(state.activeTab);
    }
  }

  function setStatus(msg) {
    const nodes = els();
    if (nodes.status) nodes.status.textContent = msg || '';
  }

  // ===================== RENDU JOUEURS =====================
  function currentPlayer(snapshot) {
    if (!snapshot?.players) return null;
    const api = getApi();
    const session = api?.client?.auth?.getSession?.();
    const userId = session?.data?.session?.user?.id
                || api?.client?.auth?.currentSession?.user?.id;
    return snapshot.players.find(p => p.userId === userId || p.id === userId) || null;
  }

  function playerItem(player) {
    const li = document.createElement('li');
    li.className = 'multiplayer-player-item';
    const readyIcon = player.isReady ? '✅' : '⏳';
    const hostIcon = player.isHost ? '👑 ' : '';
    li.textContent = `${hostIcon}${player.pseudo || 'Anonyme'} ${readyIcon}`;
    if (player.isHost) li.classList.add('is-host');
    if (player.isReady) li.classList.add('is-ready');
    return li;
  }

  function scoreItem(player) {
    const li = document.createElement('li');
    li.className = 'multiplayer-score-item';
    const rank = player.rank ? `#${player.rank} ` : '';
    li.textContent = `${rank}${player.pseudo || 'Anonyme'} — ${player.score || 0} pts (${player.correctAnswers || 0} bonnes réponses)`;
    if (player.isHost) li.classList.add('is-host');
    return li;
  }

  function foundItem(answer) {
    const li = document.createElement('li');
    li.className = 'multiplayer-found-item';
    li.textContent = answer.display || answer.answer || '???';
    return li;
  }

  // ===================== BOUTONS =====================
  function updateStartButton(snapshot, current) {
    const nodes = els();
    if (!nodes.startBtn) return;
    const canStart = snapshot.status === 'waiting'
      && current?.isHost
      && snapshot.currentPlayers >= 2
      && snapshot.players?.every(p => p.isReady || p.isHost);
    nodes.startBtn.hidden = !canStart;
    nodes.startBtn.disabled = state.startGamePending;
    nodes.startBtn.textContent = state.startGamePending ? 'Lancement…' : 'Lancer la partie';

    if (nodes.startHint) {
      if (canStart) {
        nodes.startHint.textContent = '';
      } else if (snapshot.currentPlayers < 2) {
        nodes.startHint.textContent = 'Attends au moins un autre joueur.';
      } else if (!snapshot.players?.every(p => p.isReady || p.isHost)) {
        nodes.startHint.textContent = 'Tous les joueurs doivent être prêts.';
      } else {
        nodes.startHint.textContent = '';
      }
    }
  }

  function resetStartGamePending() {
    state.startGamePending = false;
    const nodes = els();
    if (nodes.startBtn) nodes.startBtn.textContent = 'Lancer la partie';
  }

  function renderTimer(snapshot) {
    const nodes = els();
    if (!nodes.timer) return;
    if (snapshot.status === 'playing' && snapshot.endsAt) {
      const remaining = Math.max(0, Math.ceil((new Date(snapshot.endsAt).getTime() - Date.now()) / 1000));
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      nodes.timer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    } else if (snapshot.status === 'waiting') {
      nodes.timer.textContent = '--:--';
    } else {
      nodes.timer.textContent = '--:--';
    }
  }

  function showFinal(snapshot) {
    showView('final');
    setStatus('Partie terminée !');
    const nodes = els();
    if (nodes.finalTitle) nodes.finalTitle.textContent = 'Classement final — ' + (snapshot.gameCode || '');
  }

  // ===================== RENDU GRILLE RÉPONSES =====================
  function renderAnswerGrid(snapshot) {
    const nodes = els();
    if (!nodes.answerGrid) return;
    const total = totalAnswers(snapshot.categoryId);
    const found = new Map((snapshot.allFoundAnswers || []).map(a => [Number(a.displayOrder), a]));
    nodes.answerGrid.replaceChildren();
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
      nodes.answerGrid.append(row);
    }
  }

  // ===================== RENDU ÉTAT GLOBAL =====================
  function renderState(snapshot) {
    if (!snapshot) return;

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
    if (nodes.foundList) nodes.foundList.replaceChildren(...(snapshot.allFoundAnswers || []).map(foundItem));

    renderAnswerGrid(snapshot);
    updateStartButton(snapshot, current);

    if (nodes.readyBtn) nodes.readyBtn.textContent = current?.isReady ? 'Annuler prêt' : 'Prêt';
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
    const maxPlayers = parseInt(nodes.createMaxPlayers?.value || '4', 10);
    if (!categoryId) {
      setStatus('Veuillez choisir une catégorie.');
      return;
    }
    try {
      setStatus('Création du salon…');
      await ensureConnected();
      const result = await window.MemorizMultiplayerSocket.emitWithAck('createGame', {
        categoryId,
        maxPlayers,
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
      await ensureConnected();
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
      const current = currentPlayer(state.current);
      const result = await window.MemorizMultiplayerSocket.emitWithAck('setReady', {
        gameCode: state.current.gameCode,
        isReady: !current?.isReady
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
    const currentVal = nodes.createCategory.value;
    nodes.createCategory.replaceChildren();
    const mapping = window.categoryMapping || {};
    Object.entries(mapping).forEach(([key, info]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = info.title || key;
      nodes.createCategory.append(opt);
    });
    if (currentVal && mapping[currentVal]) {
      nodes.createCategory.value = currentVal;
    }
  }

  function switchTab(tab) {
    state.activeTab = tab;
    const nodes = els();
    if (nodes.tabCreate) {
      nodes.tabCreate.classList.toggle('is-active', tab === 'create');
      nodes.tabCreate.setAttribute('aria-selected', tab === 'create' ? 'true' : 'false');
    }
    if (nodes.tabJoin) {
      nodes.tabJoin.classList.toggle('is-active', tab === 'join');
      nodes.tabJoin.setAttribute('aria-selected', tab === 'join' ? 'true' : 'false');
    }
    if (nodes.panelCreate) nodes.panelCreate.hidden = tab !== 'create';
    if (nodes.panelJoin) nodes.panelJoin.hidden = tab !== 'join';
  }

  function open() {
    const nodes = els();
    if (!nodes.modal) return;
    populateCategories();
    nodes.modal.hidden = false;
    nodes.modal.setAttribute('aria-hidden', 'false');
    nodes.modal.classList.add('is-open');
    state.modalOpen = true;
    switchTab(state.activeTab);
    bindSocketEvents();
    reconnect().catch(() => {});
  }

  function close() {
    const nodes = els();
    if (!nodes.modal) return;
    nodes.modal.hidden = true;
    nodes.modal.setAttribute('aria-hidden', 'true');
    nodes.modal.classList.remove('is-open');
    state.modalOpen = false;
    state.current = null;
    showView('portal');
    setStatus('Connecte ton profil pour jouer à plusieurs.');
  }

  // ===================== BINDINGS =====================
  function bindEvents() {
    const nodes = els();

    // Fermer modale
    nodes.closeBtn?.addEventListener('click', () => {
      if (!state.current?.gameCode) close();
      else leaveGame();
    });

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

    // Copier code
    nodes.copyCodeBtn?.addEventListener('click', () => {
      const code = nodes.codeDisplay?.textContent;
      if (code) {
        navigator.clipboard?.writeText(code).then(() => {
          setStatus('Code copié !');
          setTimeout(() => setStatus('Lobby synchronisé.'), 1500);
        }).catch(() => {});
      }
    });

    // Lobby
    nodes.readyBtn?.addEventListener('click', setReady);
    nodes.startBtn?.addEventListener('click', startGame);
    nodes.leaveLobbyBtn?.addEventListener('click', leaveGame);

    // Jeu
    nodes.answerForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      submitAnswer();
    });
    nodes.leaveLobbyBtn?.addEventListener('click', leaveGame);

    // Final
    nodes.closeFinalBtn?.addEventListener('click', close);

    // Fermer modale via backdrop (clic hors du contenu)
    nodes.modal?.addEventListener('click', (e) => {
      if (e.target === nodes.modal && !state.current?.gameCode) {
        close();
      }
    });

    // Écouter les erreurs réseau
    document.addEventListener('memoriz:multiplayer-error', (e) => {
      setStatus(`Réseau: ${e.detail?.error || 'déconnecté'}`);
    });

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
