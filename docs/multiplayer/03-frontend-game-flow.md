# Phase 5 - Interface multijoueur

L'interface multijoueur est ajoutee dans une modale dediee, accessible depuis le profil anonyme. Le quiz solo existant reste utilisable si Supabase, le backend ou Socket.io est indisponible.

## Flux utilisateur

- Creation d'une partie avec categorie et nombre maximum de joueurs.
- Rejoindre une partie via un code de six caracteres.
- Salon avec etat pret, liste des joueurs et bouton de demarrage reserve au snapshot serveur de l'hote.
- Partie avec chronometre derive de `expiresAt`, champ de reponse, classement local du snapshot et liste des reponses trouvees par le joueur courant.
- Ecran final avec classement et bouton de fermeture.

## Securite frontend

- Le cache local `memoriz_multiplayer_game` contient uniquement `{ gameCode }`.
- Les donnees dynamiques sont rendues avec `textContent`, `replaceChildren` et `createElement`.
- Le client n'envoie jamais score, points, bonnes reponses, rang, date serveur, user id ou pseudo d'autorite.
- Le chronometre affiche une derive locale mais ne decide jamais la fin officielle.

## Accessibilite et responsive

La modale utilise `role="dialog"`, `aria-modal`, une region de statut `aria-live`, un focus trap et la fermeture au clavier. Les controles restent tactiles et lisibles sur mobile.
