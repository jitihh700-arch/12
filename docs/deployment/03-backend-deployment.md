# Deploiement backend

## Variables

Voir `backend/.env.production.example`.

Variables obligatoires:

- `NODE_ENV=production`;
- `PORT`;
- `FRONTEND_ORIGIN` liste separee par des virgules, sans slash final;
- `SUPABASE_URL`;
- `SUPABASE_PUBLISHABLE_KEY`;
- `SUPABASE_SECRET_KEY`;
- limites multijoueur et reactions.

Le backend refuse de demarrer si la configuration est invalide. En production, une origine locale HTTP est refusee.

## Docker

```powershell
docker build -t memoriz-backend:phase6 backend
docker run --rm -p 3001:3001 --env-file backend/.env.production.local memoriz-backend:phase6
```

Le fichier `.env.production.local` ne doit jamais etre commite. L'image utilise un utilisateur non-root, `npm ci --omit=dev`, `NODE_ENV=production` et un healthcheck `/health`.

## Arret

Le processus gere `SIGTERM` et `SIGINT`, ferme Socket.io puis le serveur HTTP et sort avec un code coherent.

