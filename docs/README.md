# Documentation technique Memoriz

Cette documentation correspond a la Phase 0: audit et securisation du depot. Elle decrit l'etat actuel sans modifier le comportement, l'interface, les donnees de quiz, Supabase, Express ou Socket.io.

## Organisation

| Dossier | Role | Fichiers |
| --- | --- | --- |
| `docs/audit/` | Etat actuel du depot, cartographie et risques immediats | `01-current-architecture.md`, `02-code-mapping.md`, `03-security-risks.md`, `04-refactoring-risks.md` |
| `docs/architecture/` | Architecture cible progressive et strategie temps reel | `01-target-architecture.md`, `02-data-flow.md`, `03-realtime-strategy.md` |
| `docs/roadmap/` | Plan de migration par phases | `01-implementation-roadmap.md` |

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
- Les schemas Supabase, politiques RLS et contrats Socket.io ne sont pas encore definis.
- Les fichiers references par `index.html` mais absents du depot (`/favicon.svg`, `/favicon.ico`, `/site.webmanifest`) doivent etre clarifies avant une phase de nettoyage.
- Les textes legaux actuels indiquent une absence de collecte de donnees; ils devront etre revus avant l'ajout de comptes anonymes, commentaires ou leaderboard.
