# Contrat API Phase 5 - Multijoueur

## Authentification

Toutes les operations multijoueur exigent une session Supabase authentifiee. Le backend accepte le token dans `socket.auth.accessToken` ou dans l'en-tete `Authorization` pour les routes REST de lecture. Les tokens ne sont jamais places dans l'URL.

Le backend verifie aussi l'origine HTTP/Socket.io avec `FRONTEND_ORIGIN`. En production, cette liste doit etre fermee et ne doit pas utiliser de wildcard.

## Contrat client

Payloads autorises:

- `createGame`: `{ categoryId, maxPlayers }`
- `joinGame`: `{ gameCode }`
- `setReady`: `{ gameCode, ready }`
- `startGame`: `{ gameCode }`
- `submitAnswer`: `{ gameCode, answer }`
- `leaveGame`: `{ gameCode }`
- `requestGameState`: `{ gameCode }`
- `sendReaction`: `{ gameCode, reactionType }`

Chaque emission peut inclure `requestId` pour l'idempotence cote client et backend. Les schemas sont stricts: tout champ supplementaire est rejete.

## Snapshot

Un snapshot contient:

- `gameCode`, `categoryId`, `status`, `maxPlayers`, `currentPlayers`;
- dates serveur utiles a l'affichage;
- `players` avec pseudo, score, bonnes reponses, rang, etats pret/connecte;
- `myFoundAnswers` limite aux reponses du joueur courant.

Il ne contient pas de secret, `answer_id`, valeur normalisee canonique ni donnees d'autorisation.

## Codes d'erreur stables

Les erreurs exposees restent fonctionnelles et non sensibles: `invalid_payload`, `invalid_token`, `profile_required`, `game_not_found`, `game_full`, `host_required`, `players_not_ready`, `not_enough_players`, `not_a_player`, `reaction_rate_limited`, `game_finished`.

La Phase 6 ajoute la validation de `cors_origin_denied`, la redaction des logs et l'arret gracieux du backend.
