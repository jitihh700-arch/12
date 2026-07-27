# Phase 1 - Extraction statique CSS et JavaScript

## Reference

- Commit de reference avant Phase 1: `651caac0e032f5d2f95d505028ab31a43c859b76`
- Premier commit Phase 1 amende: `bf7d78a715def3c8793834027cd0ba679d626f28`
- Objectif: separer le CSS et le JavaScript statiques sans modifier le comportement, l'interface, les donnees, le score, le timer, les sons, le blog, les pages legales ou les partages.

## Agents et skills utilises

Agents locaux utilises depuis `C:\Users\HP\Documents\.codex\agents`:

- `code-mapper`: cartographie de `assets/js/app.js` avant separation.
- `frontend-developer`: separation statique sans changement visuel.
- `test-automator`: verification Playwright et controles automatises.
- `documentation-engineer`: rapport Phase 1 et mise a jour de la documentation.

Skills utilises:

- `ui-ux-pro-max`: controle visuel/UX sans changement d'interface.
- `webapp-testing`: tests Playwright sur application statique.

## Structure avant

Avant la Phase 1 complete, le depot avait deja une premiere extraction:

```text
index.html
assets/
├── css/
│   └── app.css
└── js/
    └── app.js
```

Avant toute Phase 1, dans le commit `651caac`, `index.html` contenait encore le CSS, les donnees et le JavaScript inline.

## Structure apres

```text
index.html
assets/
├── css/
│   └── app.css
└── js/
    ├── quiz-data.js
    ├── ui.js
    ├── quiz-solo.js
    └── app.js
```

Les scripts sont charges en scripts classiques avec `defer`, dans cet ordre:

1. `assets/js/quiz-data.js`
2. `assets/js/ui.js`
3. `assets/js/quiz-solo.js`
4. `assets/js/app.js`

Aucun `type="module"`, `import/export`, npm, bundler, TypeScript, Supabase, Express ou Socket.io n'a ete ajoute.

## Lignes

| Fichier | Lignes |
| --- | ---: |
| `index.html` avant Phase 1 | 911 |
| `index.html` apres Phase 1 | 175 |
| `assets/js/quiz-data.js` | 186 |
| `assets/js/ui.js` | 83 |
| `assets/js/quiz-solo.js` | 91 |
| `assets/js/app.js` | 2 |

## Cartographie avant extraction JS

| Element | Responsabilite | Dependances | Destination | Exposition `window` |
| --- | --- | --- | --- | --- |
| `animeCelebresList` a `rapFrUsList` | Reponses statiques simples | `quizData` | `quiz-data.js` | Non |
| `trouveAnimeList`, `devinePersonnageList`, `animeParOrganisationList` | Reponses statiques avec indices | `quizData`, listes d'indices | `quiz-data.js` | Non |
| `ldcAnnees`, `ldcValeurs`, `ballonAnnees`, `ballonValeurs` | Donnees paralleles annee/reponse | listes derivees | `quiz-data.js` | Non |
| `ligueDesChampionsList`, `ballonDorList` | Donnees derivees depuis annees/valeurs | `ldc*`, `ballon*` | `quiz-data.js` | Non |
| `quizData` | Registre des listes de reponses | toutes les listes | `quiz-data.js` | Non |
| `devinePersonnageIndices`, `trouveAnimeEmojis`, `animeParOrganisationIndices` | Indices et descriptions de categories | `categoryMapping` | `quiz-data.js` | Non |
| `categoryMapping` | Lien entre cle de categorie, titre, donnees et indices | `quizData`, listes d'indices | `quiz-data.js` | Non |
| `canvas`, `ctx`, `particles`, `Particle` | Fond anime canvas | DOM, Canvas API, theme | `ui.js` | Non |
| `resizeCanvas`, `initParticles`, `animateParticles`, `updateParticlesForTheme` | Animation et adaptation du fond | `canvas`, `particles`, `document.body` | `ui.js` | Non |
| listener `themeToggle` particules | Synchronisation visuelle des particules | `themeToggle`, `updateParticlesForTheme` | `ui.js` | Non |
| `showMessage` | Affichage des messages temporaires | DOM, appele par quiz solo | `ui.js` | Non |
| `legalContent`, `showLegalPage`, `initLegalPages` | Pages legales et modale | DOM, footer | `ui.js` | Non |
| `initBlogArticles` | Ouverture/reduction des articles | DOM `.read-more` | `ui.js` | Non |
| `initTheme` | Theme clair/sombre et `memoriz_theme` | DOM, `localStorage` | `ui.js` | Non |
| `normalizeString` | Normalisation des reponses | `QuizGame.findMatchingQuestion` | `quiz-solo.js` | Non |
| `currentGame`, `timerInterval` | Etat solo courant | fonctions quiz solo | `quiz-solo.js` | Non |
| `QuizGame` | Modele et regles du quiz solo | `normalizeString`, donnees quiz | `quiz-solo.js` | Non |
| `showGamePanel` | Demarrage de partie et rendu du panneau | `categoryMapping`, `QuizGame`, UI | `quiz-solo.js` | Non pour handlers inline existants; global classique disponible pour `app.js` |
| `playSoundCorrect`, `playSoundWrong` | Sons de feedback | Web Audio API | `quiz-solo.js` | Non |
| `handleQuickSubmit` | Soumission de reponse | `currentGame`, `showMessage`, UI quiz | `quiz-solo.js` | Non |
| `updateRow`, `updateFoundList`, `updateScoreAndProgress` | Mise a jour du panneau de quiz | `currentGame`, DOM | `quiz-solo.js` | Non |
| `startTimer` | Decompte local 600 secondes | `timerInterval`, `endGame` | `quiz-solo.js` | Non |
| `shareOnWhatsApp`, `shareOnTwitter` | Partage des resultats | `currentGame`, `window.open` | `quiz-solo.js` | Oui |
| `endGame` | Ecran final et boutons inline | `currentGame`, partage, restart/close | `quiz-solo.js` | Non directement, mais appelle des handlers inline exposes |
| `closeGame`, `restartGame` | Fermeture et redemarrage | DOM, `currentGame`, `timerInterval` | `quiz-solo.js` | Oui |
| `DOMContentLoaded` | Bootstrap general | categories, init UI, quiz solo | `app.js` | Non |
| assignations `window.*` | Compatibilite handlers inline generes | `closeGame`, `restartGame`, partages | `app.js` | Oui, limite |

