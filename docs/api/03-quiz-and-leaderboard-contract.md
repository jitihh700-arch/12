# Contrat quiz et leaderboard

## Principes

Le client n'envoie jamais `user_id`, pseudo, points, nombre de bonnes reponses, nombre de quiz completes ou dates serveur. Toutes les fonctions utilisent la session Supabase courante.

Erreurs stables principales: `authentication_required`, `profile_required`, `category_not_found`, `category_inactive`, `session_not_found`, `session_forbidden`, `session_not_active`, `invalid_answer`, `answer_too_long`, `invalid_leaderboard_limit`.

## start_quiz_session

```sql
select * from public.start_quiz_session(p_category_id => 'series');
```

Retour: `session_id`, `category_id`, `duration_seconds`, `started_at`, `expires_at`, `status`, `correct_answers`, `points_current`.

La duree vient de `private.quiz_categories`. Une nouvelle session abandonne proprement toute session active non expiree du meme joueur.

## submit_quiz_answer

```sql
select * from public.submit_quiz_answer(
  p_session_id => '<uuid>',
  p_answer => 'Walter White'
);
```

Retour: `result`, `correct_answers`, `points_current`, `remaining_answers_count`, `expires_at`, `status`.

`result` vaut `correct`, `duplicate`, `incorrect`, `expired` ou `completed`. La fonction ne retourne jamais `answer_text`, `answer_normalized`, `answer_id` ou les reponses restantes.

## complete_quiz_session

```sql
select * from public.complete_quiz_session(p_session_id => '<uuid>');
```

Retour: `result`, `correct_answers`, `points_awarded`, `status`, `completed_at`, `expires_at`.

La fonction est idempotente. Le credit est applique une seule fois, dans la transaction qui passe la session a `completed`. Une session expiree ou abandonnee ne credite aucun point.

## abandon_quiz_session

```sql
select * from public.abandon_quiz_session(p_session_id => '<uuid>');
```

Retour: `result`, `correct_answers`, `points_awarded`, `status`, `abandoned_at`.

Le second appel retourne `already_abandoned`. Aucun point n'est credite.

## get_my_quiz_session

```sql
select * from public.get_my_quiz_session(p_session_id => '<uuid>');
```

Retour: progression, statut et dates de la session appartenant au joueur courant. Un autre joueur recoit `session_forbidden`.

## get_leaderboard

```sql
select * from public.get_leaderboard(p_limit => 20);
```

Retour maximum 20 lignes: `rank`, `pseudo`, `total_points`, `quizzes_completed`, `last_played_at`.

## get_my_leaderboard_rank

```sql
select * from public.get_my_leaderboard_rank();
```

Retour: `rank`, `pseudo`, `total_points`, `quizzes_completed`, `last_played_at`, `total_players`.

La fonction ne prend aucun parametre et classe uniquement le profil lie a `auth.uid()`.
