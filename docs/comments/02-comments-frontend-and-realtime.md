# Phase 3B - Interface commentaires et temps reel

## Perimetre

La Phase 3B branche l'interface frontend sur les fondations Phase 3A. Elle n'ajoute pas de leaderboard, points, sessions de quiz, reactions, Express, Socket.io ou multijoueur.

## Architecture Frontend

`assets/js/comments.js` porte l'etat local des commentaires, la pagination, les appels RPC, le rendu DOM et l'abonnement Broadcast. Il reutilise le client unique expose par `assets/js/api.js`.

`assets/css/comments.css` isole les styles de la section commentaires pour eviter un reformatage du design global.

`auth.js` emet `memoriz:profile-ready` apres creation, chargement ou changement de pseudo. `comments.js` recharge alors la premiere page et renouvelle l'abonnement prive.

## RPC Utilisees

Le frontend utilise uniquement:

- `list_comments(p_limit, p_offset)`;
- `create_comment(p_content)`;
- `update_my_comment(p_comment_id, p_content)`;
- `delete_my_comment(p_comment_id)`.

Le client n'envoie jamais `user_id`, `pseudo`, `created_at`, `updated_at`, `deleted_at` ou `is_edited`.

## Structure DOM

La section `#comments-section` est placee avant le footer et identifiee par `aria-labelledby="comments-title"`.

Elle contient:

- un statut de connexion;
- un formulaire avec label, textarea, compteur `0 / 500`, erreur `aria-live`;
- une zone d'etat de liste;
- une liste de commentaires;
- un bouton `Charger plus`.

## Rendu Securise

Toutes les donnees dynamiques de commentaires sont rendues avec `document.createElement`, `textContent`, `append`, `replaceChildren` et des attributs controles. Le contenu HTML publie est affiche comme texte brut.

Les anciens usages de `innerHTML` du quiz et des pages legales ne sont pas etendus aux commentaires.

## Pagination

La premiere page demande 20 commentaires via `list_comments`. Les pages suivantes utilisent `offset = nombre de commentaires deja affiches`. L'ordre reste celui du serveur: `created_at desc, id desc`.

Les commentaires recus par RPC ou Broadcast sont dedupliques par `id`.

## Creation

Le formulaire nettoie les espaces externes, refuse les contenus vides et limite a 500 caracteres. PostgreSQL reste l'autorite finale.

La strategie retenue est l'insertion immediate de la reponse RPC, puis deduplication du Broadcast correspondant. Cela rend l'interface reactive tout en conservant le temps reel pour les autres clients.

## Modification

Un seul commentaire peut etre en edition a la fois. L'edition locale affiche un textarea, les boutons `Enregistrer` et `Annuler`, puis appelle `update_my_comment`. Aucune modification optimiste non annulable n'est appliquee.

## Suppression Logique

La suppression utilise uniquement `delete_my_comment` apres confirmation accessible. Le commentaire est retire apres reponse RPC ou Broadcast. L'evenement `comment_deleted` est traite avec `id` et `deleted_at` seulement.

## Broadcast Prive

Le client s'abonne au topic exact `comments:public` avec `{ private: true }`.

Evenements traites:

- `comment_created`;
- `comment_updated`;
- `comment_deleted`.

Les payloads malformes sont ignores. Les suppressions ignorent tout champ supplementaire pour le traitement metier.

## Changement De Pseudo

Les pseudos affiches proviennent de `list_comments`. Lorsqu'un profil change de pseudo, `auth.js` emet `memoriz:profile-ready`; `comments.js` recharge alors la liste pour afficher le pseudo courant sur les anciens commentaires.

## Mode Degrade

Si la configuration Supabase, le SDK, la session ou les RPC sont indisponibles, le formulaire est desactive, aucun commentaire fictif n'est ajoute et le quiz solo reste utilisable.

## Erreurs

Les erreurs serveur stables sont traduites cote UI:

- `invalid_comment_content`;
- `comment_too_long`;
- `comment_limit_reached`;
- `authentication_required`;
- `profile_required`;
- `comment_forbidden`;
- `comment_deleted`;
- `invalid_pagination`.

## Accessibilite Et Responsive

La section expose des labels, `aria-live`, `time datetime`, boutons nommes, confirmation clavier et focus apres edition/suppression. Les styles couvrent desktop, mobile 390 px, theme clair/sombre et zoom 200 % sans largeur fixe bloquante.

## Limites

- Pas de moderation ni signalement.
- Pas de rate limit applicatif au-dela du quota serveur de 50 commentaires actifs.
- Une perte Realtime declenche une resynchronisation par `list_comments`.
- Le Broadcast ne rediffuse pas les anciens commentaires lors d'un changement de pseudo; le rechargement frontend les synchronise.
