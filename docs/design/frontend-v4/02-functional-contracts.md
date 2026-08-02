# Memoriz V4 - Contrats fonctionnels à préserver

## Règle générale

La refonte V4 est visuelle et structurelle côté frontend. Elle ne doit pas modifier les contrats Supabase, Socket.IO, backend, migrations, RLS, données de quiz ou règles de score. Le quiz solo doit rester utilisable si Supabase ou le backend sont indisponibles.

## Configuration runtime

Le frontend lit :

- `window.MEMORIZ_SUPABASE_CONFIG.url`;
- `window.MEMORIZ_SUPABASE_CONFIG.publishableKey`;
- `window.MEMORIZ_MULTIPLAYER_CONFIG.url`.

Le fichier réel `assets/js/supabase-runtime-config.js` reste ignoré par Git. Le build Render génère `dist/assets/js/supabase-runtime-config.js` à partir des variables publiques `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY` et `PUBLIC_BACKEND_URL`.

Interdits : clé `service_role`, clé `sb_secret_`, mot de passe PostgreSQL, token d'accès, token de refresh, URL privée ou secret backend dans le frontend.

## Auth Supabase et profil

Flux actuel :

1. `auth.js` initialise `MemorizProfileApi` avec la publishable key.
2. Le client Supabase utilise `persistSession`, `autoRefreshToken` et `detectSessionInUrl: false`.
3. `auth.js` récupère la session avec `getSession`.
4. Si besoin, il appelle `signInAnonymously`.
5. Le profil est récupéré avec `get_my_profile`.
6. La création utilise `register_profile`.
7. Le changement de pseudo utilise `change_my_pseudo`.

Contraintes à préserver :

- aucune écriture directe dans `public.profiles`;
- pseudo 3 à 20 caractères selon les validations existantes;
- unicité insensible aux accents/casse selon les règles base;
- délai de changement de pseudo côté base;
- état dégradé `Mode solo` si Supabase est absent;
- événements `memoriz:profile-ready` et `memoriz:profile-unavailable`.

## Quiz solo et quiz classé

Le solo démarre depuis `.category-card[data-category]` via `showGamePanel(categoryKey)`.

Si le profil et Supabase sont disponibles, `MemorizQuizSession` utilise les RPC :

- `start_quiz_session`;
- `submit_quiz_answer`;
- `complete_quiz_session`;
- `abandon_quiz_session`;
- `get_my_quiz_session`;
- `get_my_quiz_session_state`.

Contrats :

- le score classé reste calculé côté serveur;
- le client ne fournit pas le score final;
- les réponses déjà trouvées sont restaurées via la session serveur;
- les réponses canoniques ne doivent pas être exposées avant la fin;
- le cache local `memoriz_active_quiz_session` n'est pas autoritaire;
- `memoriz:quiz-finalized` déclenche la mise à jour du profil et du classement.

## Classement

Le classement utilise :

- `get_leaderboard` avec une limite entre 1 et 20;
- `get_my_leaderboard_rank`;
- `MemorizLeaderboard.open()` et `MemorizLeaderboard.reload()`;
- bouton d'entrée `#leaderboard-open`.

Contraintes :

- désactivé sans profil actif;
- top 20 maximum côté frontend;
- rang personnel séparé de la liste;
- mise à jour après `memoriz:quiz-finalized`;
- aucune donnée sensible dans les lignes affichées.

## Commentaires et Realtime

Les commentaires utilisent les RPC :

- `list_comments`;
- `create_comment`;
- `update_my_comment`;
- `delete_my_comment`.

Realtime :

- topic `comments:public`;
- canal Supabase privé;
- session requise avant souscription.

Contraintes :

- formulaire désactivé sans profil;
- 500 caractères maximum;
- quota existant respecté;
- édition/suppression réservées au propriétaire;
- affichage sécurisé par noeuds DOM et `textContent`;
- statut accessible via `aria-live`;
- le quiz solo reste disponible en cas d'échec commentaires.

## Socket.IO et multijoueur

Le frontend se connecte à `window.MEMORIZ_MULTIPLAYER_CONFIG.url` avec :

- auth `{ accessToken }`;
- transport websocket;
- reconnexion activée;
- token obtenu depuis la session Supabase.

Événements émis avec ACK :

- `createGame`;
- `joinGame`;
- `setReady`;
- `startGame`;
- `submitAnswer`;
- `leaveGame`;
- `requestGameState`;
- `sendReaction`.

Événements reçus :

- `gameState`;
- `gameCreated`;
- `playerJoined`;
- `playerUpdated`;
- `gameStarted`;
- `scoreUpdate`;
- `playerDisconnected`;
- `playerLeft`;
- `gameFinished`;
- `gameExpired`;
- `reactionReceived`.

Contrats métier :

- code de partie à 6 caractères;
- 2 à 4 joueurs;
- cinquième joueur refusé côté serveur;
- seul l'hôte lance;
- le bouton de lancement reste protégé côté UI et serveur;
- tous les joueurs connectés doivent être prêts;
- `disconnect` n'est pas `leave`;
- reconnexion via `requestGameState`;
- score, chronomètre, finalisation et réponses validés côté serveur;
- réactions sans effet sur le score;
- anti-spam et idempotence conservés.

## PWA et assets

`index.html` référence `/site.webmanifest`. Le build Render crée le manifeste statique et copie les icônes publiques. La V4 doit préserver :

- logo officiel existant;
- icônes et manifeste générés par le build;
- ordre correct du runtime config dans `index.html`;
- absence de service worker si aucun contrat explicite n'est présent dans la base courante.

## Contrats de sécurité

À vérifier à chaque étape V4 :

- pas de secret réel dans les fichiers suivis;
- pas de `.env` frontend/backend suivi;
- pas de wildcard CORS introduite;
- pas de modification Supabase ou backend pendant la refonte visuelle;
- pas de changement de `assets/js/quiz-data.js`;
- pas de token Supabase dans les URLs ou logs;
- pas d'`innerHTML` avec données utilisateur.
