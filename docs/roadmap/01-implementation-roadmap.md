# Roadmap de migration progressive

## Phase 0: audit et securisation du depot

| Rubrique | Detail |
| --- | --- |
| Objectifs | Documenter l'existant, les risques, l'architecture cible et le plan de migration |
| Fichiers concernes | `index.html`, fichiers statiques racine, documentation |
| Nouveaux fichiers | `docs/**` uniquement |
| Risques | Audit incomplet si une information n'est pas verifiee dans le depot |
| Tests necessaires | `git status`, `git diff --stat`, verification que `index.html` n'a pas change |
| Criteres d'acceptation | Documentation creee, aucun code applicatif modifie, risques explicites |
| Dependances | Aucune |

## Phase 1: extraction du CSS et du JavaScript sans changement fonctionnel

| Rubrique | Detail |
| --- | --- |
| Objectifs | Sortir CSS et JS du fichier sans changer comportement, score, donnees ni UI |
| Fichiers concernes | `index.html` |
| Nouveaux fichiers | `assets/css/app.css`, `assets/js/app.js`, potentiellement `assets/js/quiz-data.js` si extraction prudente |
| Risques | Ordre d'execution, fonctions globales utilisees par `onclick`, chemins assets, encodage UTF-8 |
| Tests necessaires | Lancement page, clic sur chaque categorie, theme, blog, modale, timer, reponse correcte/fausse, fin/restart/partage |
| Criteres d'acceptation | Rendu identique, 26 categories fonctionnelles, donnees et score inchanges, aucun backend |
| Dependances | Phase 0 validee |

## Phase 2: authentification anonyme Supabase et profils

| Rubrique | Detail |
| --- | --- |
| Objectifs | Ajouter session anonyme, profil et pseudo unique |
| Fichiers concernes | `index.html`, `assets/js/app.js`, `assets/js/auth.js`, `assets/js/api.js` |
| Nouveaux fichiers | `supabase/migrations/001_initial_schema.sql`, `002_rls_policies.sql`, `.env.example` si backend/client config |
| Risques | Exposition de secrets, RLS incorrecte, politique de confidentialite obsolete |
| Tests necessaires | Creation profil, unicite pseudo, refresh session, refus pseudo invalide, RLS lecture/ecriture |
| Criteres d'acceptation | Utilisateur anonyme cree, pseudo unique persiste, aucun score modifie |
| Dependances | Phase 1, decision sur schema `profiles` |

## Phase 3: commentaires CRUD et temps reel

| Rubrique | Detail |
| --- | --- |
| Objectifs | Ajouter commentaires creables, lisibles, modifiables/supprimables selon proprietaire, temps reel |
| Fichiers concernes | `assets/js/comments.js`, `assets/js/ui.js`, `assets/css/comments.css`, migrations Supabase |
| Nouveaux fichiers | Migration `comments`, tests commentaires |
| Risques | XSS via commentaire, spam, moderation absente, RLS trop permissive |
| Tests necessaires | CRUD proprietaire, lecture publique controlee, echappement HTML, realtime insert/update/delete, pagination |
| Criteres d'acceptation | Commentaires temps reel sans casser le quiz solo |
| Dependances | Phase 2 |

## Phase 4: sessions de quiz et leaderboard

| Rubrique | Detail |
| --- | --- |
| Objectifs | Enregistrer sessions terminees et afficher classement |
| Fichiers concernes | `assets/js/quiz-solo.js`, `assets/js/leaderboard.js`, `assets/js/api.js`, migrations |
| Nouveaux fichiers | Tables `quiz_sessions`, `leaderboard_entries`, tests leaderboard |
| Risques | Score client falsifie, tri incorrect, doublons, donnees personnelles |
| Tests necessaires | Score calcule/verifie, insertion unique, classement par categorie, lecture RLS, pagination |
| Criteres d'acceptation | Leaderboard affiche des scores valides sans changer score local actuel |
| Dependances | Phase 2, extraction suffisante du moteur |

## Phase 5: mode multijoueur Socket.io

