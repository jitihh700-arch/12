# Architecture actuelle

## Depot analyse

Depot local: `C:\Users\HP\Documents\mohamed\12`

Remote Git verifie: `https://github.com/jitihh700-arch/12.git`

Fichiers suivis actuellement:

| Fichier | Role observe |
| --- | --- |
| `index.html` | Application principale: HTML, CSS, donnees quiz et JavaScript |
| `ads.txt` | Declaration publicitaire |
| `robots.txt` | Directives robots |
| `sitemap.xml` | Sitemap |
| `google022ca97efd079e8b.html` | Verification Google |
| `pinterest-96d89.html` | Verification Pinterest, avec contenu HTML externe integre |
| `apple-touch-icon.png`, `favicon-96x96.png`, `web-app-manifest-512x512.png` | Images/icones |

Il n'y a pas de `package.json`, pas de backend, pas de framework frontend, pas de module JavaScript separe, pas de configuration de tests, pas de Supabase et pas de Socket.io.

## Taille et responsabilites de `index.html`

`index.html` fait 911 lignes et environ 80 Ko. Il concentre:

- les metadonnees SEO et reseaux sociaux;
- les pseudo-headers de securite via balises `meta http-equiv`;
- tout le CSS entre les lignes 39 et 413;
- le HTML visible entre les lignes 415 et 542;
- tout le JavaScript entre les lignes 544 et 909;
- les donnees de quiz entre les lignes 623 et 778;
- la configuration de categories entre les lignes 780 et 808;
- le moteur solo entre les lignes 810 et 901;
- les contenus legaux, le blog et le theme entre les lignes 902 et 907.

## Organisation HTML

La page est une application statique en francais:

- un `canvas` fixe pour les particules;
- un fond visuel Sharingan;
- un conteneur principal avec header, banniere de soutien, grille de categories, articles de blog, footer;
- une modale legale vide au chargement, remplie dynamiquement.

La grille contient 26 cartes `.category-card` avec `data-category`. Ces cles doivent correspondre a `categoryMapping`.

## Organisation CSS

Le CSS est inline dans `index.html`. Il couvre:

- reset global;
- theme sombre et theme clair;
- canvas de particules;
- fond Sharingan;
- layout principal;
- cartes de categories;
- section blog;
- footer;
- modale legale;
- panneau de quiz;
- table de quiz;
- messages, boutons, et responsive.

Le CSS n'est pas separe par domaine fonctionnel. Les styles du quiz, du blog, du theme, du fond anime et des contenus legaux partagent le meme bloc.

## Organisation JavaScript

Le JavaScript inline contient plusieurs zones:

- animation canvas: `Particle`, `resizeCanvas`, `initParticles`, `animateParticles`, `updateParticlesForTheme`;
- donnees: constantes `*List`, tableaux d'annees, indices et emojis;
- configuration: `quizData` et `categoryMapping`;
- moteur quiz: `normalizeString`, `QuizGame`, `currentGame`, `timerInterval`;
- rendu et interactions quiz: `showGamePanel`, `handleQuickSubmit`, `updateRow`, `updateFoundList`, `updateScoreAndProgress`, `startTimer`, `showMessage`, `endGame`, `closeGame`, `restartGame`;
- audio: `playSoundCorrect`, `playSoundWrong`;
- partage: `shareOnWhatsApp`, `shareOnTwitter`;
- pages legale/blog/theme: `legalContent`, `showLegalPage`, `initLegalPages`, `initBlogArticles`, `initTheme`;
- bootstrap: listener `DOMContentLoaded`.

## Donnees des quiz et categories

Les donnees sont hardcodees dans le fichier. `quizData` regroupe les listes. `categoryMapping` ajoute pour chaque categorie:

- `data`;
- `title`;
- `showYears`;
- `yearsList`;
- `hintList`.

Certaines categories utilisent des listes paralleles:

- `ligueDesChampions`: `ldcAnnees` + `ldcValeurs`, puis `ligueDesChampionsList`;
- `ballonDor`: `ballonAnnees` + `ballonValeurs`, puis `ballonDorList`;
- `trouveAnime`: donnees + `trouveAnimeEmojis`;
- `devinePersonnage`: donnees + `devinePersonnageIndices`;
- `animeParOrganisation`: donnees + `animeParOrganisationIndices`.

## Score, chronometre et validation

Le score est local a `QuizGame.score`. Une reponse acceptee incremente le score de 1 dans `submitAnswer()`.

Le chronometre est local, initialise a 600 secondes. `startTimer()` decremente `currentGame.timeLeft` toutes les secondes avec `setInterval`. A 0, `endGame(false)` est appele.

La validation passe par:

1. `normalizeString()`;
2. correspondance exacte;
3. correspondance avec le premier mot si longueur superieure a 2;
4. correspondance avec le dernier mot si la reponse contient plusieurs mots et pas de `:`;
5. refus si deja trouvee.

## Stockage local

Le seul stockage local observe est `localStorage` avec la cle `memoriz_theme`, utilisee par `initTheme()` pour persister le theme clair/sombre.

## Dependances externes

Aucune dependance JavaScript ou CSS externe n'est chargee par `index.html`.

APIs navigateur utilisees:

- DOM;
- Canvas 2D;
- `requestAnimationFrame`;
- `localStorage`;
- `setInterval` / `clearInterval`;
- Web Audio API;
- `window.open`.

Liens externes visibles:

- Sapeo;
- YouTube;
- TikTok;
- Twitch;
- WhatsApp;
- Twitter/X.

## Points a clarifier

- `index.html` reference `/favicon.svg`, `/favicon.ico` et `/site.webmanifest`, mais ces fichiers ne sont pas presents dans le depot.
- `sitemap.xml`, `robots.txt` et les metadonnees sociales ne semblent pas tous pointer vers le meme domaine.
- La page Pinterest contient du HTML externe complet; son role exact dans le depot doit etre confirme avant tout nettoyage.
