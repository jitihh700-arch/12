# Cartographie du code existant

## Tableau de cartographie

| Element | Type | Responsabilite | Dependances | Risques | Destination future recommandee |
| --- | --- | --- | --- | --- | --- |
| `<head>` SEO et meta securite | HTML | SEO, partage social, pseudo-controles securite | Navigateur, hebergeur | Les `meta http-equiv` ne remplacent pas toujours des headers serveur; fichiers manifest/icones manquants | `index.html`, puis configuration serveur pour headers |
| Bloc `<style>` | CSS inline | Toute l'apparence: layout, theme, quiz, blog, modal, responsive | Classes HTML et classes injectees par JS | Changement difficile a verifier, couplage fort avec le DOM genere | `assets/css/app.css`, puis `comments.css`, `multiplayer.css` |
| `#particles-canvas` | HTML/CSS/Canvas | Fond anime | `canvas`, `ctx`, `Particle`, `requestAnimationFrame` | Animation permanente; cout CPU; depend du theme | `assets/js/ui.js` ou `assets/js/background.js` |
| `.category-card[data-category]` | HTML | Entrees utilisateur pour lancer un quiz | `categoryMapping`, `showGamePanel` | Cles dupliquees ou absentes casseraient le lancement | `index.html` pour structure, generation future depuis `quiz-data.js` |
| Articles de blog | HTML + JS | Contenu editorial extensible/reductible | `.read-more`, `initBlogArticles` | Contenu melange a l'application; SEO et app lies | `index.html` ou futur contenu CMS/statique separe |
| Footer et liens sociaux | HTML | Navigation legale/sociale/partage externe | Liens externes | Certains liens externes ouvrent un nouvel onglet; verifier `rel` partout | `index.html` + composant `ui.js` si rendu dynamique |
| `legalContent` | Donnee globale HTML | Contenus de confidentialite, CGU, mentions, contact | `showLegalPage`, `modal-body.innerHTML` | Texte legal deviendra faux avec comptes/commentaires; HTML injecte | `assets/js/legal-content.js` puis donnees statiques controlees |
| `resizeCanvas()` | Fonction | Adapter le canvas a la fenetre | `canvas`, `initParticles` | Reinitialise les particules au resize | `assets/js/ui.js` |
| `Particle` | Classe | Etat, deplacement et dessin d'une particule | `ctx`, dimensions canvas, theme body | Couplage direct au DOM et au contexte global | `assets/js/ui.js` |
| `initParticles(count)` | Fonction | Creer la liste de particules | `particles`, `Particle` | Nombre fixe; pas de pause en arriere-plan | `assets/js/ui.js` |
| `animateParticles()` | Fonction | Boucle d'animation | `particles`, `ctx`, `requestAnimationFrame` | Boucle continue; aucune gestion `prefers-reduced-motion` | `assets/js/ui.js` |
| `updateParticlesForTheme(isLight)` | Fonction | Adapter les particules apres changement de theme | `particles`, `document.body` | Parametre `isLight` non utilise directement; depend de classes DOM | `assets/js/ui.js` |
| `themeToggle` listener initial | Evenement DOM | Synchroniser particules apres clic theme | `themeToggle`, `setTimeout`, `updateParticlesForTheme` | Deux listeners de theme se partagent le comportement | `assets/js/ui.js` ou `assets/js/app.js` |
| `*List` | Donnees globales | Reponses des quiz | `quizData`, `categoryMapping`, `QuizGame` | Donnees non versionnees par id; doublons possibles; mise a jour manuelle | `assets/js/quiz-data.js` |
| `ldcAnnees`, `ldcValeurs` | Donnees globales paralleles | Construire les vainqueurs LDC avec annees | `ligueDesChampionsList`, `categoryMapping` | Desalignement index/valeur possible | `assets/js/quiz-data.js` avec objets `{ year, answer }` |
| `ballonAnnees`, `ballonValeurs` | Donnees globales paralleles | Construire les Ballons d'Or avec annees | `ballonDorList`, `categoryMapping` | Desalignement index/valeur possible; donnees temporelles a maintenir | `assets/js/quiz-data.js` |
| `quizData` | Donnee globale | Regrouper les listes par cle de categorie | Toutes les categories | Source globale mutable indirecte; pas d'id question | `assets/js/quiz-data.js` |
| `devinePersonnageIndices` | Donnee globale | Indices pour `devinePersonnage` | `categoryMapping`, `showGamePanel` | Doit rester aligne avec la liste de reponses | `assets/js/quiz-data.js` |
| `trouveAnimeEmojis` | Donnee globale | Indices emoji pour `trouveAnime` | `categoryMapping`, `showGamePanel` | Doit rester aligne avec la liste de reponses | `assets/js/quiz-data.js` |
| `animeParOrganisationIndices` | Donnee globale | Indices organisation pour `animeParOrganisation` | `categoryMapping`, `showGamePanel` | Doit rester aligne avec la liste de reponses | `assets/js/quiz-data.js` |
| `categoryMapping` | Donnee globale/config | Lier carte, titre, donnees, annees et indices | `quizData`, listes d'indices, `showGamePanel` | Melange configuration UI et donnees metier | `assets/js/quiz-data.js` |
| `normalizeString(str)` | Fonction | Normaliser les reponses: casse, accents, ponctuation, prefixe annee | `QuizGame.findMatchingQuestion` | Peut creer collisions; retire la ponctuation utile | `assets/js/quiz-solo.js` ou `quiz-core.js` |
| `currentGame` | Variable globale | Partie solo active | Presque toutes les fonctions quiz | Etat global incompatible avec plusieurs sessions/joueurs | `quiz-solo.js`, puis `GameSession` local/serveur |
| `timerInterval` | Variable globale | Identifiant du timer actif | `startTimer`, `closeGame`, `endGame` | Timer local divergent en multi; fuite si mal nettoye | `quiz-solo.js`, puis timer serveur |
| `QuizGame` | Classe | Etat de partie, validation, score, completion | `normalizeString`, listes de questions | Melange logique solo et modele d'etat; pas d'id question | `assets/js/quiz-solo.js`, puis service serveur pour multi |
| `findMatchingQuestion(answer)` | Methode | Trouver l'index d'une reponse non trouvee | `questions`, `correctAnswers`, `normalizeString` | Ambiguites premier/dernier mot; doublons | `quiz-solo.js`, puis validation serveur |
| `submitAnswer(answer)` | Methode | Valider, marquer trouve, incrementer score | `findMatchingQuestion`, `score`, `correctAnswers` | Double comptage en multi; autorite client | `quiz-solo.js`, puis endpoint/API serveur |
| `isComplete()` | Methode | Detecter fin complete | `correctAnswers` | Correct pour solo; insuffisant pour sessions partagees | `quiz-solo.js` |
| `getProgress()` | Methode | Calculer progression | `correctAnswers`, `questions` | Calcul derive fiable mais local | `quiz-solo.js`, puis `leaderboard.js`/UI |
| `showGamePanel(categoryKey)` | Fonction | Creer une partie, construire le HTML, injecter le panneau, brancher les evenements, demarrer timer | `categoryMapping`, `QuizGame`, DOM, `startTimer`, handlers | Fonction la plus couplee; `insertAdjacentHTML`; logique de categories speciale | `quiz-solo.js` + `ui.js` |
| `playSoundCorrect()` | Fonction | Son de reponse correcte | Web Audio API | Peut echouer selon politiques navigateur; try/catch silencieux | `assets/js/ui.js` |
| `playSoundWrong()` | Fonction | Son de reponse fausse | Web Audio API | Meme risque que ci-dessus | `assets/js/ui.js` |
| `handleQuickSubmit()` | Fonction | Lire input, appeler moteur, declencher UI/sons/fin | `currentGame`, DOM, `showMessage`, `updateRow`, `updateFoundList`, `endGame` | Fort couplage au DOM; aucun debounce/rate limit futur | `quiz-solo.js` + `ui.js` |
| `updateRow(index, correctName)` | Fonction | Reveler une reponse dans le tableau | `currentGame`, DOM, `innerHTML`, styles inline | XSS futur si donnees externes; styles inline | `assets/js/ui.js` |
| `updateFoundList()` | Fonction | Afficher trouves/restants | `currentGame`, `innerHTML` | Peut devenir lourd; XSS futur; texte long | `assets/js/ui.js` |
| `updateScoreAndProgress()` | Fonction | Mettre a jour score et progression | `currentGame`, DOM `textContent` | Dependance globale; fiable en solo | `assets/js/ui.js` |
| `startTimer()` | Fonction | Decrementer temps et finir a 0 | `timerInterval`, `currentGame`, `endGame` | Timer local non autoritaire; onglets en pause | `quiz-solo.js`, puis serveur/socket |
| `showMessage(msg, type)` | Fonction | Afficher message temporaire | `innerHTML`, `setTimeout` | XSS futur via `msg`/`type`; timers concurrents possibles | `assets/js/ui.js` |
| `shareOnWhatsApp()` | Fonction globale | Ouvrir partage WhatsApp | `currentGame`, `window.open` | Score client manipulable; popup bloquee possible | `assets/js/ui.js` |
| `shareOnTwitter()` | Fonction globale | Ouvrir partage Twitter/X | `currentGame`, `window.open` | Meme risque que WhatsApp | `assets/js/ui.js` |
| `endGame(completed)` | Fonction | Arreter partie, reveler reponses, remplacer UI finale | `currentGame`, `timerInterval`, DOM, `innerHTML`, fonctions globales | Remplacement complet du DOM; handlers inline; score client | `quiz-solo.js` + `ui.js` |
| `closeGame()` | Fonction globale | Nettoyer timer et retirer panneau | `timerInterval`, DOM | Depend d'un seul panneau `game-panel` | `assets/js/quiz-solo.js` |
| `restartGame()` | Fonction globale | Fermer puis relancer la categorie active | `currentGame`, `setTimeout`, `showGamePanel` | Depend de l'etat global; delai magique de 50 ms | `assets/js/quiz-solo.js` |
| `showLegalPage(page)` | Fonction | Injecter contenu legal dans la modale | `legalContent`, DOM, `innerHTML` | HTML controle actuellement local, risque si externe | `assets/js/ui.js` ou `legal.js` |
| `initLegalPages()` | Fonction | Brancher liens legaux et fermeture modale | DOM, `showLegalPage`, `window.onclick` | `window.onclick` ecrase de futurs handlers globaux | `assets/js/ui.js` |
| `initBlogArticles()` | Fonction | Ouvrir/reduire articles | DOM, classes CSS | Couplage faible mais contenu dans monolithe | `assets/js/ui.js` |
| `initTheme()` | Fonction | Restaurer et persister theme | `localStorage`, DOM, `themeToggle` | Double listener avec l'animation particules | `assets/js/ui.js` |
| `DOMContentLoaded` | Evenement DOM | Bootstrap categories, legal, blog, theme | DOM et fonctions d'init | Toute l'initialisation est dans une ligne compacte | `assets/js/app.js` |

## Principales dependances internes

1. Les cartes HTML fournissent `data-category`.
2. `DOMContentLoaded` lit `data-category` et appelle `showGamePanel`.
3. `showGamePanel` lit `categoryMapping`.
4. `categoryMapping` lit `quizData`, les annees et les indices.
5. `QuizGame` recoit une copie des questions.
6. `handleQuickSubmit` appelle `currentGame.submitAnswer`.
7. Les fonctions UI lisent `currentGame` pour rendre score, progression et reponses.
8. `startTimer` et `endGame` controlent la fin de partie.

## Responsabilites actuellement melangees

- `showGamePanel` melange selection de categorie, creation d'etat, generation HTML, regles d'affichage, branchement d'evenements et lancement du timer.
- `QuizGame` garde la logique de jeu mais reste dependante d'un modele client qui deviendra insuffisant pour le multijoueur.
- `categoryMapping` melange donnees metier, libelles UI et adaptation des indices.
- Les fonctions de rendu utilisent directement les donnees de quiz au lieu de recevoir un etat deja prepare.
- Les contenus legaux et blog partagent le meme script que le moteur de quiz.