## Repartition exacte du JavaScript

### `quiz-data.js`

Contient uniquement:

- listes de reponses;
- listes d'annees et valeurs;
- listes derivees `ligueDesChampionsList` et `ballonDorList`;
- `quizData`;
- indices/emojis/organisations;
- `categoryMapping`.

Ordre et contenu conserves.

### `ui.js`

Contient:

- fond canvas et particules;
- synchronisation particules/theme;
- `showMessage`;
- contenus et modales legales;
- blog;
- theme clair/sombre et cle `localStorage` `memoriz_theme`.

### `quiz-solo.js`

Contient:

- normalisation;
- classe `QuizGame`;
- etat `currentGame` et `timerInterval`;
- lancement de partie;
- validation, score, progression et timer;
- sons;
- fermeture, redemarrage et fin;
- partage WhatsApp et X/Twitter.

### `app.js`

Contient uniquement:

- `DOMContentLoaded`;
- binding des cartes `.category-card`;
- appels `initLegalPages()`, `initBlogArticles()`, `initTheme()`;
- exposition limitee des fonctions necessaires aux handlers inline.

## Fonctions deplacees

- Vers `ui.js`: `resizeCanvas`, `initParticles`, `animateParticles`, `updateParticlesForTheme`, `showMessage`, `showLegalPage`, `initLegalPages`, `initBlogArticles`, `initTheme`, classe `Particle`.
- Vers `quiz-solo.js`: `normalizeString`, classe `QuizGame`, `showGamePanel`, `playSoundCorrect`, `playSoundWrong`, `handleQuickSubmit`, `updateRow`, `updateFoundList`, `updateScoreAndProgress`, `startTimer`, `shareOnWhatsApp`, `shareOnTwitter`, `endGame`, `closeGame`, `restartGame`.
- Conserves dans `app.js`: initialisation `DOMContentLoaded` et assignations `window`.

## Donnees deplacees

- Toutes les constantes `*List`.
- `ldcAnnees`, `ldcValeurs`, `ballonAnnees`, `ballonValeurs`.
- `ligueDesChampionsList`, `ballonDorList`.
- `quizData`.
- `devinePersonnageIndices`, `trouveAnimeEmojis`, `animeParOrganisationIndices`.
- `categoryMapping`.

## Fonctions exposees sur `window`

Exposition explicite et limitee:

```js
window.closeGame = closeGame;
window.restartGame = restartGame;
window.shareOnWhatsApp = shareOnWhatsApp;
window.shareOnTwitter = shareOnTwitter;
```

Justification: `endGame()` genere encore des boutons avec `onclick="closeGame()"`, `onclick="restartGame()"`, `onclick="shareOnWhatsApp()"` et `onclick="shareOnTwitter()"`. Ces handlers inline sont conserves pour eviter une migration comportementale dans cette phase.

## Handlers inline conserves

Conserves dans le HTML genere par `endGame()`:

