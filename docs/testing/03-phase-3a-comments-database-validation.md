# Validation Phase 3A - Commentaires database

## Contexte

Branche: `feature/phase-3a-comments-database`.

Objectif: valider la fondation PostgreSQL/Supabase des commentaires sans interface frontend.

## Versions

| Outil | Version validee |
| --- | --- |
| Node.js | `v24.11.1` |
| npm | `11.6.2` |
| Docker | client/server `29.6.2` |
| PostgreSQL local | `17.6` |
| Supabase CLI | `2.110.0` |
| Supabase JS | `2.110.9` |

## Migrations

1. `supabase/migrations/20260728100000_comments_schema.sql`
2. `supabase/migrations/20260728100100_comments_rls.sql`
3. `supabase/migrations/20260728100200_comment_functions.sql`
4. `supabase/migrations/20260728100300_comments_realtime.sql`
5. `supabase/migrations/20260728100400_comments_realtime_hardening.sql`

## Commandes

```powershell
$env:Path = 'C:\Program Files\Docker\Docker\resources\bin;' + $env:Path
npx supabase start
npx supabase db reset
npx supabase db reset
npx supabase test db
npx supabase db lint --local
powershell -ExecutionPolicy Bypass -File supabase/tests/integration/comments_limit_concurrency.ps1
powershell -ExecutionPolicy Bypass -File supabase/tests/integration/comments_direct_access_security.ps1
npm run test:comments:realtime
```

## Resultats Attendus

- profils: 46 assertions pgTAP;
- commentaires: 118 assertions pgTAP;
- total `supabase test db`: 164 assertions;
- deux resets reproductibles;
- lint sans probleme de schema;
- concurrence quota 50 validee;
- Broadcast prive valide pour `comment_created`, `comment_updated` et `comment_deleted`.

Execution validee le 28 juillet 2026:

- `npx supabase start`: OK, sortie masquee pour ne pas afficher les cles locales;
- `npx supabase db reset`: OK;
- deuxieme `npx supabase db reset`: OK;
- `npx supabase test db`: 164 assertions, PASS;
- `npx supabase db lint --local`: aucun resultat;
- `npm run test:comments:realtime`: OK;
- `supabase/tests/integration/comments_direct_access_security.ps1`: OK;
- `supabase/tests/integration/comments_limit_concurrency.ps1`: OK, avec une erreur SQL attendue `comment_limit_reached` pour la creation concurrente perdante.

## Permissions

`authenticated` n'a plus `select` sur `public.comments`. Les insertions, modifications, suppressions et lectures directes sont refusees. Les RPC client sont les seules surfaces applicatives.

`realtime.messages` possede une policy de lecture limitee au topic `comments:public` pour `authenticated`. Aucune policy `insert` client n'est creee.

## Secrets

Le test Realtime lit les valeurs locales via `npx supabase status --output json`, les garde en memoire et ne les ecrit pas dans Git. Aucun fichier runtime, temporaire, rapport de test ou `node_modules` ne doit etre suivi.

## Risques Residuels

- La moderation des commentaires reste hors Phase 3A.
- Supabase local peut conserver un grant interne `INSERT` sur `realtime.messages`, mais l'absence de policy `INSERT` bloque l'injection cliente.
- L'interface Phase 3B devra rendre le contenu avec `textContent`.
