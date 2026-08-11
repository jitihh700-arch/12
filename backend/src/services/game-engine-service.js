export function buildGameSnapshot(rows, currentUserId, fallbackGameCode = null) {
  const list = Array.isArray(rows) ? rows : [];
  const playerMap = new Map();
  const foundMap = new Map();

  for (const row of list) {
    if (!row?.player_id) continue;

    // Construction du joueur
    if (!playerMap.has(row.player_id)) {
      playerMap.set(row.player_id, {
        playerId: row.player_id,
        pseudo: row.pseudo || 'Joueur',
        score: Number(row.score) || 0,
        correctAnswers: Number(row.correct_answers) || 0,
        isReady: Boolean(row.is_ready),
        isConnected: Boolean(row.is_connected),
        isHost: Boolean(row.is_host),
        isCurrent: row.user_id === currentUserId,
        rank: Number(row.player_rank) || 0
      });
    }

    // Collecte des réponses trouvées pour l'utilisateur actuel
    if (row.user_id === currentUserId && row.my_found_display_order != null) {
      const order = Number(row.my_found_display_order);
      if (!foundMap.has(order)) {
        foundMap.set(order, {
          display: row.my_found_answer_display || '',
          displayOrder: order,
          answerYear: row.my_found_answer_year || null,
          hint: row.my_found_hint || null,
          answeredAt: row.my_answered_at || null
        });
      }
    }
  }

  const first = list[0] || {};

  return {
    // CORRECTION : fallbackGameCode évite que gameCode soit null
    // quand la requête SQL retourne 0 ligne pour un joueur
    gameCode: first.game_code || fallbackGameCode || null,
    categoryId: first.category_id || null,
    status: first.status || null,
    maxPlayers: Number(first.max_players) || 0,
    currentPlayers: Number(first.current_players) || 0,
    hostId: first.host_id || null,
    durationSeconds: Number(first.duration_seconds) || 0,
    startedAt: first.started_at || null,
    expiresAt: first.expires_at || null,
    finishedAt: first.finished_at || null,
    players: [...playerMap.values()],
    myFoundAnswers: [...foundMap.values()]
      .sort((a, b) => a.displayOrder - b.displayOrder)
  };
}
