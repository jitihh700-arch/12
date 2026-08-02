# Memoriz — Asset Pack Final

Ce dossier constitue la source graphique finale à intégrer dans le frontend.

## Contenu principal

- `intro/mobile` : cinq états de l’introduction automatique en 9:16
- `intro/web` : cinq états de l’introduction automatique en 16:9
- `categories` : 26 couvertures, avec un nom identique à la clé `categoryMapping`
- `avatars` : avatars utilisateur
- `gameplay` : feedbacks du mode solo et récompenses
- `multiplayer` : création, lobby, reconnexion et résultats
- `articles` : couvertures sans texte
- `states` : chargement, erreurs et états vides
- `backgrounds/mobile` et `backgrounds/web` : fonds responsives
- `effects` : commentaires et réactions
- `references` : références de direction artistique

## Règle catégories

Utilisation directe :

```js
const categoryImage = `assets/images/categories/${categoryKey}.webp`;
```

Exemples :

```text
series.webp
animeCelebres.webp
meilleursFootballeurs.webp
trouveAnime.webp
animeParOrganisation.webp
```

## Introduction

L’introduction est automatique :

1. état inactif ;
2. premier tomoe ;
3. deuxième tomoe ;
4. troisième tomoe ;
5. éveil ultime ;
6. transition automatique vers le site.

Aucun bouton « Suivant » et aucune option de relecture après l’entrée dans le site.

## Intégration

- Les textes restent en HTML/CSS.
- Ne pas rasteriser les icônes de navigation : utiliser des SVG.
- Précharger les cinq images de l’introduction.
- Utiliser `<picture>` ou les media queries pour mobile/web.
- Conserver le logo officiel déjà présent dans le dépôt.
- Optimiser les images sans modifier leur cadrage ni leurs noms.
