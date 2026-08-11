function renderAnswerGrid(snapshot) {
  const nodes = els();
  if (!nodes.answerGrid) return;
  const total = totalAnswers(snapshot.categoryId);
  // CORRECTION : utilise allFoundAnswers pour afficher les réponses de tout le monde
  const found = new Map((snapshot.allFoundAnswers || []).map(answer => [Number(answer.displayOrder), answer]));
  const cells = Array.from({ length: total }, (unused, index) => {
    const order = index + 1;
    const answer = found.get(order);
    const row = document.createElement('tr');
    row.className = answer ? 'multiplayer-answer-row is-found' : 'multiplayer-answer-row';

    const rank = document.createElement('td');
    rank.textContent = String(order);
    const display = document.createElement('td');
    display.textContent = answer?.display || '???';
    const status = document.createElement('td');
    status.textContent = answer ? '✓' : '⏳';

    row.append(rank, display, status);
    return row;
  });
  nodes.answerGrid.replaceChildren(...cells);
}

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
  const host = snapshot.players?.find(player => player.isHost) || null;

  if (nodes.codeDisplay) nodes.codeDisplay.textContent = snapshot.gameCode;
  if (nodes.categoryLabel) nodes.categoryLabel.textContent = categoryLabel(snapshot.categoryId);
  if (nodes.countLabel) nodes.countLabel.textContent = `${snapshot.currentPlayers}/${snapshot.maxPlayers} joueurs`;
  if (nodes.hostLabel) nodes.hostLabel.textContent = host ? `Hôte: ${host.pseudo}` : 'Hôte indisponible';
  if (nodes.players) nodes.players.replaceChildren(...(snapshot.players || []).map(playerItem));
  if (nodes.scoreboard) nodes.scoreboard.replaceChildren(...(snapshot.players || []).map(scoreItem));
  if (nodes.finalRanking) nodes.finalRanking.replaceChildren(...(snapshot.players || []).map(scoreItem));
  // CORRECTION : affiche les réponses trouvées par tout le monde
  if (nodes.found) nodes.found.replaceChildren(...(snapshot.allFoundAnswers || []).map(foundItem));
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
