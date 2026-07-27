# Validation database Phase 2A

## Contexte

Validation runtime executee sur la branche `feature/phase-2a-supabase-profiles`, apres correction de la structure Supabase CLI.

Aucune base distante n'a ete utilisee. Aucun `supabase login`, `supabase link`, `supabase db push` ou reset lie a un projet distant n'a ete lance.

## Prerequis constates

| Outil | Resultat |
| --- | --- |
| Node.js | `v24.11.1` |
| npm | `11.6.2` |
| Docker Client | `29.6.2` |
| Docker Server | `29.6.2` |
| Docker Desktop | `4.83.0` |
| Docker Compose | `v5.3.1` |
| Backend Docker | WSL 2 |
| Kernel Docker | `6.18.33.2-microsoft-standard-WSL2` |
| Supabase CLI | `2.110.0`, installee localement dans le projet |
| PostgreSQL local Supabase | `17.6`, collation `en_US.UTF-8` |

Le binaire Docker n'etait pas dans le PATH de la session Codex. Le chemin `C:\Program Files\Docker\Docker\resources\bin` a ete ajoute uniquement pour les commandes du processus courant, sans modifier la configuration systeme Windows.

## Fichiers Supabase

Migrations finales, dans l'ordre applique par Supabase:

1. `supabase/migrations/20260727140000_profiles_schema.sql`
2. `supabase/migrations/20260727140100_profiles_rls.sql`
3. `supabase/migrations/20260727140200_profile_functions.sql`

Test pgTAP final:

- `supabase/tests/database/profiles.test.sql`

Configuration locale ajoutee:

- `supabase/config.toml`
- `supabase/.gitignore`

`supabase/config.toml` garde la validation locale autonome: analytics desactive pour eviter le healthcheck Logflare non necessaire a la Phase 2A, seed desactive car aucun seed n'est requis, services non necessaires a la validation DB desactives, anonymous auth activee pour le futur parcours anonyme.

## Supabase CLI locale

La CLI est installee uniquement comme dependance de developpement locale:

- `package.json`
- `package-lock.json`
- `supabase@2.110.0`

Une tentative initiale avec npm sans `package.json` a installe temporairement `supabase` dans le prefix utilisateur. Cette dependance hors projet a ete retiree avant la validation finale.

## Demarrage local

`npx supabase start` a d'abord echoue avec un timeout de healthcheck sur le conteneur Logflare/analytics. Apres desactivation de `[analytics].enabled`, le stack local a demarre correctement et les trois migrations ont ete appliquees.

Les cles locales affichees par la CLI n'ont ete copiees ni dans la documentation, ni dans `.env.example`, ni dans les migrations, ni dans les tests.

## Resets database

Premier `npx supabase db reset`:

- resultat: succes;
- migrations appliquees dans l'ordre attendu;
- aucune erreur SQL.

Second `npx supabase db reset`:

- resultat: succes;
- migrations reappliquees dans le meme ordre;
- reproductibilite confirmee.

Reset final apres activation de l'auth anonyme:

- resultat: succes;
- migrations reappliquees dans le meme ordre;
- tests relances sur cet etat final.

## pgTAP

Commande:

```powershell
npx supabase test db
```

Resultat:

- fichier detecte: `supabase/tests/database/profiles.test.sql`;
- fichiers executes: `1`;
- assertions prevues: `46`;
- assertions executees: `46`;
- resultat: `PASS`;
- tests ignores: `0`;
- erreur SQL cachee: aucune.

La sortie indique `All tests successful` et `Result: PASS`.

## Lint SQL

Commande:

```powershell
npx supabase db lint --local
```

Resultat:

- schemas inspectes: `extensions`, `public`;
- erreurs: aucune;
- sortie: `No schema errors found`.

## Structure verifiee

Verifications reelles effectuees dans PostgreSQL local:

- `public.profiles` existe;
- `public.profiles.id` reference `auth.users(id)`;
- `ON DELETE CASCADE` est present;
- RLS est activee;
- colonnes et types attendus presents;
- contraintes attendues presentes;
- index unique sur `pseudo_normalized` present.

## Permissions et RLS

Resultats verifies:

- `anon` ne peut pas selectionner `public.profiles`;
- `authenticated` a le droit table `select`, limite par RLS a `auth.uid() = id`;
- `authenticated` ne peut pas inserer directement;
- `authenticated` ne peut pas mettre a jour directement;
- `authenticated` ne peut pas supprimer directement;
- modification directe de `total_points` refusee;
- modification directe de `quizzes_completed` refusee;
- `anon` ne peut executer aucune RPC profil;
- `authenticated` peut executer uniquement `register_profile`, `get_my_profile` et `change_my_pseudo`;
- les helpers `clean_pseudo`, `normalize_pseudo`, `assert_valid_pseudo` et `set_profile_updated_at` ne sont pas exposes a `authenticated`.

## RPC

Resultats verifies:

- `register_profile` utilise `auth.uid()`;
- aucun UUID cible n'est accepte par les RPC;
- `get_my_profile` retourne uniquement le profil courant;
- `change_my_pseudo` utilise `auth.uid()`;
- collision insensible a la casse refusee;
- delai de 14 jours applique;
- dates calculees par PostgreSQL;
- aucune fonction RPC ne contient de SQL dynamique dangereux.

## Concurrence

Deux connexions PostgreSQL concurrentes ont appele `change_my_pseudo` sur le meme profil apres vieillissement de `pseudo_changed_at`.

Script reproductible ajoute:

- `supabase/tests/integration/profile_concurrency.ps1`

Resultat:

- une operation a reussi;
- l'autre a echoue avec `pseudo_change_too_soon`;
- le profil final contient un seul nouveau pseudo;
- le verrou `FOR UPDATE` empeche le contournement du delai.

## Accents et collation

PostgreSQL local:

- version: `17.6`;
- collation: `en_US.UTF-8`;
- ctype: `en_US.UTF-8`.

Comportement observe:

| Comparaison normalisee | Resultat |
| --- | --- |
| `Élodie` / `élodie` | identiques |
| `Álex` / `álex` | identiques |
| `I` / `i` | identiques |
| `İ` / `i` | differents |
| `é` / `e` | differents |

Les accents sont conserves. Aucune translitteration automatique n'est appliquee.

## Avertissements

- La CLI Supabase affiche des cles locales au demarrage. Elles n'ont pas ete ajoutees au depot.
- Le premier demarrage a necessite la desactivation d'analytics local, car Logflare n'etait pas sain dans ce contexte Docker.

## Verdict

PHASE 2A RUNTIME VALIDEE
