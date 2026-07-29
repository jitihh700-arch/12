# Deploiement frontend

## Runtime config

Créer un fichier non suivi `assets/js/supabase-runtime-config.js` a partir de `assets/js/supabase-runtime-config.production.example.js`.

Il doit contenir uniquement:

- URL publique Supabase;
- cle publishable Supabase;
- URL publique du backend Socket.io.

Ne jamais y placer de cle secrete, service_role, token d'acces ou mot de passe.

## Headers

Appliquer les headers de `docs/security/01-final-security-review.md`. HSTS est reserve au HTTPS de production.

## Cache

Les assets statiques versionnes peuvent etre caches longtemps. `index.html` et le runtime config doivent rester invalidables rapidement pour eviter un frontend pointe vers une ancienne configuration.

## Render Static Site

Configurer le frontend comme un service Render separe:

- Service Type: Static Site
- Branch: `main`
- Root Directory: laisser vide
- Build Command: `npm ci && npm run build:render`
- Publish Directory: `dist`

Variables d'environnement publiques a renseigner dans le service Static Site:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `PUBLIC_BACKEND_URL`

Le build genere `dist/assets/js/supabase-runtime-config.js` a partir de ces trois valeurs. Ne jamais renseigner de cle `sb_secret_`, de cle `service_role`, de mot de passe PostgreSQL ou de token backend dans le service Static Site.
