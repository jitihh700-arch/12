# Phase 5 - Reactions multijoueur

Les reactions sont des evenements courts associes a une partie active ou en attente. Elles passent par le backend puis par la RPC `create_multiplayer_reaction`.

## Types autorises

- `like`
- `heart`
- `fire`
- `party`
- `shocked`

Tout autre type est refuse par le frontend, le backend et la base.

## Limites

- Le backend applique une limite par socket et par fenetre courte.
- La base limite aussi le nombre de reactions recentes par joueur et par partie.
- Les reactions ne modifient jamais le score, le statut de partie, le rang ou les statistiques globales.

## Rendu

Le frontend rend les reactions avec une table locale de libelles et symboles. Les pseudos recus du serveur sont inseres avec `textContent` afin d'eviter toute interpretation HTML.
