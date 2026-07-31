# Cycle de vie des salles et UX multijoueur

Ce lot corrige trois zones visibles en production :

- une deconnexion Socket.io ne vaut pas depart definitif ;
- un depart volontaire retire la presence du joueur ;
- une partie deja commencee conserve et credite les points deja gagnes, meme si tous les joueurs quittent.

## Cycle de vie

Une salle `waiting` vide passe en `cancelled` et ne reste plus disponible. Une partie `playing` vide passe en `finished` afin de conserver les scores deja obtenus et de laisser le credit global idempotent faire son travail.

Le serveur distingue maintenant :

- `disconnect_multiplayer_game` pour une coupure reseau temporaire ;
- `leave_multiplayer_game` pour le bouton Quitter.

Socket.io appelle `disconnect_multiplayer_game` lors d'une fermeture de transport. Les clients encore presents recoivent ensuite un etat de presence mis a jour.

## Interface

Le portail multijoueur separe plus clairement creation et rejoindre. Le lobby affiche la raison qui empeche le lancement quand l'hote ne peut pas encore demarrer.

Pendant la partie, chaque joueur voit son score, sa progression personnelle et ses propres cases trouvees. Les adversaires ne recoivent pas les reponses trouvees par les autres joueurs ; ils voient uniquement une progression synthetique.

## Commentaires

Les actions de commentaire sont reservees au proprietaire. Elles sont regroupees dans un bouton vertical, puis dans un menu `Modifier` / `Supprimer`.
