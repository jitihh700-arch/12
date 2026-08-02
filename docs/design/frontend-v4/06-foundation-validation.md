# Memoriz V4 - Validation Lot 1

## Validations executees

- `node --check assets/js/v4-shell.js` : OK.
- `node --check assets/js/auth.js` : OK.
- `npm run lint` : OK.
- `npm run format:check` : OK.
- `npm run security:scan` : OK.
- `npm run test:frontend` : 52/52 tests OK.
- `npm run test:all` : OK.
- `npm run build:render` avec valeurs publiques factices : OK.
- `npm run test:render-build` : OK.
- `git diff --check` : OK.
- `npx playwright test tests/frontend/frontend-v4-foundations.spec.js` après correction de portée : 13/13 tests OK.
- Contrôle Playwright direct du routage V4 : OK.

## Resultats detailles

- Auth frontend : 9/9.
- Commentaires frontend : 6/6.
- Realtime commentaires : OK.
- Quiz UI et leaderboard : 7/7.
- Multijoueur frontend : 6/6.
- Suite frontend complete : 52/52.
- Backend : 29/29.
- Socket backend : 8/8.
- Cohérence seed quiz : 26 catégories, 446 réponses.

## Controle de perimetre

- Aucun changement backend.
- Aucun changement Supabase.
- Aucun changement `assets/js/quiz-data.js`.
- Aucun fichier `dist` suivi.
- Aucun fichier `assets/js/supabase-runtime-config.js` suivi.
- Aucun fichier `backend/.env` suivi.
- Les sorties Supabase locales peuvent contenir des clés générées de développement ; elles ne sont pas reprises dans ce document.

## Notes

Le lancement de Supabase local a été nécessaire pour les suites historiques frontend et intégration.
Une correction complémentaire a ajouté les pages V4 Multijoueur et Communauté, ainsi qu'un écran d'introduction Sharingan animé, pour répondre à la revue utilisateur.
La navigation V4 affiche désormais une seule vue principale à la fois : Accueil, Explorer, Solo, Multijoueur, Communauté ou Articles.
L'introduction n'est plus bloquée par un état `sessionStorage` persistant ; elle se rejoue au lancement normal de la page et peut seulement être désactivée par le flag de test `MEMORIZ_V4_SKIP_INTRO`.
L'introduction utilise directement les images suivies dans `assets/images/memoriz/intro/web/` et `assets/images/memoriz/intro/mobile/`.
Le fallback texte reste caché quand ces images sont disponibles.
La séquence d'introduction utilise deux calques d'image pour effectuer un fondu fluide entre les cinq états, sans changement brutal de `src` visible.

## Captures de controle

- `test-results/ui-review/after-routed-home.png`
- `test-results/ui-review/after-routed-multiplayer.png`
- `test-results/ui-review/after-routed-community.png`
- `test-results/ui-review/after-intro-launch.png`
- `test-results/ui-review/after-intro-real-assets-settled.png`
- `test-results/ui-review/after-intro-smooth-step-1.png`
- `test-results/ui-review/after-intro-smooth-crossfade.png`
