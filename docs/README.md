# Documentation technique Memoriz

Cette documentation accompagne la migration progressive de Memoriz. La Phase 0 decrit l'etat initial; les phases suivantes ajoutent les fondations techniques sans modifier le comportement du quiz tant que l'integration frontend n'est pas explicitement ouverte.

## Organisation

| Dossier | Role | Fichiers |
| --- | --- | --- |
| `docs/audit/` | Etat actuel du depot, cartographie et risques immediats | `01-current-architecture.md`, `02-code-mapping.md`, `03-security-risks.md`, `04-refactoring-risks.md` |
| `docs/architecture/` | Architecture cible progressive et strategie temps reel | `01-target-architecture.md`, `02-data-flow.md`, `03-realtime-strategy.md` |
| `docs/roadmap/` | Plan de migration par phases | `01-implementation-roadmap.md` |
| `docs/refactoring/` | Rapports de migration technique progressive | `01-phase-1-static-extraction.md` |
| `docs/auth/` | Decisions d'authentification et profils Supabase | `01-anonymous-auth-and-profiles.md`, `02-phase-2b-frontend-auth.md` |
| `docs/api/` | Contrats fonctionnels futurs pour les RPC | `01-profile-contract.md`, `02-comments-contract.md`, `03-quiz-and-leaderboard-contract.md` |
| `docs/comments/` | Decisions database, securite et frontend des commentaires | `01-comments-database-and-security.md`, `02-comments-frontend-and-realtime.md` |
| `docs/quiz/` | Sessions de quiz securisees, seed canonique et validation serveur | `01-secure-quiz-sessions.md` |
| `docs/leaderboard/` | Classement database, source de verite et departage | `01-database-and-ranking.md` |
| `docs/testing/` | Rapports de validation runtime et frontend | `01-phase-2a-database-validation.md`, `02-phase-2b-frontend-auth-validation.md`, `03-phase-3a-comments-database-validation.md`, `04-phase-3b-comments-frontend-validation.md`, `05-phase-4a-quiz-leaderboard-database-validation.md` |

## Agents et skill utilises

Agents locaux identifies dans `C:\Users\HP\Documents\.codex\agents` et utilises pour l'audit:

- `code-mapper`: cartographie du fichier `index.html`, des fonctions, de l'etat et des chemins d'execution.
- `security-auditor`: revue des risques de securite actuels et futurs.
- `architect-reviewer`: evaluation des frontieres de modules et de la migration progressive.
- `documentation-engineer`: structuration des livrables Markdown.
- `websocket-engineer`: preparation des contraintes Socket.io, commentaires temps reel et leaderboard.

Skill local utilise depuis `C:\Users\HP\Documents\.codex\skills`:

- `ui-ux-pro-max`: recherche UX statique sur responsive, tables, viewport et interactions stables. Aucun design system persistant n'a ete genere afin de ne pas changer l'apparence.

## Informations manquantes ou ambigues

- Aucun cahier des charges fonctionnel detaille n'existe encore pour les pseudos, commentaires, leaderboard, reactions ou multijoueur.
- Les schemas des phases apres profils, les contrats Socket.io et les contrats de leaderboard ne sont pas encore definis.
- Les fichiers references par `index.html` mais absents du depot (`/favicon.svg`, `/favicon.ico`, `/site.webmanifest`) doivent etre clarifies avant une phase de nettoyage.
- Les textes legaux actuels indiquent une absence de collecte de donnees; ils devront etre revus avant l'ajout de comptes anonymes, commentaires ou leaderboard.

## Phase 2A

La Phase 2A ajoute les fondations Supabase PostgreSQL pour les profils anonymes:

- migrations SQL dans `supabase/migrations/`;
- tests SQL dans `supabase/tests/database/profiles.test.sql`;
- rapport de validation runtime dans `docs/testing/01-phase-2a-database-validation.md`;
- configuration locale Supabase dans `supabase/config.toml`;
- dependance CLI locale dans `package.json`.
- contrat d'authentification dans `docs/auth/01-anonymous-auth-and-profiles.md`;
- contrat fonctionnel RPC dans `docs/api/01-profile-contract.md`.

Le frontend existant reste volontairement non modifie dans cette phase.

## Phase 2B

La Phase 2B branche l'authentification anonyme Supabase sur le frontend statique:

- configuration runtime locale ignoree par Git via `assets/js/supabase-runtime-config.js`;
- exemple sans secret dans `assets/js/supabase-config.example.js`;
- client RPC limite a `register_profile`, `get_my_profile` et `change_my_pseudo`;
- interface de creation et de changement de pseudo dans le header;
- mode degrade: le quiz solo reste utilisable si Supabase, le CDN ou la configuration manquent.

Cette phase ne cree ni commentaires, ni leaderboard fonctionnel, ni backend Express, ni Socket.io. Le score du quiz solo n'est pas modifie.

La validation reproductible Phase 2B est documentee dans `docs/testing/02-phase-2b-frontend-auth-validation.md`.

## Phase 3A

La Phase 3A ajoute uniquement la fondation database des commentaires:

- table `public.comments`;
- RPC `create_comment`, `list_comments`, `update_my_comment`, `delete_my_comment`;
- RLS, permissions minimales, soft delete et limite de 50 commentaires actifs;
- publication Supabase Realtime;
- tests pgTAP, concurrence et Realtime.

Aucune interface commentaires n'est creee dans cette phase.

## Phase 3B

La Phase 3B ajoute l'interface frontend des commentaires:

- section commentaires avant le footer;
- appels exclusifs aux RPC `list_comments`, `create_comment`, `update_my_comment` et `delete_my_comment`;
- rendu DOM securise avec `textContent` pour les contenus et pseudos;
- pagination, edition, suppression logique et toasts;
- Broadcast prive Supabase sur `comments:public`;
- mode degrade non bloquant pour le quiz solo.

La validation reproductible Phase 3B est documentee dans `docs/testing/04-phase-3b-comments-frontend-validation.md`.

## Phase 4A

La Phase 4A ajoute la fondation database des sessions de quiz et du leaderboard:

- schema prive `private` pour les categories et reponses canoniques;
- seed reproductible genere depuis `assets/js/quiz-data.js`;
- tables `public.quiz_sessions`, `public.quiz_session_answers` et `public.user_category_stats`;
- RPC `start_quiz_session`, `submit_quiz_answer`, `complete_quiz_session`, `abandon_quiz_session`, `get_my_quiz_session`, `get_leaderboard` et `get_my_leaderboard_rank`;
- RLS, permissions minimales, validation serveur des reponses et credit idempotent des points;
- tests pgTAP, coherence seed et concurrence.

Aucune interface leaderboard et aucun changement frontend ne sont inclus.
