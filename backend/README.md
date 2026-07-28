# Backend Memoriz

Backend Express et Socket.io pour le multijoueur Memoriz.

## Commandes

```powershell
npm ci
npm run test
npm run test:unit
npm run test:socket
npm run test:integration
npm start
```

## Securite

- Authentification par token Supabase verifie cote backend.
- Origines HTTP et Socket.io limitees par `FRONTEND_ORIGIN`.
- Payload HTTP limite a 16 KiB, payload Socket.io limite a 4 KiB.
- Rate limits REST et evenements Socket.io.
- Logs JSON redacted.
- Erreurs stables sans stack en production.
- Arret gracieux SIGTERM/SIGINT.

## Docker

```powershell
docker build -t memoriz-backend:phase6 backend
docker run --rm -p 3001:3001 --env-file backend/.env.production.local memoriz-backend:phase6
```

Ne jamais commiter `.env.production.local`.
