# Validation Phase 4B

## Versions

- Supabase CLI locale via dependance projet.
- Playwright via `@playwright/test`.
- Docker Desktop requis pour les validations runtime.

## Migrations Complementaires

`20260728170000_quiz_frontend_state.sql` remplace forward-only `finish_quiz_session_locked`, et recrée `submit_quiz_answer` avec retour controle de la reponse trouvee. Elle ajoute `get_my_quiz_session_state`.

## Tests SQL

Les 278 assertions Phase 4A restent attendues, avec les nouvelles assertions Phase 4B sur restauration, refus inter-utilisateur et credit a la fin du timer.

## Tests Playwright Phase 4B

`tests/frontend/phase-4b-quiz-leaderboard.spec.js` couvre:

- mode entrainement sans Supabase;
- demarrage classe;
- reponse correcte, incorrecte et duplicate;
- absence de points envoyes par le client;
- securite du score et finalisation idempotente;
- restauration apres reload;
- abandon et restart;
- leaderboard Top 20 et rang personnel;
- deux utilisateurs et session interdite;
- responsive mobile et zoom 200 %;
- focus trap, Escape et retour du focus.

## Tests Historiques

Les suites `test:auth`, `test:frontend`, `test:comments` et `test:comments:realtime` doivent rester vertes. Les tests de concurrence quiz et commentaires sont rejoues.

## Seed

`npm run test:quiz-seed` doit confirmer 26 categories, 446 reponses et la duree de 600 secondes.

## Securite

Les recherches finales doivent confirmer l'absence de secrets reels, de fichiers runtime, de `node_modules`, de rapports Playwright et de fichiers Supabase temporaires suivis par Git.

## Risques Residuels

Le serveur protege les points et le classement contre une falsification directe. Les reponses historiques restent dans le bundle public tant que le mode entrainement local existe.
