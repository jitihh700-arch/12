# Validation Phase 5 - Multijoueur et reactions

## Commandes obligatoires

```powershell
npx supabase start
npx supabase db reset
npx supabase db reset
npx supabase test db
npx supabase db lint --local
npm run test:backend
npm run test:backend:socket
npm run test:multiplayer
npm run test:frontend
powershell -ExecutionPolicy Bypass -File supabase/tests/integration/multiplayer_join_concurrency.ps1
powershell -ExecutionPolicy Bypass -File supabase/tests/integration/multiplayer_answer_concurrency.ps1
powershell -ExecutionPolicy Bypass -File supabase/tests/integration/multiplayer_finish_concurrency.ps1
powershell -ExecutionPolicy Bypass -File supabase/tests/integration/multiplayer_host_transfer_concurrency.ps1
```

## Points verifies

- migrations reproductibles;
- assertions pgTAP de profils, commentaires, quiz, leaderboard et multijoueur;
- lint de schema sans erreur;
- validation stricte des payloads backend;
- auth Socket.io sans token dans l'URL;
- reactions limitees;
- rendu frontend sans `innerHTML` pour les donnees multijoueur;
- cache local limite a `{ gameCode }`;
- concurrence join, reponse, finalisation et transfert d'hote.

## Resultat attendu

La Phase 5 est validee uniquement si toutes les commandes ci-dessus passent reellement et si les recherches de secrets ne trouvent aucun secret suivi par Git.
