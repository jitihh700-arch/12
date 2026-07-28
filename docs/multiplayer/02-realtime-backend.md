# Phase 5 - Backend Express et Socket.io

Le backend `backend/` relaie les evenements temps reel sans devenir source de verite metier. Il verifie le token Supabase, rattache l'identite au socket, valide les payloads et appelle les RPC avec le JWT de l'utilisateur.

## Frontieres

- Express expose `/health` et des endpoints de lecture d'etat authentifies.
- Socket.io gere les evenements de partie et les rooms par code de partie.
- Supabase PostgreSQL reste responsable des regles, scores, statuts, hote et credit global.
- Les payloads clients sont valides avec Zod en mode strict.
- Les logs masquent les bearer tokens, JWT et cles `sb_secret_*`.

## Evenements entrants

- `createGame`
- `joinGame`
- `setReady`
- `startGame`
- `submitAnswer`
- `leaveGame`
- `requestGameState`
- `sendReaction`

Ces evenements ne doivent pas accepter de `user_id`, pseudo d'autorite, score, points, rang, dates serveur, `host_id` impose ou `answer_id`.

## Evenements sortants

Le backend renvoie des snapshots nettoyes:

- joueurs, pseudos, rangs, etats pret/connecte;
- score et bonnes reponses calcules en base;
- reponses trouvees uniquement pour le joueur courant;
- reactions validees avec pseudo deja attache au profil.

Les identifiants et valeurs canoniques des reponses privees ne sortent jamais du serveur.
