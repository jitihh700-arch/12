# Memoriz V4 - Écrans et composants cibles

## Principe d'architecture

La V4 doit remplacer la page longue par une SPA Vanilla à vues. Une seule vue principale doit être active à la fois, avec navigation desktop horizontale et navigation mobile inférieure. Les modules métier existants restent les sources de vérité; la nouvelle couche visuelle doit orchestrer leur rendu sans changer leurs contrats.

## Shell applicatif

Composants cibles :

- barre de navigation desktop;
- bottom navigation mobile;
- zone principale `main`;
- panneau profil compact;
- états système globaux;
- surface de modales seulement pour les dialogues courts.

Compatibilité à prévoir :

- conserver ou mapper `#profile-card`, `#profile-primary-action`, `#leaderboard-open`, `#multiplayer-open`;
- garder `#themeToggle` ou migrer avec adaptation de tests;
- ne pas rendre toutes les sections simultanément dans le flux.

## Home

Rôle : accueil, résumé de progression, accès rapide aux modes, derniers états.

Sources :

- profil depuis `window.memorizAuth.getState()`;
- statistiques profil depuis `window.memorizProfile`;
- catégories depuis `window.categoryMapping`.

Composants :

- hero/dashboard compact;
- cartes d'action Solo, Multijoueur, Classement, Communauté;
- résumé de profil;
- CTA vers l'explorateur.

## Explorer / Catégories

Rôle : remplacer la grille ancienne par une grille filtrable.

Sources :

- `window.categoryMapping`;
- `data-category` comme contrat de lancement.

Composants :

- recherche;
- filtres visuels;
- grille responsive;
- cartes de catégories;
- état vide.

Compatibilité :

- les tests attendent 26 catégories;
- `.category-card[data-category]` lance le solo aujourd'hui;
- les noms, scores, durées et règles du quiz ne doivent pas changer.

## Solo

Rôle : écran de jeu solo/classé.

Sources :

- `MemorizQuizSession`;
- données locales `quiz-data.js`;
- fallback entraînement si Supabase indisponible.

Composants :

- en-tête de session;
- timer;
- champ réponse;
- liste/réponses trouvées;
- panneau de score;
- écran résultat;
- actions replay, home, partage et classement.

Compatibilité :

- préserver `#game-panel`, `#quick-input`, `#quick-submit` ou adapter les tests;
- garder `closeGame`, `restartGame`, `shareOnWhatsApp`, `shareOnTwitter`;
- ne pas exposer les réponses canoniques avant la fin.

## Multijoueur

Rôle : portail, lobby, jeu et résultats dans des vues réelles plutôt qu'une grande modale unique.

Sources :

- `MemorizMultiplayer`;
- `MemorizMultiplayerSocket`;
- snapshots serveur Socket.IO.

Composants :

- portail créer/rejoindre;
- sélecteur catégorie;
- maximum 2 à 4 joueurs;
- lobby avec code, hôte, joueurs, prêts;
- bouton lancer visible seulement pour l'hôte;
- jeu avec timer serveur, scoreboard, saisie et réactions;
- résultat final.

Compatibilité :

- préserver les IDs `#multiplayer-*` critiques ou migrer avec tests;
- comparer l'hôte via les données de profil/snapshot, pas via un UUID de joueur incorrect;
- bloquer le double clic de lancement avec `startGamePending`;
- `disconnect` reste distinct de `leave`.

## Leaderboard

Rôle : page ou panneau dédié au classement.

Sources :

- `MemorizLeaderboard`;
- RPC `get_leaderboard`;
- RPC `get_my_leaderboard_rank`.

Composants :

- top 20;
- rang utilisateur;
- bouton rafraîchir;
- états chargement/erreur/profil requis.

Compatibilité :

- conserver `#leaderboard-list`, `#leaderboard-my-rank`, `#leaderboard-status`;
- garder l'ouverture depuis le dashboard ou une vue dédiée.

## Community / Commentaires

Rôle : vue communautaire avec publication et flux.

Sources :

- `MemorizComments`;
- RPC commentaires;
- Realtime privé.

Composants :

- composer;
- compteur 500 caractères;
- feed;
- actions propriétaire;
- toast;
- état indisponible.

Compatibilité :

- préserver `#comments-section`, `#comments-form`, `#comments-list`, `data-action`;
- ne jamais rendre le contenu utilisateur via `innerHTML`;
- garder `aria-live` sur les statuts.

## Articles

Rôle : bibliothèque éditoriale, séparée de la home.

Sources :

- articles existants dans `index.html`;
- références V4 pour lecture article et états éditoriaux.

Composants :

- liste d'articles;
- écran lecture;
- bouton retour;
- contenu sémantique.

Compatibilité :

- les textes actuels peuvent être déplacés, mais pas perdus;
- éviter les longs blocs visibles sur la home.

## Profile

Rôle : profil anonyme, édition pseudo, résumé score.

Sources :

- `memorizAuth`;
- RPC profil.

Composants :

- carte profil;
- formulaire pseudo;
- état délai de modification;
- feedback erreur/succès.

Compatibilité :

- préserver la modale ou fournir une vue/dialogue équivalente avec focus trap;
- garder les textes d'erreur existants utilisés par les tests.

## Intro V4

Rôle : séquence d'introduction visuelle issue du kit V4.

Sources :

- `docs/design/handoff/memoriz-v4/assets/memoriz/`;
- références `references/validated`, `references/mobile`, `references/web`.

Composants :

- étapes d'animation;
- version reduced-motion;
- passage vers home;
- skip accessible.

Compatibilité :

- ne pas bloquer le chargement si assets absents ou lents;
- tests avec horloge déterministe.

## États système

États à prévoir :

- Supabase absent;
- profil indisponible;
- backend multijoueur absent;
- socket déconnecté;
- commentaires indisponibles;
- chargement;
- erreur;
- état vide;
- maintenance locale.

Chaque état doit garder le solo jouable quand le contrat métier le permet.
