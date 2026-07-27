# Contrat profil

## Principes

Le client n'envoie jamais de `userId`. Toutes les operations utilisent la session Supabase courante et `auth.uid()` cote PostgreSQL.

Les exemples ci-dessous decrivent le contrat fonctionnel futur pour l'integration frontend. Ils ne creent pas encore de fichier JavaScript.

Les seules fonctions SQL prevues pour l'appel client sont `register_profile`, `get_my_profile` et `change_my_pseudo`. Les fonctions de nettoyage, normalisation et validation restent internes a la base.

## Creer le profil

RPC:

```sql
select * from public.register_profile(p_pseudo => 'Abdoulaye');
```

Reponse attendue:

```json
{
  "id": "uuid-auth-user",
  "pseudo": "Abdoulaye",
  "pseudo_normalized": "abdoulaye",
  "total_points": 0,
  "quizzes_completed": 0,
  "pseudo_changed_at": "server-timestamp",
  "last_played_at": null,
  "created_at": "server-timestamp",
  "updated_at": "server-timestamp"
}
```

Erreurs principales:

| Code logique | Sens |
| --- | --- |
| `not_authenticated` | aucune session authentifiee |
| `profile_not_found` | profil absent pour la session |
| `pseudo_empty` | pseudo vide apres nettoyage |
| `pseudo_too_short` | moins de 3 caracteres |
| `pseudo_too_long` | plus de 20 caracteres |
| `pseudo_invalid_format` | caractere interdit |
| `profile_already_exists` | profil deja cree pour cette session |
| `pseudo_already_taken` | pseudo deja utilise apres normalisation |

## Recuperer le profil courant

RPC:

```sql
select * from public.get_my_profile();
```

La fonction retourne le profil lie a `auth.uid()`. Elle ne prend aucun parametre.

Erreur principale:

| Code logique | Sens |
| --- | --- |
| `not_authenticated` | aucune session authentifiee |

## Changer mon pseudo

RPC:

```sql
select * from public.change_my_pseudo(p_pseudo => 'Mariam_22');
```

Reponse attendue:

```json
{
  "id": "uuid-auth-user",
  "pseudo": "Mariam_22",
  "pseudo_normalized": "mariam_22",
  "total_points": 0,
  "quizzes_completed": 0,
  "pseudo_changed_at": "server-timestamp",
  "next_pseudo_change_at": "server-timestamp-plus-14-days",
  "last_played_at": null,
  "created_at": "server-timestamp",
  "updated_at": "server-timestamp"
}
```

Erreurs principales:

| Code logique | Sens |
| --- | --- |
| `not_authenticated` | aucune session authentifiee |
| `profile_not_found` | profil absent pour la session |
| `pseudo_change_too_soon` | delai de 14 jours non atteint |
| `pseudo_already_taken` | pseudo deja utilise apres normalisation |
| `pseudo_empty` | pseudo vide apres nettoyage |
| `pseudo_too_short` | moins de 3 caracteres |
| `pseudo_too_long` | plus de 20 caracteres |
| `pseudo_invalid_format` | caractere interdit |

Quand `pseudo_change_too_soon` est renvoye, le detail PostgreSQL contient la prochaine date autorisee. L'integration frontend devra la transformer en message utilisateur clair.

## Format du pseudo

Regles imposees par PostgreSQL:

- 3 a 20 caracteres apres nettoyage;
- lettres, chiffres, espaces et underscores;
- espaces externes retires;
- espaces consecutifs reduits;
- unicite insensible a la casse via `pseudo_normalized`;
- accents conserves, non translitteres.

## Colonnes non modifiables par le client

Le joueur ne peut pas modifier directement:

- `id`;
- `total_points`;
- `quizzes_completed`;
- `pseudo_changed_at`;
- `last_played_at`;
- `created_at`;
- `updated_at`.

Les evolutions futures de score devront passer par une fonction dediee, hors Phase 2A.
