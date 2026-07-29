# Runbook operations

## Demarrage local

```powershell
npm ci
npm --prefix backend ci
npx supabase start
npx supabase db reset
npm run config:supabase
npm --prefix backend start
python -m http.server 4173 --bind 127.0.0.1
```

## Validation rapide

```powershell
npm run lint
npm run format:check
npm run security:scan
npm run test:backend
npm run test:frontend
npx supabase test db
```

## Incidents courants

| Symptome | Verification | Action |
| --- | --- | --- |
| Profil indisponible | runtime config absent ou Supabase arrete | regenerer config et verifier `npx supabase status` |
| Leaderboard indisponible | RPC erreur ou session absente | verifier Auth anonyme et tests SQL |
| Socket.io refuse | origine non autorisee | corriger `FRONTEND_ORIGIN` sans wildcard |
| Reactions limitees | quota atteint | attendre la fenetre de 10 secondes |
| Backend ne demarre pas | env invalide | corriger `.env`, ne pas ajouter de secret au depot |
