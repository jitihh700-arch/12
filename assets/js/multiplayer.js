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

  const ACTION_MESSAGES = {
    active_game_exists: 'Une ancienne salle est encore active. Je la quitte puis je relance la création.',
    game_expired: 'Cette salle est terminée. Tu peux créer une nouvelle partie.',
    game_full: 'Cette salle est complète.',
    invalid_game_code: 'Le code doit contenir 6 caractères.',
    players_not_ready: 'Tous les joueurs connectés doivent être prêts.',
    host_required: 'Seul l’hôte peut lancer cette partie.',
    socket_timeout: 'Le serveur ne répond pas. Réessaie dans quelques secondes.',
    socket_unavailable: 'Connexion multijoueur indisponible.',
    profile_required: 'Ton profil doit être chargé avant d’utiliser le multijoueur.',
    authentication_required: 'La session doit être disponible avant d’utiliser le multijoueur.'
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
      maxPlayers: document.get
