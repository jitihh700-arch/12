# Risques de refactoring

## Risques principaux

| Priorite | Zone | Risque de regression | Cause | Controle recommande |
| --- | --- | --- | --- | --- |
| Haute | Extraction JS | Les categories ne lancent plus le bon quiz | Couplage `data-category` -> `categoryMapping` -> `showGamePanel` | Test manuel de chaque categorie + test DOM automatise |
| Haute | Donnees quiz | Score ou reponses changent | Listes hardcodees, listes paralleles annees/indices | Snapshot des longueurs et premieres/dernieres valeurs |
| Haute | Validation | Des reponses acceptees/refusees changent | `normalizeString`, premier mot, dernier mot, suppression ponctuation | Tests unitaires sur accents, annees, noms composes, doublons |
| Haute | Timer | Fin de partie incorrecte | `timerInterval`, `timeLeft`, `endGame` couples | Test timer accelere/factice avant migration |
| Moyenne | Theme | Theme clair/sombre ou particules cassent | Deux listeners sur `themeToggle` | Regrouper l'init theme apres extraction sans changer ordre observe |
| Moyenne | Rendu dynamique | Boutons fin/restart ne marchent plus | `innerHTML` genere des handlers inline `onclick` | Remplacer plus tard par listeners explicites, mais pas en Phase 1 si risque eleve |
| Moyenne | Modale legale | Fermeture overlay ne marche plus | `window.onclick` global | Ajouter test click lien/footer + fermeture |
| Moyenne | Blog | Lire la suite ne bascule plus | Listeners `.read-more` dans `initBlogArticles` | Test de chaque bouton blog |
| Moyenne | Audio | Sons silencieux ou erreurs navigateur | Web Audio API creee a la demande | Garder try/catch; test manuel apres interaction utilisateur |
| Basse | SEO/assets | Icônes/manifest manquants restent non resolus | References absentes deja presentes | Ne pas corriger pendant extraction; documenter |

## Points de vigilance avant Phase 1

- Conserver l'ordre d'execution actuel: animation canvas, declaration des donnees, declaration fonctions/classes, puis `DOMContentLoaded`.
- Si le JavaScript est extrait dans un fichier sans `type="module"`, les fonctions utilisees par `onclick` inline doivent rester globales.
- Si le JavaScript est extrait en module ES, les handlers inline de `endGame()` cesseront d'acceder a `closeGame`, `restartGame`, `shareOnWhatsApp`, `shareOnTwitter` sauf exposition volontaire sur `window`.
- Les chemins d'assets doivent rester compatibles avec l'hebergement actuel.
- Le CSS extrait doit etre charge avant le rendu visible pour eviter un flash non style.
- Le contenu avec caracteres accents et emojis doit rester encode en UTF-8.

## Risques specifiques multijoueur

- `currentGame` ne peut representer qu'une partie locale. Le multijoueur demandera un `sessionId` et un etat serveur.
- `correctAnswers` est un tableau booleen indexe; il faudra passer a des `questionId` stables.
- `score` est derive de `correctAnswers`; en multi, le serveur devra arbitrer les reponses simultanees.
- `timeLeft` local doit devenir un calcul depuis `endsAt`.
- `showGamePanel` reconstruit le DOM depuis zero; une reconnexion devra appliquer un snapshot sans relancer une partie vide.

## Strategie anti-regression

1. Avant extraction, capturer des snapshots textuels: nombre de categories, longueur de chaque liste, textes des titres, duree initiale.
2. Extraire CSS seul et verifier visuellement.
3. Extraire JS sans modularisation forte, puis verifier les globals attendus.
4. Ajouter tests unitaires seulement apres avoir isole `normalizeString` et `QuizGame`.
5. Ne pas melanger extraction et amelioration securite dans la meme phase.
