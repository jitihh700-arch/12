# Memoriz — Feuille de route de reconstruction frontend V4

## But

Reconstruire le frontend de Memoriz à partir de zéro sur le plan visuel et
structurel, tout en conservant les contrats fonctionnels existants avec
Supabase, le backend Render et Socket.IO.

La refonte ne doit pas modifier la logique serveur, les migrations SQL, les
RPC, les règles RLS, le calcul des scores ou les garanties anti-triche.

## Direction visuelle officielle

Palette :

- `#0F1720` : fond bleu-noir principal
- `#292F36` : gunmetal
- `#4ECDC4` : turquoise
- `#F7FFF7` : blanc crème
- `#FF6B6B` : corail
- `#FFE66D` : jaune

Principes :

- interface sombre, premium, claire et aérée ;
- cartes arrondies avec bordures discrètes ;
- illustrations 3D simples issues du pack ;
- aucun violet dominant ;
- textes rendus en HTML/CSS, jamais incrustés dans les assets ;
- version mobile et version web cohérentes ;
- navigation inférieure sur mobile et navigation horizontale sur desktop ;
- conserver le logo officiel déjà présent dans le dépôt.

## Ordre d’implémentation

1. Audit fonctionnel, DOM, tests et contrats réseau
2. Architecture CSS et design tokens
3. Shell responsive et navigation
4. Introduction automatique
5. Accueil
6. Explorer et les 26 catégories
7. Mode solo
8. Portail multijoueur
9. Lobby multijoueur
10. Partie multijoueur
11. Résultats
12. Classement
13. Communauté et commentaires
14. Articles et lecture d’un article
15. Profil, édition et choix d’avatar
16. États système
17. Accessibilité, performance et PWA
18. Tests, documentation et auto-revue

## Introduction

Séquence automatique :

1. œil inactif ;
2. premier marqueur ;
3. deuxième marqueur ;
4. troisième marqueur ;
5. éveil ultime ;
6. fondu vers l’application.

Contraintes :

- aucun bouton « Suivant » ;
- aucun bouton « Commencer » ;
- aucune navigation manuelle ;
- aucune option visible pour rejouer l’introduction ;
- préchargement des cinq assets ;
- prise en charge de `prefers-reduced-motion` ;
- aucune image de téléphone dans l’application.

## Fonctionnalités à préserver

- authentification anonyme Supabase ;
- création et chargement du profil ;
- pseudo unique et changement limité à quatorze jours ;
- commentaires sécurisés par RPC ;
- modification et suppression uniquement par le propriétaire ;
- menu vertical à trois points pour les actions de commentaire ;
- diffusion Realtime privée ;
- quiz classé validé côté serveur ;
- mode d’entraînement local existant ;
- restauration des sessions de quiz ;
- classement Top 20 et rang personnel ;
- création, connexion, lobby et partie Socket.IO ;
- vérification du profil avant connexion Socket.IO ;
- lancement réservé à l’hôte ;
- verrou anti-double lancement ;
- reconnexion contrôlée ;
- crédit idempotent des points ;
- nettoyage des salons selon les règles serveur ;
- configuration runtime Render sans secret dans le frontend.

## Stratégie de branches

- partir de l’état réel de `main`, sans supposer un hash ;
- créer `feature/frontend-rebuild-v4` uniquement après un audit Git propre ;
- ne pas rebaser ou réécrire l’historique sans nécessité ;
- ne pas pousser, fusionner ou déployer avant validation du rapport final ;
- conserver des commits petits, lisibles et thématiques.

## Critères de validation

- aucune régression fonctionnelle ;
- aucune modification de migration Supabase ;
- aucun secret suivi par Git ;
- aucun débordement horizontal de 320 px à 1920 px ;
- navigation clavier complète ;
- contrastes lisibles ;
- états focus visibles ;
- modales accessibles ;
- images dimensionnées et chargées paresseusement hors introduction ;
- tests existants adaptés et maintenus ;
- tests dédiés aux écrans et aux parcours critiques ;
- build Render validé ;
- working tree propre à la fin.