| Rubrique | Detail |
| --- | --- |
| Objectifs | Ajouter backend Express + Socket.io, rooms, presence, snapshots, timer serveur |
| Fichiers concernes | `backend/src/**`, `assets/js/socket.js`, `assets/js/multiplayer.js`, `assets/css/multiplayer.css` |
| Nouveaux fichiers | `backend/package.json`, `backend/src/server.js`, `backend/src/app.js`, `backend/src/socket/**`, tests Socket.io |
| Risques | Double comptage, timer divergent, reconnexion incomplete, validation client trop confiante |
| Tests necessaires | Deux clients, double submit simultane, reconnect, session snapshot, timer serveur, payload invalide |
| Criteres d'acceptation | Une partie multi fonctionne sans casser le mode solo |
| Dependances | Phases 1, 2, 4; contrat d'evenements valide |

## Phase 6: securite, qualite et production readiness

| Rubrique | Detail |
| --- | --- |
| Objectifs | Durcir securite, qualite, CI, Docker, documentation et validation finale |
| Fichiers concernes | backend, scripts, workflows, docs, tests frontend/backend |
| Nouveaux fichiers | CI, Dockerfile backend, guides operations/deploiement, tests Phase 6 |
| Risques | Secrets, CORS trop ouvert, CI lente, faux positifs, logs sensibles |
| Tests necessaires | lint, format, security scan, pgTAP, frontend, backend, Docker, concurrence |
| Criteres d'acceptation | CI locale reproductible, aucun secret, Docker OK, docs operationnelles |
| Dependances | Phases 1 a 5 validees |

## Phase 7: deploiement reel controle

| Rubrique | Detail |
| --- | --- |
| Objectifs | Executer le deploiement reel apres validation humaine |
| Fichiers concernes | Toute l'application, CI, backend, Supabase |
| Nouveaux fichiers | `.github/workflows/ci.yml`, configs lint/test, docs operations |
| Risques | CI lente, faux positifs, secrets mal geres, headers incomplets |
| Tests necessaires | Unitaires, integration, E2E, Socket.io, migrations, audit securite, secrets |
| Criteres d'acceptation | CI verte, migrations validees, secrets absents, documentation a jour |
| Dependances | Phase 6 validee |

## Outils qualite recommandes

Ne pas installer avant la Phase 1 ou avant justification dans une PR dediee.

| Besoin | Outil recommande | Justification |
| --- | --- | --- |
| ESLint | ESLint avec config JavaScript browser puis Node pour backend | Detecter globals, erreurs DOM, code mort |
| Prettier | Prettier | Stabiliser les diffs apres extraction |
| Tests unitaires frontend | Vitest | Tester `normalizeString`, `QuizGame`, helpers purs |
| Tests integration frontend | Vitest + jsdom | Tester interactions DOM sans navigateur complet |
| Tests E2E frontend | Playwright | Verifier rendu, clics categories, timer, responsive |
| Tests backend | Vitest ou Node test runner + Supertest | Tester routes Express |
| Tests Socket.io | Socket.io client + runner Vitest | Tester rooms, reconnexion, evenements |
| Migrations Supabase | Supabase CLI | Valider schema, RLS et migrations localement |
| Securite dependances | `npm audit`, Dependabot | Suivre vulnerabilities |
| Detection secrets | gitleaks ou TruffleHog | Bloquer secrets en CI |
| Validation SQL/RLS | Tests SQL + Supabase local | Prouver les politiques |
| CI GitHub Actions | Workflow lint/test/build/audit | Bloquer regressions avant merge |

## Prompt exact propose pour la Phase 1

```text
Tu travailles sur le depot C:\Users\HP\Documents\mohamed\12.

Objectif: executer la Phase 1 uniquement. Extrais le CSS et le JavaScript de index.html sans changement fonctionnel, sans changement visuel, sans modification des donnees de quiz, sans changement du score, sans ajout de Supabase, Express ou Socket.io.

Contraintes:
- Conserve exactement le comportement actuel.
- Garde les fonctions necessaires accessibles depuis les handlers inline existants, ou remplace les handlers inline par des listeners uniquement si tu prouves que le comportement reste identique.
- Ne modifie pas les textes, categories, listes, duree du timer, scoring ou regles de validation.
- Cree seulement les fichiers necessaires sous assets/css et assets/js.
- Verifie chaque categorie, le theme clair/sombre, les articles blog, les pages legales, le timer, les sons, la fermeture/restart et le partage.
- Affiche git status et git diff --stat a la fin.
```
