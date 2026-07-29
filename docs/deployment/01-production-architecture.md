# Architecture de production

## Vue d'ensemble

Memoriz reste une application composee de trois surfaces:

- frontend statique: `index.html`, `assets/css/`, `assets/js/`;
- backend Node persistant: Express + Socket.io pour le multijoueur;
- Supabase: Auth anonyme, PostgreSQL, RPC, RLS et Broadcast prive.

Le frontend ne contient que la cle publishable Supabase et l'URL publique du backend. La cle backend secrete reste uniquement dans les variables d'environnement du serveur Node.

## Flux

1. Le navigateur cree une session Supabase anonyme.
2. Le profil est cree et lu via `register_profile`, `get_my_profile`, `change_my_pseudo`.
3. Les commentaires passent par les RPC commentaires et le Broadcast prive `comments:public`.
4. Le quiz classe passe par les RPC quiz; les points sont calcules en base.
5. Le multijoueur passe par Socket.io; le backend verifie le token Supabase puis appelle les RPC multijoueur avec le token utilisateur.
6. Les reactions sont validees et rate-limitees cote serveur; elles ne modifient pas le score.

## Exigences d'hebergement

- HTTPS obligatoire.
- Frontend compatible hebergement statique, CDN ou Nginx.
- Backend deploye sur un service qui supporte processus Node long, WebSocket, healthcheck et SIGTERM.
- Reverse proxy configure pour transmettre `Upgrade` et `Connection`.
- Headers de securite appliques au niveau CDN/Nginx ou plateforme.
