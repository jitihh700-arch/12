# Documentation technique Memoriz

Cette documentation accompagne la migration progressive de Memoriz. La Phase 0 decrit l'etat initial; les phases suivantes ajoutent les fondations techniques sans modifier le comportement du quiz tant que l'integration frontend n'est pas explicitement ouverte.

## Organisation

| Dossier | Role | Fichiers |
| --- | --- | --- |
| `docs/audit/` | Etat actuel du depot, cartographie et risques immediats | `01-current-architecture.md`, `02-code-mapping.md`, `03-security-risks.md`, `04-refactoring-risks.md` |
| `docs/architecture/` | Architecture cible progressive et strategie temps reel | `01-target-architecture.md`, `02-data-flow.md`, `03-realtime-strategy.md` |
| `docs/roadmap/` | Plan de migration par phases | `01-implementation-roadmap.md` |
| `docs/refactoring/` | Rapports de migration technique progressive | `01-phase-1-static-extraction.md` |
| `docs/auth/` | Decisions d'authentification et profils Supabase | `01-anonymous-auth-and-profiles.md` |
| `docs/api/` | Contrats fonctionnels futurs pour les RPC | `01-profile-contract.md` |

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
