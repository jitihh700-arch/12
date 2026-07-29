# Reponse incident

## Priorites

1. Stopper l'exposition: retirer une cle, couper une origine, desactiver un deploy fautif.
2. Preserver les preuves: logs redacted, hash du commit, heure UTC, symptomes.
3. Restaurer un service minimal: quiz solo statique, puis Supabase, puis backend temps reel.
4. Corriger par migration ou patch applicatif forward-only.
5. Rejouer les tests Phase 6 avant retour en production.

## Secrets

Si une cle est exposee:

- la revoquer immediatement;
- remplacer les secrets dans l'hebergeur;
- verifier `npm run security:scan`;
- inspecter l'historique Git avant tout push public.

## Donnees

Ne pas modifier manuellement les scores sans script audite. Preferer une migration ou une procedure SQL reproductible, executee d'abord en staging.
