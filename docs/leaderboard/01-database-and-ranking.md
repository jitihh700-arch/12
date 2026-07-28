# Leaderboard database et classement

## Source De Verite

La Phase 4A ne cree pas de table `public.leaderboard`. Le classement lit `public.profiles`, qui porte deja `pseudo`, `total_points`, `quizzes_completed` et `last_played_at`.

`public.user_category_stats` complete cette source de verite avec les agregats par categorie: total de points, bonnes reponses, quiz completes et derniere activite. Ces compteurs sont mis a jour dans la meme transaction que la finalisation de session.

## Top 20

`public.get_leaderboard(p_limit integer default 20)` est accessible uniquement au role `authenticated`. La limite doit etre comprise entre 1 et 20. Le retour expose seulement:

- `rank`;
- `pseudo`;
- `total_points`;
- `quizzes_completed`;
- `last_played_at`.

Le tri est stable:

1. `total_points desc`;
2. `last_played_at desc nulls last`;
3. `created_at asc`;
4. `id asc`.

## Rang Individuel

`public.get_my_leaderboard_rank()` utilise `auth.uid()` et ne prend aucun `user_id`. La fonction retourne le rang du joueur courant, ses compteurs publics et `total_players`. Elle peut retourner un rang au-dela du Top 20.

## Securite

Les clients ne peuvent pas modifier directement `profiles.total_points`, `profiles.quizzes_completed` ou `user_category_stats`. Les points viennent uniquement de `complete_quiz_session` ou de l'auto-completion controlee par `submit_quiz_answer` lorsque toutes les reponses d'une categorie sont trouvees.

La lecture directe des sessions et des reponses de session reste fermee. Le leaderboard ne retourne aucun `id`, `pseudo_normalized`, email, token ou reponse canonique.

## Risques

- Le leaderboard global peut favoriser les joueurs qui font beaucoup de categories. Un classement par periode ou par categorie reste hors Phase 4A.
- Le frontend n'affiche pas encore le classement; l'integration visuelle sera une phase separee.
- La suppression ou liaison future de comptes anonymes devra definir la conservation des scores.
