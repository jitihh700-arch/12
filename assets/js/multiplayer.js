/* Memoriz - Module Multijoueur (corrigé v3) */
(function() {
  'use strict';

  const state = {
    current: null,
    startGamePending: false,
    modalOpen: false,
    activeTab: 'create',
    listenersBound: false
  };

  function byId(id) { return document.getElementById(id); }

  function els() {
    return {
      modal: byId('multiplayer-modal'),
      closeBtn: byId('multiplayer-close'),
      status: byId('multiplayer-status'),
      tabCreate: byId('multiplayer-tab-create'),
      tabJoin: byId('multiplayer-tab-join'),
      panelCreate: byId('multiplayer-create-panel'),
      panelJoin: byId('multiplayer-join-panel'),
      createCategory: byId('multiplayer-category'),
      createMaxPlayers: byId('multiplayer-max-players'),
      createBtn: byId('multiplayer-create'),
      joinCode: byId('multiplayer-code-input'),
      joinBtn: byId('multiplayer-join'),
      lobbyView: byId('multiplayer-lobby'),
      codeDisplay: byId('multiplayer-code-display'),
      copyCodeBtn: byId('multiplayer-copy-code'),
      categoryLabel: byId('multiplayer-category-label'),
      countLabel: byId('multiplayer-count-label'),
      hostLabel: byId('multiplayer-host-label'),
      players: byId('multiplayer-players'),
      readyBtn: byId('multiplayer-ready'),
      startBtn: byId('multiplayer-start'),
      leaveBtn: byId('multiplayer-leave'),
      startHint: byId('multiplayer-start-hint'),
      gameView: byId('multiplayer-game'),
      answerForm: byId('multiplayer-answer-form'),
      answerInput: byId('multiplayer-answer-input'),
      answerGrid: byId('multiplayer-answer-grid'),
      scoreLive: byId('multiplayer-score-live'),
      progressLive: byId('multiplayer-progress-live'),
      timer: byId('multiplayer-timer'),
      foundList: byId('multiplayer-found-list'),
      scoreboard: byId('multiplayer-scoreboard'),
      reactions: byId('multiplayer-reactions'),
      finalView: byId('multiplayer-final'),
      finalRanking: byId('multiplayer-final-ranking'),
      closeFinalBtn: byId('multiplayer-final-close')
    };
  }

  function totalAnswers(cid) {
    const m = window.categoryMapping?.[cid];
    if (m?.data) return m.data.length;
    return window.quizData?.[cid]?.length || 0;
  }
  function catLabel(cid) {
    return window.categoryMapping?.[cid]?.title || cid || 'Inconnu';
  }

  const CACHE_KEY = 'memoriz_multiplayer_game';
  function cacheGame(code) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ gameCode: code, ts: Date.now() })); } catch(e){}
  }
  function getCachedGame() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (Date.now() - p.ts > 7200000) { localStorage.removeItem(CACHE_KEY); return null; }
      return p.gameCode;
    } catch(e){ return null; }
  }
  function clearCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch(e){}
  }

  function showView(name) {
    const n = els();
    [n.lobbyView, n.gameView, n.finalView].forEach(el => { if(el) el.hidden = true; });
    if (n.panelCreate) n.panelCreate.hidden = true;
    if (n.panelJoin) n.panelJoin.hidden = true;
    const target = name==='lobby'?n.lobbyView : name==='game'?n.gameView : name==='final'?n.finalView : null;
    if (target) target.hidden = false;
    else if (name==='portal') switchTab(state.activeTab);
  }

  function setStatus(msg) {
    const n = els();
    if (n.status) n.status.textContent = msg || '';
  }

  function answerResultMessage(result) {
    const key = typeof result === 'string' ? result : result?.result;
    return {
      correct: 'Bonne réponse !',
      incorrect: 'Mauvaise réponse.',
      duplicate: 'Tu as déjà trouvé cette réponse.',
      already_found_by_other: 'Cette réponse a déjà été trouvée par un autre joueur.',
      game_finished: 'La partie est déjà terminée.',
      expired: 'Le temps est écoulé.'
    }[key] || '';
  }

  // ===================== CORRECTION CLÉ : isCurrent =====================
  // Le backend calcule déjà isCurrent dans buildGameSnapshot.
  // On n'a PAS besoin de matcher un userId côté client.
  function currentPlayer(snap) {
    if (!snap?.players) return null;
    const profileId = window.memorizAuth?.getState?.()?.profile?.id || null;
    const player = snap.players.find(p => p.isCurrent === true)
      || snap.players.find(p => profileId && p.userId === profileId)
      || null;
    if (!player) return null;
    if (profileId && snap.hostId === profileId && player.isHost !== true) {
      return { ...player, isHost: true };
    }
    return player;
  }

  function playerItem(p) {
    const li = document.createElement('li');
    li.className = 'multiplayer-player-item';
    li.textContent = (p.isHost?'👑 ':'') + (p.pseudo||'Anonyme') + (p.isReady?' ✅':' ⏳');
    if(p.isHost) li.classList.add('is-host');
    if(p.isReady) li.classList.add('is-ready');
    return li;
  }
  function scoreItem(p) {
    const li = document.createElement('li');
    li.className = 'multiplayer-score-item';
    li.textContent = (p.rank?`#${p.rank} `:'') + (p.pseudo||'Anonyme') + ` — ${p.score||0} pts (${p.correctAnswers||0} bonnes)`;
    if(p.isHost) li.classList.add('is-host');
    return li;
  }
  function foundItem(a) {
    const li = document.createElement('li');
    li.className = 'multiplayer-found-item';
    li.textContent = a.display || a.answer || '???';
    return li;
  }

  // ===================== BOUTON LANCER (CORRIGÉ) =====================
  function updateStartButton(snap, cur) {
    const n = els();
    if (!n.startBtn) return;
    const isHost = cur?.isHost === true;
    const connectedPlayers = (snap.players || []).filter(p=>p.isConnected !== false);
    const enough = connectedPlayers.length >= 2;
    const allReady = connectedPlayers.every(p=>p.isReady||p.isHost);

    // Toujours visible pour l'hôte, hidden pour les autres
    n.startBtn.hidden = !isHost;
    n.startBtn.disabled = !(snap.status==='waiting' && enough && allReady) || state.startGamePending;
    n.startBtn.textContent = state.startGamePending ? 'Lancement…' : 'Lancer la partie';

    if (n.startHint) {
      if (!isHost) n.startHint.textContent = "Seul l'hôte peut lancer.";
      else if (!enough) n.startHint.textContent = `Attends un autre joueur connecté (${connectedPlayers.length}/${snap.maxPlayers||4}).`;
      else if (!allReady) n.startHint.textContent = 'Tous les joueurs doivent être prêts.';
      else n.startHint.textContent = '';
    }
  }

  function canStartGame(snap, cur) {
    if (!snap || !cur?.isHost || snap.status !== 'waiting') return false;
    const connectedPlayers = (snap.players || []).filter(p=>p.isConnected !== false);
    return connectedPlayers.length >= 2 && connectedPlayers.every(p=>p.isReady||p.isHost);
  }

  function startGameErrorMessage(error) {
    const key = error?.message || error?.code || 'Lancement impossible';
    const messages = {
      host_required: "Démarrage refusé : seul l'hôte peut lancer.",
      players_not_ready: 'Démarrage refusé : tous les joueurs doivent être prêts.',
      not_enough_players: 'Démarrage refusé : il faut au moins 2 joueurs connectés.',
      game_already_started: 'La partie est déjà lancée.',
      game_expired: 'Cette salle a expiré.'
    };
    return messages[key] || `Démarrage refusé : ${key}`;
  }

  function resetStartGamePending() {
    state.startGamePending = false;
    const n = els();
    if (n.startBtn) n.startBtn.textContent = 'Lancer la partie';
  }

  function renderTimer(snap) {
    const n = els();
    if (!n.timer) return;
    if (snap.status==='playing' && snap.endsAt) {
      const rem = Math.max(0, Math.ceil((new Date(snap.endsAt).getTime()-Date.now())/1000));
      n.timer.textContent = `${Math.floor(rem/60)}:${(rem%60).toString().padStart(2,'0')}`;
    } else {
      n.timer.textContent = '--:--';
    }
  }

  function showFinal(snap) {
    showView('final');
    setStatus('Partie terminée !');
    const n = els();
    if (n.finalRanking) n.finalRanking.replaceChildren(...(snap.players||[]).map(scoreItem));
  }

  function renderAnswerGrid(snap) {
    const n = els();
    if (!n.answerGrid) return;
    const total = totalAnswers(snap.categoryId);
    const found = new Map((snap.allFoundAnswers||[]).map(a=>[Number(a.displayOrder),a]));
    n.answerGrid.replaceChildren();
    for (let i=1; i<=total; i++) {
      const a = found.get(i);
      const tr = document.createElement('tr');
      tr.className = a ? 'multiplayer-answer-row is-found' : 'multiplayer-answer-row';
      const td1 = document.createElement('td'); td1.textContent = String(i);
      const td2 = document.createElement('td'); td2.textContent = a?.display || '???';
      const td3 = document.createElement('td'); td3.textContent = a ? '✓' : '⏳';
      tr.append(td1, td2, td3);
      n.answerGrid.append(tr);
    }
  }

  function renderState(snap) {
    if (!snap) return;
    if (!snap.gameCode && state.current?.gameCode) snap = {...snap, gameCode: state.current.gameCode};
    if (!snap?.gameCode) return;

    const prev = state.current?.gameCode;
    if ((prev && prev!==snap.gameCode) || snap.status!=='waiting') resetStartGamePending();
    state.current = snap;
    cacheGame(snap.gameCode);

    const n = els();
    const cur = currentPlayer(snap);
    const host = snap.players?.find(p=>p.isHost) || null;

    if (n.codeDisplay) n.codeDisplay.textContent = snap.gameCode;
    if (n.categoryLabel) n.categoryLabel.textContent = catLabel(snap.categoryId);
    if (n.countLabel) n.countLabel.textContent = `${snap.currentPlayers||0}/${snap.maxPlayers||4} joueurs`;
    if (n.hostLabel) n.hostLabel.textContent = host ? `Hôte: ${host.pseudo}` : 'Hôte indisponible';
    if (n.players) n.players.replaceChildren(...(snap.players||[]).map(playerItem));
    if (n.scoreboard) n.scoreboard.replaceChildren(...(snap.players||[]).map(scoreItem));
    if (n.foundList) n.foundList.replaceChildren(...(snap.allFoundAnswers||[]).map(foundItem));

    renderAnswerGrid(snap);
    updateStartButton(snap, cur);

    if (n.readyBtn) n.readyBtn.textContent = cur?.isReady ? 'Annuler prêt' : 'Prêt';
    if (n.scoreLive) n.scoreLive.textContent = cur ? `Ton score: ${cur.score||0} pts` : '';
    if (n.progressLive) {
      const total = totalAnswers(snap.categoryId);
      const found = Number(cur?.correctAnswers||0);
      const pct = total ? Math.round((found/total)*100) : 0;
      n.progressLive.textContent = total ? `Ta progression: ${found}/${total} (${pct}%)` : '';
    }
    if (window.MemorizReactions?.setDisabled) {
      window.MemorizReactions.setDisabled(n.reactions, snap.status!=='waiting' && snap.status!=='playing');
    }
    renderTimer(snap);

    if (snap.status==='playing') { showView('game'); setStatus('Partie en cours.'); }
    else if (['finished','expired','cancelled'].includes(snap.status)) { showFinal(snap); }
    else { showView('lobby'); setStatus('Lobby synchronisé.'); }
  }

  function bindSocketEvents() {
    const s = window.MemorizMultiplayerSocket;
    if (!s) return;
    const events = ['gameState','gameCreated','playerJoined','playerUpdated','gameStarted','scoreUpdate','gameFinished','playerLeft','playerDisconnected'];
    events.forEach(ev => {
      s.on(ev, (snap) => {
        if (ev==='gameStarted') state.startGamePending = false;
        renderState(snap);
      });
    });
  }

  async function ensureConnected() {
    const st = window.MemorizMultiplayerSocket?.getState?.();
    if (st?.connected) return window.MemorizMultiplayerSocket;
    return await window.MemorizMultiplayerSocket.connect();
  }

  // ===================== ACTIONS =====================
  async function createGame() {
    const n = els();
    const categoryId = n.createCategory?.value;
    const maxPlayers = parseInt(n.createMaxPlayers?.value||'4', 10);
    if (!categoryId) { setStatus('Choisis une catégorie.'); return; }
    try {
      setStatus('Création…');
      await ensureConnected();
      const result = await window.MemorizMultiplayerSocket.emitWithAck('createGame', { categoryId, maxPlayers });
      if (result?.created?.game_code) {
        state.current = { gameCode: result.created.game_code };
        renderState(result.snapshot);
      }
    } catch(err) {
      setStatus(`Erreur: ${err.message||'Création impossible'}`);
    }
  }

  async function joinGame() {
    const n = els();
    const code = n.joinCode?.value?.trim().toUpperCase();
    if (!code) { setStatus('Saisis un code.'); return; }
    try {
      setStatus('Connexion…');
      await ensureConnected();
      const result = await window.MemorizMultiplayerSocket.emitWithAck('joinGame', { gameCode: code });
      if (result?.joined) {
        state.current = { gameCode: code };
        renderState(result.snapshot);
      }
    } catch(err) {
      setStatus(`Erreur: ${err.message||'Connexion impossible'}`);
    }
  }

  async function setReady() {
    if (!state.current?.gameCode) return;
    try {
      const cur = currentPlayer(state.current);
      const result = await window.MemorizMultiplayerSocket.emitWithAck('setReady', {
        gameCode: state.current.gameCode,
        ready: !cur?.isReady
      });
      if (result?.snapshot) renderState(result.snapshot);
    } catch(err) { setStatus(`Erreur: ${err.message||'Action impossible'}`); }
  }

  async function startGame() {
    if (!state.current?.gameCode) return;
    const cur = currentPlayer(state.current);
    if (state.startGamePending || !canStartGame(state.current, cur)) {
      updateStartButton(state.current, cur);
      return;
    }
    state.startGamePending = true;
    updateStartButton(state.current, cur);
    try {
      const result = await window.MemorizMultiplayerSocket.emitWithAck('startGame', {
        gameCode: state.current.gameCode
      });
      if (result?.snapshot) renderState(result.snapshot);
    } catch(err) {
      state.startGamePending = false;
      setStatus(startGameErrorMessage(err));
      updateStartButton(state.current, currentPlayer(state.current));
    }
  }

  async function submitAnswer() {
    const n = els();
    const input = n.answerInput;
    if (!input || !state.current?.gameCode) return;
    const answer = input.value.trim();
    if (!answer) return;
    input.value = '';
    try {
      const result = await window.MemorizMultiplayerSocket.emitWithAck('submitAnswer', {
        gameCode: state.current.gameCode, answer
      });
      const message = answerResultMessage(result?.result);
      if (message) setStatus(message);
      if (result?.snapshot) renderState(result.snapshot);
    } catch(err) { setStatus(`Erreur: ${err.message||'Réponse refusée'}`); }
  }

  async function leaveGame() {
    if (!state.current?.gameCode) { close(); return; }
    try {
      await window.MemorizMultiplayerSocket.emitWithAck('leaveGame', {
        gameCode: state.current.gameCode
      });
    } catch(err) {}
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
      const result = await window.MemorizMultiplayerSocket.emitWithAck('requestGameState', { gameCode: code });
      if (result) { state.current = { gameCode: code }; renderState(result); }
    } catch(err) { clearCache(); }
  }

  function populateCategories() {
    const n = els();
    if (!n.createCategory) return;
    const val = n.createCategory.value;
    n.createCategory.replaceChildren();
    const mapping = window.categoryMapping || {};
    Object.entries(mapping).forEach(([k, info]) => {
      const opt = document.createElement('option');
      opt.value = k; opt.textContent = info.title || k;
      n.createCategory.append(opt);
    });
    if (val && mapping[val]) n.createCategory.value = val;
  }

  function switchTab(tab) {
    state.activeTab = tab;
    const n = els();
    if (n.tabCreate) { n.tabCreate.classList.toggle('is-active', tab==='create'); n.tabCreate.setAttribute('aria-selected', tab==='create'?'true':'false'); }
    if (n.tabJoin) { n.tabJoin.classList.toggle('is-active', tab==='join'); n.tabJoin.setAttribute('aria-selected', tab==='join'?'true':'false'); }
    if (n.panelCreate) n.panelCreate.hidden = tab !== 'create';
    if (n.panelJoin) n.panelJoin.hidden = tab !== 'join';
  }

  function open() {
    const n = els();
    if (!n.modal) return;
    populateCategories();
    n.modal.hidden = false;
    n.modal.setAttribute('aria-hidden','false');
    n.modal.classList.add('is-open');
    state.modalOpen = true;
    switchTab(state.activeTab);
    bindSocketEvents();
    reconnect().catch(()=>{});
  }

  function close() {
    const n = els();
    if (!n.modal) return;
    n.modal.hidden = true;
    n.modal.setAttribute('aria-hidden','true');
    n.modal.classList.remove('is-open');
    state.modalOpen = false;
    state.current = null;
    showView('portal');
    setStatus('Connecte ton profil pour jouer à plusieurs.');
  }

  function bindEvents() {
    if (state.listenersBound) return;
    state.listenersBound = true;
    const n = els();

    n.closeBtn?.addEventListener('click', () => {
      if (!state.current?.gameCode) close(); else leaveGame();
    });

    n.tabCreate?.addEventListener('click', () => switchTab('create'));
    n.tabJoin?.addEventListener('click', () => switchTab('join'));
    n.createBtn?.addEventListener('click', createGame);
    n.joinBtn?.addEventListener('click', joinGame);
    n.joinCode?.addEventListener('keydown', (e) => { if(e.key==='Enter') joinGame(); });

    n.copyCodeBtn?.addEventListener('click', () => {
      const code = n.codeDisplay?.textContent;
      if (code) navigator.clipboard?.writeText(code).then(()=>{
        setStatus('Code copié !'); setTimeout(()=>setStatus('Lobby synchronisé.'),1500);
      }).catch(()=>{});
    });

    n.readyBtn?.addEventListener('click', setReady);
    n.startBtn?.addEventListener('click', startGame);
    n.leaveBtn?.addEventListener('click', leaveGame);

    n.answerForm?.addEventListener('submit', (e) => { e.preventDefault(); submitAnswer(); });
    n.closeFinalBtn?.addEventListener('click', close);

    n.modal?.addEventListener('click', (e) => {
      if (e.target===n.modal && !state.current?.gameCode) close();
    });

    document.addEventListener('memoriz:multiplayer-error', (e)=>{
      setStatus(`Réseau: ${e.detail?.error||'déconnecté'}`);
    });
    document.addEventListener('memoriz:multiplayer-network', (e)=>{
      if(e.detail?.connected) setStatus('Connecté au serveur.');
    });
  }

  function init() { bindEvents(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  window.MemorizMultiplayer = {
    open, close,
    getState: () => ({...state}),
    renderState,
    createGame, joinGame, setReady, startGame, submitAnswer, leaveGame
  };
})();
