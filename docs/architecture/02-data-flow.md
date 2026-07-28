# Flux de donnees

## Phase 6

Les flux valides gardent trois autorites:

- Supabase Auth fournit l'identite anonyme;
- PostgreSQL calcule les scores, points et droits via RPC/RLS;
- le backend Socket.io arbitre les parties multijoueurs et refuse les payloads non valides.

Le navigateur ne fournit jamais `user_id`, score, rang, statut final, hote ou reponse canonique. Les tokens sont transmis dans `socket.auth` ou `Authorization` REST, jamais dans l'URL.

## Flux actuel: mode solo statique

```text
Carte HTML data-category
        ↓
DOMContentLoaded ajoute un listener click
        ↓
showGamePanel(categoryKey)
        ↓
categoryMapping[categoryKey]
        ↓
new QuizGame(...)
        ↓
insertAdjacentHTML du panneau
        ↓
quick-input / quick-submit
        ↓
handleQuickSubmit()
        ↓
currentGame.submitAnswer(answer)
        ↓
updateRow + updateFoundList + updateScoreAndProgress
        ↓
endGame si complet ou timer a 0
```

## Flux de validation actuel

```text
Reponse brute
  ↓ trim()
normalizeString()
  ↓
Comparaison avec chaque question non trouvee
  ↓
Match exact OU premier mot OU dernier mot
  ↓
Marquage correctAnswers[index] = true
  ↓
score++
```

Le client est actuellement la seule autorite pour la validation et le score.

## Flux cible: solo local preserve

```text
UI commande submitAnswer
        ↓
quiz-solo.js
        ↓
quiz-core.js normalise et valide
        ↓
Etat local mis a jour
        ↓
ui.js rend l'etat
```

Ce flux doit conserver le comportement existant pendant les premieres phases.

## Flux cible: auth et profil

```text
Chargement app
        ↓
auth.js initialise Supabase anonymous auth
        ↓
Lecture/creation profile
        ↓
Pseudo unique valide cote base
        ↓
UI recoit currentUser/currentProfile
```

Le pseudo doit etre traite comme une donnee utilisateur non fiable jusqu'a rendu avec `textContent`.

## Flux cible: commentaires temps reel

```text
comments.js charge les derniers commentaires
        ↓
Utilisateur cree/modifie/supprime
        ↓
api.js ou Supabase client
        ↓
RLS + validation serveur/base
        ↓
Realtime broadcast
        ↓
comments.js applique l'evenement
        ↓
ui.js rend sans innerHTML utilisateur
```

## Flux cible: leaderboard

```text
Fin de session
        ↓
Score calcule cote serveur ou verifie
        ↓
leaderboard entry inseree
        ↓
Lecture triée par categorie/periode
        ↓
UI affiche classement
```

Le score affiche dans le partage social peut rester client, mais le score de leaderboard doit etre derive de donnees serveur.

## Flux cible: multijoueur

```text
Client rejoint une session
        ↓
socket.js connecte et authentifie
        ↓
Serveur ajoute le joueur a une room
        ↓
Serveur envoie session:snapshot
        ↓
multiplayer.js construit l'etat local
        ↓
Utilisateur soumet une reponse
        ↓
Serveur valide et arbitre
        ↓
answer:accepted ou answer:rejected
        ↓
Tous les clients appliquent le meme etat
```

## Donnees a stabiliser avant Supabase/Socket.io

- `categoryKey`: identifiant stable de categorie.
- `questionId`: identifiant stable de question, necessaire pour eviter les collisions de texte.
- `answerNormalized`: valeur derivee, non source unique.
- `sessionId`: identifiant de partie.
- `playerId`: identifiant lie a Supabase auth.
- `clientSubmissionId`: idempotence apres reconnexion.
- `serverSeq`: ordre autoritaire des evenements.

## Flux a ne pas changer en Phase 1

- Duree initiale: 600 secondes.
- Score: +1 par reponse valide.
- Regles de matching.
- Ordre et contenu des categories.
- Donnees des quiz.
- Apparence et classes CSS.
- Comportement du theme, blog, modale et partage.
