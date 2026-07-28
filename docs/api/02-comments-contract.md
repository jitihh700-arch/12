# Contrat commentaires

## Principes

Le client n'envoie aucune identite. Toutes les operations utilisent `auth.uid()` cote PostgreSQL et exigent une session authentifiee.

Le client n'envoie jamais:

- `user_id`;
- `pseudo`;
- `created_at`;
- `updated_at`;
- `deleted_at`;
- `is_edited`.

## create_comment

RPC:

```sql
select * from public.create_comment(p_content => 'Bonjour');
```

Reponse:

```json
{
  "comment_id": "uuid",
  "user_id": "uuid-auth-user",
  "pseudo": "Pseudo actuel",
  "content": "Bonjour",
  "is_edited": false,
  "created_at": "server-timestamp",
  "updated_at": "server-timestamp"
}
```

Regles:

- session obligatoire;
- profil obligatoire;
- contenu nettoye avec espaces externes retires;
- contenu vide refuse;
- 500 caracteres maximum;
- quota de 50 commentaires actifs par utilisateur;
- `user_id` et dates calcules par PostgreSQL.

## list_comments

RPC:

```sql
select * from public.list_comments(p_limit => 50, p_offset => 0);
```

Reponse: liste des commentaires non supprimes, tries par `created_at desc, id desc`.

Colonnes retournees:

- `comment_id`;
- `user_id`;
- `pseudo`;
- `content`;
- `is_edited`;
- `created_at`;
- `updated_at`.

`p_limit` doit etre compris entre 1 et 100. `p_offset` doit etre positif ou nul.

La lecture est reservee aux utilisateurs authentifies. Les commentaires supprimes ne sont pas retournes.

## update_my_comment

RPC:

```sql
select * from public.update_my_comment(
  p_comment_id => 'comment-uuid',
  p_content => 'Nouveau texte'
);
```

Regles:

- seul le proprietaire peut modifier;
- un commentaire supprime ne peut pas etre modifie;
- le contenu est nettoye et valide;
- `is_edited` passe a `true` seulement si le contenu change;
- `updated_at` est mis a jour par PostgreSQL;
- `user_id` et `created_at` restent inchanges.

## delete_my_comment

RPC:

```sql
select * from public.delete_my_comment(p_comment_id => 'comment-uuid');
```

Reponse:

```json
{
  "comment_id": "uuid",
  "deleted_at": "server-timestamp"
}
```

La suppression est logique. La ligne reste physiquement presente, mais `list_comments` ne la retourne plus.

Un second delete retourne `comment_deleted`.

## Erreurs

| Code | Sens |
| --- | --- |
| `authentication_required` | aucune session authentifiee |
| `profile_required` | aucun profil pour la session |
| `invalid_comment_content` | contenu vide ou espaces seuls |
| `comment_too_long` | plus de 500 caracteres |
| `comment_limit_reached` | 50 commentaires actifs deja presents |
| `comment_not_found` | commentaire absent |
| `comment_forbidden` | commentaire appartenant a un autre utilisateur |
| `comment_deleted` | commentaire deja supprime |
| `invalid_pagination` | limite ou offset invalide |

## Realtime

Le frontend futur ne doit pas utiliser Postgres Changes sur `public.comments`.

Il devra utiliser le canal Broadcast prive:

```text
comments:public
```

Evenements:

- `comment_created`: payload public complet du commentaire cree;
- `comment_updated`: payload public complet du commentaire modifie;
- `comment_deleted`: payload minimal `{ "id": "uuid", "deleted_at": "server-timestamp" }`.

`comment_deleted` ne contient jamais le contenu supprime, le pseudo, `OLD`, `NEW` ou une ligne brute. Les lectures persistantes doivent toujours repasser par `list_comments`.

## Integration Frontend Phase 3B

`assets/js/comments.js` applique ce contrat sans acces direct a `public.comments`.

Regles frontend:

- charger par pages de 20 via `list_comments`;
- creer via `create_comment`;
- modifier via `update_my_comment`;
- supprimer logiquement via `delete_my_comment`;
- ne jamais envoyer `user_id` ou `pseudo`;
- rendre `pseudo`, `content`, dates et erreurs avec `textContent`;
- utiliser le Broadcast prive `comments:public` et dedupliquer par identifiant de commentaire;
- recharger la liste apres changement de pseudo pour afficher le pseudo courant.
