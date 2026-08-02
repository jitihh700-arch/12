# Memoriz V4 - Plan d'impact tests

## Objectif

La refonte V4 va modifier fortement `index.html`, CSS et orchestration UI. Les tests doivent prouver que la nouvelle structure visuelle ne casse ni les contrats métier ni les usages existants.

## Tests existants à protéger

Suites frontend sensibles :

- `tests/frontend/phase-2b-auth.spec.js`;
- `tests/frontend/phase-3b-comments.spec.js`;
- `tests/frontend/phase-4b-quiz-leaderboard.spec.js`;
- `tests/frontend/phase-5-multiplayer.spec.js`;
- `tests/frontend/phase-6-full-journey.spec.js`;
- `tests/frontend/multiplayer-categories-regression.spec.js`;
- `tests/frontend/multiplayer-init-regression.spec.js`;
- `tests/frontend/multiplayer-start-regression.spec.js`.

Ces tests dépendent de sélecteurs historiques. Deux stratégies sont possibles pendant l'implémentation :

- conserver les IDs/classes publics dans les nouveaux composants;
- ou adapter les tests dans le même commit, avec justification explicite.

## Tests V4 à ajouter

Écrans et navigation :

- une seule vue principale visible à la fois;
- navigation desktop horizontale;
- navigation mobile inférieure;
- retour Home depuis chaque vue;
- aucun empilement complet de Home, catégories, articles, commentaires et modales.

Responsive :

- captures et assertions à 320, 390, 768, 1024, 1440 et 1920 px;
- absence d'overflow horizontal;
- textes de boutons non coupés;
- navigation utilisable au doigt sur mobile.

Intro :

- séquence complète avec horloge déterministe;
- bouton passer;
- état reduced-motion;
- pas de blocage si un asset échoue.

Explorer :

- 26 catégories disponibles;
- recherche;
- filtres;
- carte catégorie lance le solo;
- état vide.

Solo :

- démarrage sans Supabase;
- démarrage avec profil;
- saisie bonne/mauvaise réponse;
- finalisation;
- score serveur inchangé;
- réponses non exposées avant fin.

Profil :

- création pseudo;
- changement pseudo;
- erreurs de validation;
- délai de changement;
- focus et aria.

Classement :

- ouverture depuis navigation;
- top 20;
- rang personnel;
- état sans profil;
- rafraîchissement après fin de quiz.

Commentaires :

- publication;
- validation vide et 500 caractères;
- édition;
- suppression;
- actions propriétaire uniquement;
- contenu utilisateur non exécuté comme HTML;
- Realtime privé toujours initialisé par session.

Multijoueur :

- création;
- rejoindre;
- lobby;
- prêt;
- lancement hôte uniquement;
- double clic sans double `startGame`;
- jeu;
- réponse;
- réactions;
- résultat final;
- reconnexion et état salle selon snapshots serveur.

## Tests sécurité

À conserver ou compléter :

- `npm run security:scan`;
- recherche des marqueurs de secrets : service role, clé secrète Supabase, URL PostgreSQL, access token, refresh token;
- `git ls-files assets/js/supabase-runtime-config.js backend/.env dist`;
- aucun secret dans les docs ou assets;
- aucune donnée utilisateur injectée via `innerHTML`;
- aucun changement backend, Supabase ou migrations pour la refonte visuelle.

## Validations recommandées

Commandes minimales pendant la reconstruction :

```powershell
npm run lint
npm run format:check
npm run security:scan
npm run test:frontend
npm run test:backend
npm run test:backend:socket
npm run test:all
npm run build:render
npm run test:render-build
git diff --check
git status --short
```

Pour les captures Playwright :

- avant : `test-results/ui-review/before-desktop.png`, `test-results/ui-review/before-mobile.png`;
- après : `test-results/ui-review/after-desktop.png`, `test-results/ui-review/after-mobile.png`;
- comparaisons visuelles ciblées sur shell, navigation, home, explorer, solo, multijoueur, communauté et profil.

`test-results/` reste ignoré.

## Risques principaux

| Risque | Impact | Mitigation |
| --- | --- | --- |
| IDs historiques supprimés | Tests et modules cassés | Garder les IDs ou adapter tests et code ensemble |
| Modales transformées en vues sans focus management | Régression accessibilité | Tests clavier et aria obligatoires |
| Intro trop lourde | Chargement lent | Assets locaux, lazy loading, reduced-motion |
| `innerHTML` avec données utilisateur | XSS | Helpers DOM sûrs, `textContent`, tests injection |
| Navigation SPA casse le solo offline | Régression produit | Test sans Supabase obligatoire |
| Multijoueur visuel diverge du serveur | Bugs critiques | Le snapshot serveur reste source de vérité |
| Build Render oublie le runtime config | Production cassée | `npm run build:render` et `npm run test:render-build` |

## Critères pour démarrer l'implémentation

- Les quatre documents d'audit sont validés.
- La branche contient seulement le kit V4 et ces documents.
- Le WIP V3 n'est pas présent.
- `git diff --check` passe.
- `npm run security:scan` passe.
- `backend/`, `supabase/` et `assets/js/quiz-data.js` restent inchangés.
