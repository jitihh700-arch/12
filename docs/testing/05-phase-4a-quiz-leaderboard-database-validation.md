# Validation Phase 4A - Quiz et leaderboard database

## Contexte

Branche: `feature/phase-4a-quiz-leaderboard-database`.

Objectif: valider les migrations PostgreSQL/Supabase du seed canonique du quiz, des sessions, de l'attribution transactionnelle des points et du leaderboard. Aucun fichier frontend n'est modifie.

## Migrations

1. `supabase/migrations/20260728150000_quiz_sessions_schema.sql`
2. `supabase/migrations/20260728150100_quiz_seed.sql`
3. `supabase/migrations/20260728150200_quiz_rpc.sql`

Le seed est genere depuis `assets/js/quiz-data.js` par:

```powershell
npm run generate:quiz-seed
```

Une seconde generation doit ne produire aucun diff.

## Donnees Importees

- Categories: 26.
- Reponses: 446.
- Duree par categorie: 600 secondes.
- Indices conserves: `trouveAnime`, `devinePersonnage`, `animeParOrganisation`.
- Annees conservees: `ligueDesChampions`, `ballonDor`.

Le test `npm run test:quiz-seed` compare la source JS et PostgreSQL local sans afficher les reponses en cas de succes.

## Tests

Commandes obligatoires:

```powershell
npx supabase db reset
npx supabase db reset
npx supabase test db
npx supabase db lint --local
npm run test:quiz-seed
powershell -ExecutionPolicy Bypass -File supabase/tests/integration/quiz_answer_concurrency.ps1
powershell -ExecutionPolicy Bypass -File supabase/tests/integration/quiz_completion_concurrency.ps1
npm run test:auth
npm run test:comments
powershell -ExecutionPolicy Bypass -File supabase/tests/integration/comments_limit_concurrency.ps1
powershell -ExecutionPolicy Bypass -File supabase/tests/integration/comments_direct_access_security.ps1
npm run test:comments:realtime
```

## Resultats Valides

- `npx supabase db reset`: succes.
- Deuxieme `npx supabase db reset`: succes.
- Tests existants: 164 assertions pgTAP conservees.
- Nouveaux tests SQL: 114 assertions pgTAP.
- Total `npx supabase test db`: 278 assertions, PASS.
- `npx supabase db lint --local`: aucun probleme de schema.
- `npm run test:quiz-seed`: 26 categories et 446 reponses coherentes.
- Double reponse: une seule ligne `quiz_session_answers`, un seul gain de 10 points courant.
- Double finalisation: un seul credit profil et une seule mise a jour des stats categorie.
- `npm run test:auth`: 9/9.
- `npm run test:comments`: 6/6.
- `npm run test:frontend`: 15/15 apres stabilisation du test qui attend maintenant la session anonyme avant l'appel RPC direct.
- Concurrence commentaires, acces direct commentaires et Broadcast commentaires: OK.

## Securite

Les reponses canoniques sont dans `private.quiz_answers` sans droit client. Les tables publiques de sessions et statistiques ont RLS activee et aucun droit direct d'ecriture. Les RPC exposees a `authenticated` sont la seule surface.

La CLI Supabase locale peut afficher des cles ephemeres au demarrage; elles ne doivent jamais etre stockees dans Git.

## Risques Residuels

- Le quiz solo frontend contient encore les reponses historiques tant que l'integration serveur n'est pas ouverte.
- Le doublon `Naruto Uzumaki` est conserve pour correspondre au comportement existant.
- Le leaderboard n'a pas encore d'interface et aucun temps reel dedie n'est cree en Phase 4A.
