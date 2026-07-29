# Configuration Supabase production

## Actions manuelles

1. Creer un projet Supabase de production.
2. Activer les connexions anonymes dans Auth.
3. Verifier les URL autorisees Auth selon le domaine frontend.
4. Appliquer les migrations avec une procedure controlee, apres sauvegarde.
5. Verifier que le schema `private` n'est pas accessible aux roles clients.
6. Verifier RLS sur toutes les tables publiques sensibles.
7. Verifier les grants des RPC exposees a `authenticated`.
8. Activer Realtime Broadcast prive necessaire aux commentaires.
9. Recuperer l'URL Supabase et la cle publishable pour le frontend.
10. Stocker la cle backend secrete dans le secret manager de l'hebergeur backend.

## Interdictions

Ne pas executer sans validation explicite:

- `supabase login`;
- `supabase link`;
- `supabase db push`;
- modification directe d'une base distante depuis la Phase 6 locale.

## Verification

Avant production, rejouer sur staging:

```powershell
npx supabase db reset
npx supabase test db
npx supabase db lint --local
```

Puis verifier manuellement RLS, policies, fonctions `SECURITY DEFINER`, grants et publication Realtime.
