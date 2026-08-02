# Memoriz Asset Pack V1

Pack organisé pour l’intégration frontend par Codex.

## Contenu
- `intro/mobile` : 5 images 1080×1920 sans texte
- `intro/web` : 5 images 1920×1080 sans texte
- `categories` : 10 couvertures actuellement identifiées
- `avatars` : 7 avatars
- `gameplay` : feedbacks et récompenses
- `multiplayer` : cycle complet des salles et résultats
- `articles` : 8 couvertures sans texte
- `states` : 9 états transversaux transparents
- `backgrounds/mobile` : 8 fonds 9:16
- `backgrounds/web` : 8 fonds 16:9
- `effects` : réactions et éléments UI
- `references` : planches et maquettes de direction

## Important
Le logo officiel n’est pas remplacé : Codex doit conserver celui déjà présent dans le projet.

La liste exacte des 26 catégories doit encore être comparée avec
`assets/js/quiz-data.js`. Les 10 couvertures présentes forment le socle.
Après fourniture du fichier, les catégories manquantes seront ajoutées sans
modifier les autres assets.

## Intégration
- Ne pas intégrer de texte dans les images.
- Utiliser les textes en HTML/CSS.
- Précharger les 5 assets d’introduction.
- Utiliser `<picture>` pour les variantes mobile/web.
- Conserver les noms de fichiers.
- Les icônes de navigation restent des SVG de code.
