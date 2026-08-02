# Memoriz V4 - Cartographie du frontend actuel

## Contexte Git

- Branche d'audit : `feature/frontend-rebuild-v4`
- Base `main` : `765c6c6a29d0731f06d5fbc508066a207cba75fa`
- Kit V4 cherry-pické : `ede6daee538fbd254c4610881a0125803fe1289e`
- Commit kit source : `c354459ba38067b3cf02cdf0a317a18389faee46`
- Commit WIP V3 exclu : `ec3b5eebaf4aa5a8f2bad248468e04fbc48d5aee`

Audit réalisé avec les angles de lecture `frontend-developer`, `ui-designer` et `websocket-engineer`, en suivant les règles des skills `frontend-design`, `ui-ux-pro-max`, `webapp-testing` et `supabase`.

## Structure HTML actuelle

`index.html` est encore une page verticale unique. Les fonctionnalités principales sont empilées dans le même document :

- arrière-plan canvas `#particles-canvas`;
- en-tête avec logo, titre, texte d'accroche et bouton `#themeToggle`;
- carte profil `#profile-card`;
- grille de 26 catégories via `.category-card[data-category]`;
- articles `.blog-article` avec contenus déjà présents dans le HTML;
- section commentaires `#comments-section`;
- footer légal;
- modales profil, classement et multijoueur.

Le jeu solo n'est pas présent dans le HTML initial : il est injecté par `assets/js/quiz-solo.js` avec `document.body.insertAdjacentHTML('beforeend', gameHTML)`, puis exposé via `#game-panel`, `#quick-input`, `#quick-submit` et les boutons de résultat.

## Feuilles CSS chargées

Ordre actuel dans `index.html` :

1. `assets/css/app.css`
2. `assets/css/comments.css`
3. `assets/css/leaderboard.css`
4. `assets/css/multiplayer.css`
5. `assets/css/reactions.css`

Le style reste majoritairement monolithique. `app.css` contient le socle visuel historique, tandis que les fichiers de fonctionnalités surchargent les blocs commentaires, classement, multijoueur et réactions.

## Scripts chargés

Ordre actuel :

1. `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.9/dist/umd/supabase.min.js`
2. `https://cdn.socket.io/4.8.3/socket.io.min.js`
3. `assets/js/supabase-runtime-config.js`
4. `assets/js/quiz-data.js`
5. `assets/js/ui.js`
6. `assets/js/api.js`
7. `assets/js/auth.js`
8. `assets/js/quiz-session.js`
9. `assets/js/quiz-solo.js`
10. `assets/js/leaderboard.js`
11. `assets/js/multiplayer-socket.js`
12. `assets/js/reactions.js`
13. `assets/js/multiplayer.js`
14. `assets/js/comments.js`
15. `assets/js/app.js`

Cet ordre est contractuel : `api.js`, `auth.js`, `quiz-session.js`, `leaderboard.js`, `comments.js` et `multiplayer-socket.js` lisent `window.MEMORIZ_SUPABASE_CONFIG`; le multijoueur lit aussi `window.MEMORIZ_MULTIPLAYER_CONFIG`.

## Modules globaux

Modules et fonctions exposés :

- `window.categoryMapping` depuis `quiz-data.js`;
- `window.MemorizProfileApi` depuis `api.js`;
- `window.memorizAuth` et `window.memorizProfile` depuis `auth.js`;
- `window.MemorizQuizSession` depuis `quiz-session.js`;
- `window.MemorizLeaderboard` depuis `leaderboard.js`;
- `window.MemorizMultiplayerSocket` depuis `multiplayer-socket.js`;
- `window.MemorizReactions` depuis `reactions.js`;
- `window.MemorizMultiplayer` depuis `multiplayer.js`;
- `window.MemorizComments` depuis `comments.js`;
- `window.closeGame`, `window.restartGame`, `window.shareOnWhatsApp`, `window.shareOnTwitter` depuis `app.js`.

La V4 doit éviter d'ajouter des globals inutiles et préserver ceux que les tests et modules consomment.

## Événements personnalisés

Événements internes repérés :

- `memoriz:profile-ready`;
- `memoriz:profile-unavailable`;
- `memoriz:quiz-finalized`;
- `memoriz:multiplayer-network`;
- `memoriz:multiplayer-error`.

Ces événements synchronisent profil, classement, sessions de quiz, commentaires et état réseau multijoueur. La refonte visuelle peut changer les écrans, mais pas leur signification.

## Sélecteurs DOM sensibles

Sélecteurs fortement utilisés par les modules et tests :

- Profil : `#profile-card`, `#profile-status-label`, `#profile-pseudo`, `#profile-stats`, `#profile-help`, `#profile-primary-action`, `#profile-retry-action`, `#profile-modal`, `#profile-pseudo-input`, `#profile-form`.
- Catégories : `.category-card`, `.category-card[data-category="series"]`, `data-category`.
- Solo : `#game-panel`, `#quick-input`, `#quick-submit`.
- Classement : `#leaderboard-open`, `#leaderboard-modal`, `#leaderboard-close`, `#leaderboard-status`, `#leaderboard-list`, `#leaderboard-my-rank`.
- Commentaires : `#comments-section`, `#comments-form`, `#comment-input`, `#comments-error`, `#comments-list`, `#comments-load-more`, `[data-action="toggle-actions"]`, `[data-action="edit"]`, `[data-action="delete"]`, `[data-action="confirm-delete"]`.
- Multijoueur : `#multiplayer-open`, `#multiplayer-modal`, `#multiplayer-category`, `#multiplayer-create`, `#multiplayer-code-input`, `#multiplayer-join`, `#multiplayer-lobby`, `#multiplayer-players`, `#multiplayer-ready`, `#multiplayer-start`, `#multiplayer-game`, `#multiplayer-answer-input`, `#multiplayer-answer-form`, `#multiplayer-score-live`, `#multiplayer-final`, `.reaction-button[data-reaction-type]`.

La V4 peut déplacer ces éléments dans de vrais écrans, mais doit conserver des points d'accroche compatibles ou adapter les tests dans le même commit de refonte.

## HTML dynamique et risques XSS

Zones dynamiques :

- `quiz-solo.js` injecte le panneau solo par `insertAdjacentHTML`.
- `leaderboard.js`, `comments.js`, `multiplayer.js` et `reactions.js` génèrent surtout des noeuds avec `createElement`, `replaceChildren` et `textContent`.
- `ui.js` affiche les pages légales dans `#modal-body`; le contenu est interne au dépôt.

Risques à surveiller en V4 :

- ne jamais injecter pseudo, commentaire, réponse ou nom de joueur avec `innerHTML`;
- conserver `textContent` pour les pseudos et commentaires;
- garder les boutons de menus commentaires sous `data-action`;
- vérifier les références du kit V4 avant toute reprise de markup;
- remplacer les structures visuelles sans casser les événements et les IDs critiques.

## Points bloquants pour une vraie interface V4

- Toutes les sections principales sont visibles ou présentes dans le flux de page.
- Les fonctionnalités avancées sont dans des modales au lieu d'écrans applicatifs.
- La grille de catégories est codée directement dans `index.html`.
- Le jeu solo est injecté comme bloc global hors architecture d'écran.
- Les styles legacy imposent une logique de page longue et de cartes empilées.
- La navigation applicative desktop/mobile n'existe pas encore.
