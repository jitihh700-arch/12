# Integration frontend du quiz serveur

## Architecture

La Phase 4B ajoute `assets/js/quiz-session.js` entre le moteur visuel historique et les RPC PostgreSQL. `quiz-solo.js` garde les ecrans, categories, sons, champ de reponse, progression, fermeture, restart, partage et ecran final. En mode classe, il ne decide plus si une reponse vaut des points: il attend `submit_quiz_answer`.

## Cartographie du moteur historique

| Element | Responsabilite actuelle | Dependances | Comportement conserve | Remplacement serveur | Risque |
| --- | --- | --- | --- | --- | --- |
| `QuizGame` | Etat local du quiz | `categoryMapping` | Questions, progression, sons | Etat serveur miroir en mode classe | score local falsifiable |
| `currentGame` | Partie courante | DOM global | fermeture/restart | session_id serveur | session stale |
| `showGamePanel` | Demarre categorie | cartes categorie | meme panneau | appelle `start_quiz_session` | fallback requis |
| `quick-input` | saisie reponse | DOM | Enter et bouton | texte envoye a `submit_quiz_answer` | double submit |
| `normalizeString` | validation locale | JS | mode entrainement | non autoritaire en classe | revelation locale |
| bonne reponse | marque ligne et son | `updateRow` | affichage conserve | payload serveur | ordre serveur requis |
| mauvaise reponse | message erreur | `showMessage` | message conserve | resultat `incorrect` | XSS si HTML |
| doublon | refuse localement | tableau local | aucun point | resultat `duplicate` | double requete |
| score local | `score++` | navigateur | entrainement | `points_current`/`points_awarded` | falsification DOM |
| progression | bonnes reponses | tableau local | affichage conserve | `correct_answers` | restauration |
| chronometre | compteur 600 | interval local | visuel conserve | `expires_at - Date.now()` | derive temps |
| fin automatique | `endGame(false)` | timer | ecran final | `complete_quiz_session` | double credit |
| fermeture | retire panel | DOM | retour categories | `abandon_quiz_session` | abandon perdu |
| restart | close puis start | DOM | meme UX | abandon puis nouvelle session | reuse session |
| ecran final | resume score | DOM | partage et rejouer | score serveur | points locaux |
| partage | score courant | `window.open` | liens conserves | score serveur en classe | score manipule |
| sons | Web Audio | navigateur | conserves | inchanges | double son |
| `window.*` | actions inline | `app.js` | API globale conservee | inchangée | appels directs |
| localStorage | theme/profil | `ui.js`, `auth.js` | caches non sensibles | `memoriz_active_quiz_session` non autoritaire | cache identite |

## Mode Classe

Disponible seulement avec Supabase configure, session anonyme active et profil existant. Le frontend appelle `start_quiz_session`, puis `submit_quiz_answer`, `complete_quiz_session` et `abandon_quiz_session`. Il n'envoie jamais `user_id`, pseudo, points, bonnes reponses ou score permanent.

## Mode Entrainement

Si Supabase, le profil ou le reseau est indisponible, le quiz historique reste jouable. L'interface affiche `Mode entrainement`; aucun point permanent n'est attribue et le leaderboard reste indisponible.

## Demarrage Et Soumission

Le demarrage classe attend le `session_id` avant d'activer la partie. Pendant une soumission, le champ est desactive, une sequence ignore les anciennes reponses reseau et le resultat vient de PostgreSQL: `correct`, `incorrect`, `duplicate`, `expired` ou `completed`.

## Score Et Chronometre

Le score classe affiche `points_current` puis `points_awarded`. Le frontend ne calcule pas les points permanents. Le chronometre est une representation de `expires_at`; au retour d'onglet il se resynchronise avec l'heure courante.

## Restauration

Le cache local `memoriz_active_quiz_session` contient seulement `sessionId` et `categoryId`. Apres reload, `get_my_quiz_session_state` verifie `auth.uid()` et restaure uniquement les reponses deja trouvees. Les reponses restantes, `answer_id` et `answer_normalized` ne sont pas retournes.

## Fermeture, Restart Et Finalisation

Fermer une session active appelle `abandon_quiz_session` et ne credite rien. Restart abandonne d'abord l'ancienne session puis cree une nouvelle session. La finalisation appelle `complete_quiz_session` une seule fois et accepte l'idempotence `already_completed`.

## Fin Du Temps

Avant Phase 4B, une session deja expiree etait marquee `expired` sans credit. La migration Phase 4B permet a `complete_quiz_session` de crediter les bonnes reponses si l'appel arrive dans une petite fenetre de 5 secondes apres `expires_at`, afin d'absorber le decalage reseau entre le timer client et PostgreSQL. Les soumissions apres expiration restent refusees et ne permettent pas de repondre en retard.

## Erreurs Et Securite

Les erreurs serveur sont mappees vers des messages utilisateurs courts. Les details SQL ne sont pas affiches. Les donnees dynamiques ajoutees en Phase 4B utilisent `textContent`, `replaceChildren` ou des attributs controles.

## Limites Anti-Triche

Le serveur empeche la falsification directe des points, des sessions et du leaderboard. Le depot et les donnees historiques restant publics, cette phase ne garantit pas qu'un joueur ne connaisse pas deja les reponses.
