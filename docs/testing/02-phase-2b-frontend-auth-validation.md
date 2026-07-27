# Validation Phase 2B - Authentification anonyme frontend

## Contexte

Branche: `feature/phase-2b-anonymous-auth`.

Objectif: rendre la Phase 2B reproductible, testee et documentee avant fusion. Aucune fonctionnalite de Phase 3 n'est ajoutee.

## Versions

| Outil | Version validee |
| --- | --- |
| Node.js | `v24.11.1` |
| npm | `11.6.2` |
| Docker | client `29.6.2`, server `29.6.2` |
| PostgreSQL local | `17.6` |
| Supabase CLI | `2.110.0` |
| Supabase JS | `2.110.9` |
| Playwright | `1.62.0` |

## Strategie de chargement SDK

`index.html` charge `@supabase/supabase-js@2.110.9/dist/umd/supabase.min.js` depuis jsDelivr. La version est exacte et ne depend pas de `latest`. Aucun chemin `node_modules` n'est charge directement par le navigateur.

Le choix CDN garde le frontend statique simple. Le risque residuel principal est la disponibilite du CDN; le mode degrade laisse le quiz solo jouable si le SDK ne se charge pas.

## Configuration runtime

Le fichier reel `assets/js/supabase-runtime-config.js` est ignore par Git.

Commande reproductible:

```powershell
$env:SUPABASE_URL = '<url>'
$env:SUPABASE_PUBLISHABLE_KEY = '<publishable-key>'
npm run config:supabase
```

Le script `scripts/generate-supabase-config.mjs` refuse les valeurs absentes et les cles ressemblant a `service_role`, `sb_secret` ou a une secret key.

## Commandes de tests

```powershell
npm run test:auth
npm run test:frontend
npx supabase db reset
npx supabase db reset
npx supabase test db
npx supabase db lint --local
powershell -ExecutionPolicy Bypass -File supabase/tests/integration/profile_concurrency.ps1
```

## Groupes Playwright

La suite `tests/frontend/phase-2b-auth.spec.js` contient 9 tests:

1. configuration manquante, Supabase indisponible et quiz solo;
2. timeout d'initialisation et absence de boucle de creation;
3. premiere visite, session anonyme, modale obligatoire, focus trap, profil et cache;
4. persistance reload, nouvel onglet, nouveau contexte et suppression stockage;
5. validation des pseudos;
6. deux utilisateurs et ecriture directe refusee;
7. changement de pseudo et delai 14 jours;
8. regression quiz;
9. responsive et accessibilite.

Execution validee le 28 juillet 2026:

- `npm run test:auth`: 9 tests passes;
- `npm run test:frontend`: 9 tests passes.

La suite accepte uniquement les erreurs attendues du scenario degrade: fichier de configuration runtime absent, requete simulee en echec et avertissement navigateur historique lie au meta `X-Frame-Options`.

## Validation SQL

La Phase 2B conserve les migrations Phase 2A. Les validations attendues restent:

- deux `db reset` reussis;
- `supabase test db`: 46 assertions, PASS;
- `supabase db lint --local`: aucun probleme de schema;
- test de concurrence: une seule modification de pseudo gagne.

Execution locale validee le 28 juillet 2026 avec deux resets consecutifs, 46 assertions pgTAP reussies, lint vide et test de concurrence OK.

## Recherche de secrets

Les fichiers suivis ne doivent contenir aucune valeur reelle:

- cle `service_role`;
- secret key;
- JWT secret;
- access token;
- refresh token;
- chaine `postgres://`;
- URL locale generee;
- cle locale generee.

Les mentions documentaires et placeholders sont autorises quand elles servent a interdire ces valeurs.

## Limites restantes

- La modale legale historique n'est pas refondue en composant dialog accessible pendant cette phase.
- Le CDN Supabase JS est fige par version, mais pas vendore localement.
- Le profil n'alimente pas encore les scores serveur; cela reste hors Phase 2B.
