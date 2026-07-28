# Validation Phase 6 - Production readiness

## Objectif

Valider le durcissement securite, les checks qualite, la CI, Docker, la documentation et les tests finaux avant toute preparation de deploiement reel.

## Commandes obligatoires

```powershell
npm audit
npm outdated
npm --prefix backend audit
npm --prefix backend outdated
npm run lint
npm run format:check
npm run security:scan
npm run test:all
npx supabase db reset
npx supabase db reset
npx supabase test db
npx supabase db lint --local
```

Tests specifiques:

- `npm run test:backend` couvre CORS, rate limiting, redaction, shutdown et charge legere Socket.io;
- `tests/frontend/phase-6-full-journey.spec.js` couvre parcours complet et mode degrade;
- workflows `.github/workflows/*.yml` reproduisent les commandes en CI locale Supabase.

## Resultats attendus

- 0 vulnerabilite `npm audit` racine et backend;
- `npm outdated`: seul le patch Supabase JS peut etre note sans mise a jour obligatoire;
- pgTAP au minimum 401 assertions existantes;
- frontend au minimum 28 tests apres ajout Phase 6;
- backend au minimum 22 tests apres ajout Phase 6;
- aucun secret reel suivi;
- fichiers runtime interdits absents de Git;
- Docker backend build/run/health/SIGTERM valides.

## Limites

Le test du parcours complet simule Socket.io cote navigateur pour eviter une dependance distante. La couche Socket.io reelle reste couverte par les tests backend et les scripts de concurrence Supabase locaux.

