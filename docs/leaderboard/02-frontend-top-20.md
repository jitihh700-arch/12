# Leaderboard frontend Top 20

## Architecture

`assets/js/leaderboard.js` gere une modale dediee au classement. Elle s'appuie uniquement sur `get_leaderboard` et `get_my_leaderboard_rank` via `assets/js/api.js`.

## RPC

- `get_leaderboard(20)` retourne le Top 20 dans l'ordre serveur.
- `get_my_leaderboard_rank()` retourne le rang du profil courant, meme hors Top 20.

Le frontend ne lit jamais directement `public.profiles` et ne trie pas les joueurs avec une regle locale.

## Top 20

Chaque ligne affiche le rang, le pseudo, les points et le nombre de quiz completes. Le joueur courant est mis en evidence lorsque son pseudo correspond au profil actif.

## Classement Personnel

Le bloc personnel affiche rang, total de joueurs, pseudo, points et quiz completes. Les cas vide, profil absent et service indisponible ont un message dedie.

## Rafraichissement

Le classement est recharge a l'ouverture, au clic sur `Rafraichir`, apres finalisation classee et apres l'evenement `memoriz:profile-ready`. Aucun polling frequent et aucun Realtime leaderboard ne sont ajoutes.

## Securite DOM

Les pseudos, points, rangs, dates et erreurs sont rendus avec `document.createElement`, `textContent`, `append` et `replaceChildren`. Aucune donnee dynamique du leaderboard n'utilise `innerHTML`.

## Responsive Et Accessibilite

La modale utilise `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-describedby`, un statut `aria-live`, un focus initial, un focus trap, Escape, clic sur scrim et retour du focus au bouton d'ouverture. Le layout mobile evite les largeurs fixes, tronque les pseudos longs et garde les boutons a au moins 44 px de haut.

## Etats D'erreur

Sans profil actif, la modale indique que le classement est indisponible. En erreur reseau ou RPC, les anciennes donnees ne sont pas recyclees comme si elles etaient valides.
