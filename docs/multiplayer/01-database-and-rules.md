# Phase 5 - Base multijoueur et regles serveur

La Phase 5 ajoute les tables et RPC necessaires au quiz multijoueur sans deplacer la source de verite vers le client. Les tables publiques restent fermees par RLS et les roles `anon`/`authenticated` n'ont pas d'acces direct aux donnees.

## Tables

- `public.multiplayer_games`: code public de six caracteres, hote, categorie, statut, capacite, dates et version.
- `public.multiplayer_players`: appartenance d'un profil a une partie, etat pret/connecte, score serveur et credit global.
- `public.multiplayer_answers`: reponses deja trouvees par joueur, liees aux reponses canoniques privees.
- `public.multiplayer_reactions`: reactions ephemeres validees cote serveur.

## Regles

- Le code de partie est genere en base avec un alphabet sans caracteres ambigus.
- Une partie accepte de 2 a 4 joueurs.
- Le score est toujours `correct_answers * 10`.
- Une reponse deja trouvee par le meme joueur est idempotente et ne recree pas de points.
- La finalisation credite `profiles` et `user_category_stats` une seule fois par joueur.
- Le depart de l'hote en attente transfere l'hote au plus ancien joueur encore present.
- Les parties en attente expirent apres inactivite et les parties lancees expirent a `expires_at`.

## RPC autorisees

Les clients passent exclusivement par:

- `create_multiplayer_game`
- `join_multiplayer_game`
- `set_multiplayer_ready`
- `start_multiplayer_game`
- `submit_multiplayer_answer`
- `finish_multiplayer_game`
- `leave_multiplayer_game`
- `disconnect_multiplayer_game`
- `reconnect_multiplayer_game`
- `create_multiplayer_reaction`
- `get_my_multiplayer_game_state`

Aucune ecriture directe dans les tables publiques n'est necessaire ni autorisee.
