# Memoriz V4 - Lot 1 fondations frontend

## Portee realisee

Le Lot 1 met en place la base visuelle V4 sans ouvrir les lots fonctionnels suivants.

- Design tokens, reset, base, layout, navigation, composants et styles responsive.
- Assets V4 copiés dans `assets/images/memoriz/` pour usage applicatif local.
- Shell responsive avec navigation desktop haute et navigation mobile basse.
- Accueil V4 avec hero illustré, actions principales et profil existant conservé.
- Explorer V4 avec 26 catégories existantes, images locales, recherche, filtres et état vide.
- Introduction V4 automatique en cinq étapes, non bloquante, avec mode réduit et fallback.
- Compatibilité maintenue avec les contrats existants du quiz, du profil, des commentaires, du leaderboard et du multijoueur.

## Limites volontaires

Ces écrans ne sont pas reconstruits dans ce lot :

- quiz solo complet ;
- portail, lobby, partie et résultats multijoueur ;
- leaderboard complet ;
- articles ;
- communauté complète ;
- profil complet.

Le Lot 1 prépare leur intégration en conservant les IDs, classes et points d'entrée historiques utilisés par les scripts et tests existants.

## Points d'attention corriges

- L'intro V4 ne bloque pas l'application et se désactive si la modale profil obligatoire apparaît.
- L'overlay d'intro masqué ne capte plus les clics après `aria-hidden="true"`.
- Le piège de focus de la modale profil est renforcé pour éviter toute fuite de focus lors des clics extérieurs ou de la navigation clavier.
- Les cartes Explorer sont compactées sur desktop pour éviter une page inutilement longue et réduire le coût des captures Playwright `fullPage`.

## Revue par roles

- Frontend : contrats DOM préservés, scripts existants non réécrits, enrichissement progressif des cartes.
- UI : palette officielle V4, shell distinct, cartes image + contenu, navigation adaptée desktop/mobile.
- Accessibilité : `aria-current`, labels de recherche, activation clavier des catégories, focus trap profil renforcé.
- Tests : couverture dédiée intro, responsive, navigation, recherche, fallback image et activation clavier.
