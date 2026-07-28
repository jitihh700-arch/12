# Phase 3A - Fondation database des commentaires

## Perimetre

La Phase 3A ajoute uniquement la fondation PostgreSQL/Supabase du systeme de commentaires. Elle ne cree pas d'interface, ne modifie pas le quiz et ne demarre pas les phases leaderboard, multijoueur ou reactions.

## Schema

`public.comments` contient:

- `id uuid primary key default gen_random_uuid()`;
- `user_id uuid not null references public.profiles(id) on delete cascade`;
- `content text not null`;
- `is_edited boolean not null default false`;
- `deleted_at timestamptz`;
- `created_at timestamptz not null default now()`;
- `updated_at timestamptz not null default now()`.

Le pseudo n'est pas duplique dans `comments`. Les lectures publiques joignent `public.profiles` et retournent le pseudo courant. Si un joueur change de pseudo, ses anciens commentaires afficheront donc le nouveau pseudo.

## Contraintes

Le contenu est nettoye avec `btrim`, doit rester non vide et ne peut pas depasser 500 caracteres. Les dates sont coherentes: `updated_at >= created_at` et `deleted_at` reste nul ou posterieur a `created_at`.

Le HTML est stocke comme texte. Le futur frontend devra rendre `content` avec `textContent` ou une creation DOM sure, jamais avec `innerHTML`.

## Index

- `comments_created_at_desc_idx`: prepare l'ordre `created_at desc, id desc`.
- `comments_user_id_idx`: accelere les controles de propriete.
- `comments_visible_created_at_desc_idx`: index partiel pour les commentaires non supprimes listes par `list_comments`.
- `comments_active_user_id_idx`: index partiel pour compter les commentaires actifs d'un utilisateur.

## RPC

Les RPC exposees au frontend sont:

- `create_comment(p_content text)`;
- `list_comments(p_limit integer default 50, p_offset integer default 0)`;
- `update_my_comment(p_comment_id uuid, p_content text)`;
- `delete_my_comment(p_comment_id uuid)`.

Le client ne fournit jamais `user_id`, `pseudo`, `created_at`, `updated_at` ou `deleted_at`.

## Soft Delete

`delete_my_comment` fait une suppression logique avec `deleted_at = clock_timestamp()`. Un second appel retourne l'erreur stable `comment_deleted`. Ce choix evite de masquer un double clic ou un conflit produit: le frontend saura que le commentaire est deja supprime.

`list_comments` exclut toujours `deleted_at is not null`.

## Limite De 50

La limite porte sur les commentaires actifs de l'utilisateur courant:

```sql
deleted_at is null
```

`create_comment` verrouille la ligne `public.profiles` du joueur avec `FOR UPDATE` avant le comptage et l'insertion. Deux creations concurrentes du meme joueur sont donc serialisees; a 49 commentaires actifs, une seule des deux creations concurrentes peut reussir.

## RLS Et Permissions

RLS est activee sur `public.comments`.

Les droits table sont fermes par defaut. `authenticated` n'obtient plus `select` sur `public.comments`, car cette lecture directe permettait de contourner `list_comments` et de lire des lignes supprimees logiquement. Aucune policy `select`, `insert`, `update` ou `delete` n'existe sur `public.comments`: les lectures persistantes et les ecritures passent uniquement par les RPC.

Les fonctions d'ecriture sont `SECURITY DEFINER`, avec `set search_path = ''`, objets qualifies, pas de SQL dynamique et controles explicites sur `auth.uid()`.

Les helpers `clean_comment_content`, `assert_valid_comment_content` et `comment_public_row` ne sont pas exposes au client.

## Realtime

`public.comments` n'est plus exposee via Postgres Changes. La table est retiree de la publication `supabase_realtime` par une migration idempotente.

Le temps reel utilise un Broadcast prive emis par le trigger `comments_broadcast_change` avec `realtime.send`.

Topic:

```text
comments:public
```

Evenements:

- `comment_created`;
- `comment_updated`;
- `comment_deleted`.

Les payloads `comment_created` et `comment_updated` contiennent seulement `id`, `user_id`, `pseudo`, `content`, `is_edited`, `created_at` et `updated_at`.

Le payload `comment_deleted` contient seulement `id` et `deleted_at`. Il ne contient ni contenu supprime, ni ancien contenu, ni pseudo, ni ligne `OLD` ou `NEW` complete.

La policy `realtime.messages` autorise `authenticated` sur le topic exact `comments:public`. `anon` n'a pas de policy sur ce topic. Aucune policy `insert` client n'est creee; les messages sont emis par le trigger base.

## Erreurs

Erreurs stables:

- `authentication_required`;
- `profile_required`;
- `invalid_comment_content`;
- `comment_too_long`;
- `comment_limit_reached`;
- `comment_not_found`;
- `comment_forbidden`;
- `comment_deleted`;
- `invalid_pagination`.

## Tests

La validation couvre:

- structure, contraintes, FK, index et RLS;
- permissions table et RPC;
- creation, lecture, modification et soft delete;
- limite de 50 commentaires actifs;
- concurrence reelle du quota;
- pseudo courant apres changement;
- fuite directe refusee;
- Broadcast prive `comment_created`, `comment_updated`, `comment_deleted` et absence de `DELETE` physique.

## Risques Residuels

- Pas de moderation ni signalement en Phase 3A.
- Pas de rate limit applicatif autre que la limite de 50 commentaires actifs.
- Supabase local garde des privileges internes sur `realtime.messages`, mais l'absence de policy `insert` bloque l'injection cliente; ce comportement est valide par test runtime.
- Le frontend devra encore appliquer un rendu texte strict en Phase 3B.
- Un changement de pseudo futur n'emet pas de Broadcast pour les anciens commentaires; `list_comments` retournera bien le pseudo courant lors du prochain chargement.