- `onclick="closeGame()"`
- `onclick="restartGame()"`
- `onclick="shareOnWhatsApp()"`
- `onclick="shareOnTwitter()"`

Les handlers dynamiques existants dans `showGamePanel()` restent aussi inchanges:

- `quick-submit.onclick`
- `quick-input.onkeypress`
- `close-game-btn.onclick`
- `restart-category-btn.onclick`

## Controle des donnees

Methode:

1. Extraire le bloc de donnees original depuis `651caac:index.html`, entre `const animeCelebresList` et `function normalizeString`.
2. Executer ce bloc dans un contexte Node `vm`.
3. Executer `assets/js/quiz-data.js` dans un autre contexte Node `vm`.
4. Comparer par JSON:
   - nombre de categories;
   - ordre des cles;
   - titres;
   - `showYears`;
   - `yearsList`;
   - `hintList`;
   - listes `data`;
   - cles et valeurs de `quizData`.

Resultat:

- categories originales: 26;
- categories actuelles: 26;
- ordre identique: oui;
- textes identiques: oui;
- nombres de reponses identiques: oui;
- aucun ecart detecte.

## Tests executes

- `node --check assets/js/quiz-data.js`
- `node --check assets/js/ui.js`
- `node --check assets/js/quiz-solo.js`
- `node --check assets/js/app.js`
- Test Playwright statique via `file://`.
- Verification de chargement CSS.
- Verification de l'ordre des quatre scripts et de `defer`.
- Verification des fonctions exposees sur `window`.
- Verification des 26 categories.
- Verification de chaque categorie avec son total.
- Reponse correcte.
- Reponse incorrecte.
- Deuxieme saisie d'une reponse deja trouvee: comportement existant confirme, le message reste "n'est pas dans la liste".
- Score.
- Progression.
- Timer.
- Restart.
- Close.
- Theme clair/sombre.
- Blog.
- Modale legale.
- Ecran de fin.
- Partage WhatsApp.
- Partage X/Twitter.
- Detection de declarations top-level dupliquees.
- Comparaison visuelle desktop et mobile.

## Resultats

- Tous les checks JavaScript passent.
- Tous les tests Playwright passent.
- Les 26 categories s'ouvrent avec les totaux attendus.
- Aucun doublon top-level detecte dans les scripts classiques.
- Aucun changement de donnees detecte.
- Aucun changement visuel detecte sur les screenshots figes.

## Controle visuel

Methode:

- comparaison contre le commit `bf7d78a715def3c8793834027cd0ba679d626f28`;
- viewports desktop `1366x900` et mobile `390x844`;
- `localStorage` nettoye;
- `Math.random` stabilise;
- animations/transitions figees;
- canvas masque pour eviter le hasard du rendu de particules.

Resultat:

- desktop: `0` pixel different;
- mobile: `0` pixel different.

## Erreurs console

Le test detecte une erreur console connue et preexistante:

```text
X-Frame-Options may only be set via an HTTP header sent along with a document. It may not be set inside <meta>.
```

Cette erreur existait deja avant la separation et correspond au risque documente en Phase 0. Aucune nouvelle erreur console n'a ete detectee.

## Risques residuels

- `showMessage`, `updateRow`, `updateFoundList`, `endGame` et `showLegalPage` utilisent encore `innerHTML`; ce point est volontairement non corrige en Phase 1 pour ne pas changer le comportement.
- Deux listeners existent toujours sur `themeToggle`: un pour les particules, un pour la persistence du theme. C'est un comportement preexistant conserve.
- `window.onclick` reste utilise pour la modale legale. C'est une dette preexistante.
- Les handlers inline generes par `endGame()` sont conserves.
- Les scripts restent globaux car la phase interdit `type="module"` et `import/export`.

## Dettes techniques restantes

- Extraire plus tard les templates DOM pour reduire `innerHTML`.
- Ajouter des tests unitaires formels quand un outil de test sera introduit.
- Remplacer progressivement les handlers inline par des listeners controles.
- Introduire une politique CSP cote serveur lorsque l'architecture backend existera.
- Clarifier les fichiers d'assets references mais absents (`favicon.svg`, `favicon.ico`, `site.webmanifest`).

## Ecarts avec l'architecture cible

- `quiz-core.js` n'a pas ete cree: la mission Phase 1 demandait explicitement seulement `quiz-data.js`, `ui.js`, `quiz-solo.js` et `app.js`.
- `comments.js`, `leaderboard.js`, `multiplayer.js`, `socket.js`, `auth.js` et `api.js` n'ont pas ete crees: les fonctionnalites associees sont interdites dans cette phase.
- Les scripts ne sont pas des modules ES: la mission impose des scripts classiques charges avec `defer`.
