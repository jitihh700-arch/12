# Architecture cible progressive

## Structure recommandee

La structure proposee dans la mission est adaptee. Je recommande deux ajustements:

- ajouter `assets/js/quiz-core.js` pour isoler la normalisation, le matching et les types d'etat communs entre solo et multijoueur;
- ajouter `docs/` comme zone permanente de decision, audit et migration.

Structure cible:

```text
projet/
├── index.html
├── assets/
│   ├── css/
│   │   ├── app.css
│   │   ├── comments.css
│   │   └── multiplayer.css
│   └── js/
│       ├── app.js
│       ├── auth.js
│       ├── api.js
│       ├── quiz-data.js
│       ├── quiz-core.js
│       ├── quiz-solo.js
│       ├── comments.js
│       ├── leaderboard.js
│       ├── multiplayer.js
│       ├── socket.js
│       └── ui.js
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── app.js
│   │   ├── config/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── validators/
│   │   ├── middlewares/
│   │   └── socket/
│   ├── tests/
│   └── package.json
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_rls_policies.sql
│       ├── 003_database_functions.sql
│       └── 004_realtime_publications.sql
└── docs/
```

## Responsabilites frontend

| Fichier | Responsabilite |
| --- | --- |
| `index.html` | Structure HTML minimale, points de montage, liens CSS/JS |
| `assets/css/app.css` | Styles actuels globaux, theme, layout, quiz solo, blog, modal |
| `assets/css/comments.css` | Styles des commentaires quand la Phase 3 commencera |
| `assets/css/multiplayer.css` | Styles du lobby, presence, etat multi quand la Phase 5 commencera |
| `assets/js/app.js` | Bootstrap global, ordre d'initialisation |
| `assets/js/auth.js` | Supabase anonymous auth, profil local, pseudo unique |
| `assets/js/api.js` | Appels HTTP backend/Supabase encapsules |
| `assets/js/quiz-data.js` | Listes, categories, indices, annees |
| `assets/js/quiz-core.js` | Normalisation, matching pur, modeles d'etat communs |
| `assets/js/quiz-solo.js` | Mode solo local compatible comportement actuel |
| `assets/js/comments.js` | CRUD commentaires et abonnement temps reel |
| `assets/js/leaderboard.js` | Lecture/ecriture scores, affichage classement |
| `assets/js/multiplayer.js` | Lobby, sessions, synchronisation UI multi |
| `assets/js/socket.js` | Client Socket.io, reconnexion, idempotence |
| `assets/js/ui.js` | Rendu DOM partage, theme, modale, blog, sons, canvas |

## Responsabilites backend

| Zone | Responsabilite |
| --- | --- |
| `server.js` | Lancement HTTP et Socket.io |
| `app.js` | Configuration Express, middlewares, routes |
| `config/` | Variables d'environnement, Supabase, CORS ferme |
| `routes/` | Routes REST versionnees |
| `controllers/` | Adaptation HTTP vers services |
| `services/` | Regles metier: profils, scores, commentaires, sessions |
| `validators/` | Schemas de payloads |
| `middlewares/` | Auth, rate limit, erreurs stables |
| `utils/logger.js` | Logs JSON avec redaction des secrets |
| `lifecycle.js` | Timeouts HTTP et arret gracieux SIGTERM/SIGINT |
| `socket/` | Evenements Socket.io, rooms, snapshots, reconnexion |
| `tests/` | Tests unitaires, integration et Socket.io |

## Production readiness Phase 6

La cible finale reste deployable sans nouvelle fonctionnalite metier. La Phase 6 ajoute la CI, Docker backend, les headers recommandes et les procedures d'exploitation. Le frontend statique garde un mode degrade: si Supabase ou le backend est indisponible, le quiz entrainement reste jouable sans points persistants.

## Responsabilites Supabase

Tables probables, a confirmer avant migration:

- `profiles`: utilisateur anonyme, pseudo unique, dates;
- `quiz_categories`: catalogue si les donnees quittent le frontend;
- `quiz_questions`: questions/reponses avec `questionId`;
- `quiz_sessions`: sessions solo terminees et sessions multi;
- `quiz_answers`: reponses trouvees par session;
- `leaderboard_entries`: scores publies;
- `comments`: commentaires par categorie/page/session;
- `reactions`: reactions emoji par cible;
- `multiplayer_players`: presence logique par session.

RLS devra etre activee sur toutes les tables exposees.

## Justification des ajustements

`quiz-core.js` est recommande car le moteur actuel contient une logique qui devra etre partagee entre:

- le solo local;
- les tests unitaires;
- la validation serveur;
- les snapshots multijoueur.

Sans ce fichier, `quiz-solo.js` et `multiplayer.js` risquent de dupliquer la normalisation et le matching.
