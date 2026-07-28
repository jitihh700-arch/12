# Validation Phase 3B - Interface commentaires

## Contexte

Branche: `feature/phase-3b-comments-ui`.

Objectif: valider l'integration frontend CRUD et temps reel des commentaires sans commencer les phases leaderboard, points, sessions, reactions, Express, Socket.io ou multijoueur.

## Versions

| Outil | Version attendue |
| --- | --- |
| Node.js | version locale du projet |
| npm | version locale du projet |
| Docker | Docker Desktop local |
| Supabase CLI | `2.110.0` |
| Supabase JS | `2.110.9` |
| Playwright | `1.62.0` |

## Commandes

```powershell
npx supabase start
npx supabase db reset
npx supabase db reset
npx supabase test db
npx supabase db lint --local
npm run test:comments:realtime
npm run test:comments
npm run test:auth
npm run test:frontend
powershell -ExecutionPolicy Bypass -File supabase/tests/integration/comments_direct_access_security.ps1
powershell -ExecutionPolicy Bypass -File supabase/tests/integration/comments_limit_concurrency.ps1
```

## Couverture Frontend Commentaires

La suite `tests/frontend/phase-3b-comments.spec.js` contient 6 tests Playwright et couvre:

- chargement indisponible et quiz solo encore utilisable;
- etat vide;
- creation valide;
- contenu vide, espaces seuls, 500 et 501 caracteres;
- HTML affiche en texte brut;
- compteur;
- toast de succes;
- quota de 50 commentaires actifs;
- ordre serveur et pagination;
- absence de doublons;
- deux utilisateurs et Broadcast prive;
- boutons proprietaire uniquement;
- refus serveur force sur `update_my_comment` et `delete_my_comment`;
- modification, annulation, `is_edited`;
- suppression logique, confirmation, retrait chez deux utilisateurs;
- absence via `list_comments` apres suppression;
- changement de pseudo et ancien commentaire mis a jour apres synchronisation;
- payloads malformes ignores;
- desktop, mobile, theme clair, theme sombre et zoom 200 %;
- attributs ARIA, `time datetime`, labels et absence de debordement horizontal;
- regression generale: 26 categories, quiz, score, timer, page confidentialite.

`npm run test:frontend` execute 15 tests Playwright au total: 9 regressions auth/profil Phase 2B et 6 tests commentaires Phase 3B.

Des captures controlees sont produites dans les artefacts Playwright ignores par Git pour les etats indisponible, XSS texte, plusieurs commentaires, edition, confirmation de suppression, desktop, mobile et theme clair.

## Tests SQL Et Runtime

Les tests Phase 3A restent obligatoires:

- `npx supabase test db`: 164 assertions attendues;
- `npx supabase db lint --local`: aucun probleme de schema;
- Broadcast prive via `npm run test:comments:realtime`;
- acces direct refuse par `comments_direct_access_security.ps1`;
- quota concurrent limite exactement a 50 par `comments_limit_concurrency.ps1`.

## Erreurs Console

Les tests Playwright ne doivent pas reveler d'erreur console applicative inattendue. Les erreurs reseau volontairement provoquees dans les tests de mode degrade sont non bloquantes si le quiz solo reste utilisable.

## Secrets Et Artefacts

Les captures temporaires, `test-results`, `playwright-report`, `supabase/.temp`, `node_modules` et `assets/js/supabase-runtime-config.js` ne doivent pas etre suivis par Git.

Les valeurs locales Supabase lues pour les tests ne sont pas ecrites dans le depot.

## Risques Residuels

- Pas de moderation ni signalement des commentaires.
- Pas de rate limiting frontend specifique.
- Les commentaires supprimes sont caches par l'interface et `list_comments`, mais la suppression reste logique en base.
- Le rechargement de pseudo depend de l'evenement profil frontend; un autre onglet peut se resynchroniser au prochain chargement ou evenement applicatif.
