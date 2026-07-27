# Authentification anonyme et profils

## Objectif

La Phase 2A ajoute seulement les fondations PostgreSQL/Supabase pour les profils joueurs. Elle ne branche pas encore le frontend, ne cree pas de backend applicatif et ne modifie pas le quiz existant.

## auth.users et public.profiles

Supabase gere deja les identites dans `auth.users`. Le projet ne cree donc pas de table publique `users`, afin d'eviter deux sources d'identite concurrentes.

La table `public.profiles` contient uniquement les donnees applicatives du joueur:

- `id`, qui reference `auth.users(id)` avec suppression en cascade;
- `pseudo` et `pseudo_normalized`;
- `total_points` et `quizzes_completed`;
- `pseudo_changed_at`, `last_played_at`, `created_at`, `updated_at`.

## Parcours futur de connexion anonyme

En Phase 2B, le frontend pourra creer une session anonyme Supabase. Apres connexion, il appellera `public.register_profile(p_pseudo)` pour initialiser le profil. Les appels suivants utiliseront `public.get_my_profile()` et, si besoin, `public.change_my_pseudo(p_pseudo)`.

Le client ne fournit jamais l'identifiant cible. Les fonctions utilisent `auth.uid()` cote base.

## Modele de menace

Les controles protegent contre:

- creation directe d'un profil avec un UUID falsifie;
- lecture du profil d'un autre joueur;
- modification directe du pseudo, des points ou du nombre de quiz;
- contournement de la regle des 14 jours;
- suppression physique par un joueur;
- pseudo duplique via casse, espaces externes ou espaces multiples;
- injection SQL dans les fonctions RPC.

Les fonctions n'utilisent pas de SQL dynamique et referencent les objets avec leurs schemas explicites.

## Normalisation des pseudos

`public.clean_pseudo(input_pseudo text)` nettoie le pseudo d'affichage:

- espaces de debut et de fin retires;
- espaces consecutifs reduits a un seul espace;
- casse et accents conserves pour l'affichage.

`public.normalize_pseudo(input_pseudo text)` applique le meme nettoyage puis passe la valeur en minuscules pour l'unicite.

Les accents ne sont pas retires arbitrairement. Par exemple, `Emilie` et `Émilie` restent deux valeurs differentes, tandis que `ÉMILIE` et `émilie` sont traitees comme identiques selon le comportement `lower()` de PostgreSQL et la collation de la base.

## Regle des 14 jours

La premiere selection de pseudo initialise `pseudo_changed_at` avec l'heure serveur. `public.change_my_pseudo(p_pseudo)` verrouille la ligne du profil avec `FOR UPDATE`, verifie `pseudo_changed_at + interval '14 days'`, puis met a jour le pseudo avec une nouvelle date serveur.

Aucune date envoyee par le client n'est acceptee.

## Fonctions SQL

`public.register_profile(p_pseudo text)`:

- exige `auth.uid()`;
- valide et nettoie le pseudo;
- cree un seul profil pour l'utilisateur courant;
- initialise `pseudo_changed_at` cote serveur;
- renvoie `profile_already_exists` ou `pseudo_already_taken` en cas de conflit.

`public.get_my_profile()`:

- exige `auth.uid()`;
- retourne seulement le profil de l'utilisateur courant.

`public.change_my_pseudo(p_pseudo text)`:

- exige `auth.uid()`;
- verrouille le profil courant;
- applique la limite de 14 jours;
- refuse les collisions;
- retourne le profil et `next_pseudo_change_at`.

## RLS et permissions

RLS est activee sur `public.profiles`.

La seule policy creee est `profiles_select_own`, limitee au role `authenticated` et a `auth.uid() = id`.

Aucune policy `insert`, `update` ou `delete` n'est creee. Les ecritures passent par les fonctions controlees.

Les droits table sont limites a `select` pour `authenticated`. `public.register_profile(p_pseudo)` et `public.change_my_pseudo(p_pseudo)` sont `SECURITY DEFINER` parce qu'elles doivent effectuer les ecritures tout en centralisant les regles. `public.get_my_profile()` reste sous RLS normale. Les fonctions definissent un `search_path` vide lorsque c'est necessaire.

Seules les RPC necessaires au client sont executables par `authenticated`: `register_profile`, `get_my_profile` et `change_my_pseudo`. Les helpers `clean_pseudo`, `normalize_pseudo`, `assert_valid_pseudo` et le trigger `set_profile_updated_at` ne sont pas exposes comme API cliente.

## Erreurs

Les erreurs fonctionnelles renvoyees par les fonctions sont documentees dans `docs/api/01-profile-contract.md`.

## Perte de session locale

Avec une session anonyme, la suppression des donnees locales du navigateur peut rendre le compte impossible a retrouver depuis ce navigateur. Cette limite devra etre expliquee dans l'interface avant activation.

## Limites de l'authentification anonyme

L'authentification anonyme ne prouve pas une identite durable. Elle sert a creer une experience joueur sans inscription immediate. La liaison future vers un compte permanent reste a definir, notamment pour eviter les doublons et proteger les scores.

## Tests

Le fichier `supabase/tests/database/profiles.test.sql` couvre la normalisation, la validation, l'unicite, la propriete, RLS, le changement de pseudo et les contraintes de points.

La validation runtime locale a ete executee avec Supabase CLI `2.110.0`, Docker Desktop et PostgreSQL local `17.6`. Les migrations, les tests pgTAP, les controles RLS, les permissions, les RPC, le delai de 14 jours, la concurrence et le comportement des accents sont detailles dans `docs/testing/01-phase-2a-database-validation.md`.

Le test de concurrence est documente dans le fichier SQL: il repose sur deux sessions concurrentes et sur le verrou `FOR UPDATE` de `change_my_pseudo`.

## Decisions restantes pour la Phase 2B

- choix exact du parcours UI pour creer le pseudo;
- message utilisateur pour les erreurs de pseudo;
- strategie de recuperation ou liaison de compte permanent;
- exposition future d'un leaderboard via vue ou fonction dediee;
- politique produit en cas de suppression de session anonyme.
