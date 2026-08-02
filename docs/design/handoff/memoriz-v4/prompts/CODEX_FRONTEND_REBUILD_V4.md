# PROMPT CODEX — MEMORIZ : RECONSTRUCTION COMPLÈTE DU FRONTEND V4

Tu travailles sur le dépôt local :

```text
C:\Users\HP\Documents\mohamed\12
```

Utilise activement les agents disponibles dans :

```text
C:\Users\HP\Documents\.codex\agents
```

et les skills disponibles dans :

```text
C:\Users\HP\Documents\.codex\skills
```

Les commentaires de code doivent être humains, simples et précis en français.
Les mots-clés, identifiants et conventions du code restent en anglais.

---

## 1. MISSION

Reconstruis entièrement le frontend visuel de Memoriz selon les références et
assets du dossier de transmission V4, tout en préservant sans régression :

- Supabase Auth ;
- les profils et RPC existantes ;
- les sessions de quiz sécurisées ;
- le score serveur ;
- le classement ;
- les commentaires et leur Realtime privé ;
- Socket.IO et tout le multijoueur ;
- le build statique Render ;
- la PWA ;
- les tests existants.

La refonte concerne le frontend, son architecture visuelle, son responsive,
son accessibilité et ses tests.

Ne migre pas vers React, Vue, Svelte, Tailwind ou un autre framework. Le projet
actuel est une SPA Vanilla JavaScript : conserve cette base et améliore-la avec
des modules JavaScript et CSS maintenables.

Ne modifie pas le backend, Supabase, les migrations, les RPC, les politiques
RLS ou les contrats Socket.IO, sauf blocage démontré et explicitement documenté.
Dans ce cas, arrête la modification concernée et signale le besoin au lieu de
changer silencieusement le contrat.

---

## 2. SOURCES DE VÉRITÉ VISUELLES

Le kit doit être copié dans le dépôt sous :

```text
docs/design/handoff/memoriz-v4/
```

Il contient :

```text
assets/memoriz/
references/mobile/
references/web/
references/validated/
docs/ROADMAP_FRONTEND_V4.md
```

Ordre de priorité visuelle :

1. `references/validated/`
2. `references/mobile/`
3. `references/web/`
4. les assets contenus dans `assets/memoriz/`

La planche finale :

```text
references/validated/final-profile-article-states-board.png
```

définit la direction du profil, de l’édition, de la lecture d’article et des
états système.

La grande référence desktop définit le shell, le dashboard, le lobby, le jeu,
le classement, le profil, les articles et les commentaires.

Le logo officiel déjà présent dans le dépôt doit être conservé. Ne le remplace
pas par un logo généré.

---

## 3. PRÉCONDITIONS GIT — OBLIGATOIRES

Avant toute modification :

```powershell
git status --short
git branch --show-current
git rev-parse HEAD
git rev-parse main
git rev-parse origin/main
git log --oneline --decorate -15
```

Règles :

1. Ne suppose aucun hash depuis un ancien rapport.
2. Si le working tree contient des changements sans rapport avec cette mission,
   ne supprime rien, ne reset rien et arrête-toi avec un rapport précis.
3. Les fichiers du kit V4 peuvent être ajoutés et commités comme références.
4. Actualise `origin` avec `git fetch origin`.
5. Ne commence pas sur une branche divergente ou obsolète.
6. Crée ensuite :

```powershell
git switch -c feature/frontend-rebuild-v4
```

7. Aucun push, aucune fusion et aucun déploiement pendant cette mission.

---

## 4. AUDIT AVANT IMPLÉMENTATION

Utilise au moins deux agents en lecture seule :

### Agent A — architecture frontend

Cartographie :

- `index.html` ;
- tous les scripts chargés ;
- toutes les feuilles CSS ;
- l’ordre de chargement ;
- les modules globaux ;
- les événements personnalisés ;
- les sélecteurs DOM utilisés par les tests ;
- les zones où le HTML est généré dynamiquement ;
- les risques XSS et `innerHTML`.

### Agent B — contrats fonctionnels

Cartographie :

- Auth Supabase ;
- profil et changement de pseudo ;
- quiz classé et entraînement ;
- classement ;
- commentaires ;
- Realtime ;
- Socket.IO ;
- états de salle ;
- création, connexion, prêt, lancement, réponses et résultats ;
- configuration runtime Render ;
- PWA, manifeste et service worker.

Produis avant le code :

```text
docs/design/frontend-v4/01-current-frontend-map.md
docs/design/frontend-v4/02-functional-contracts.md
docs/design/frontend-v4/03-screen-component-map.md
docs/design/frontend-v4/04-test-impact-plan.md
```

Ne commence la reconstruction qu’après avoir confirmé que les contrats sont
compris.

---

## 5. ARCHITECTURE CIBLE

Reste compatible avec la SPA Vanilla actuelle.

Crée une architecture CSS similaire à :

```text
assets/css/
  tokens.css
  reset.css
  base.css
  layout.css
  utilities.css
  components/
    buttons.css
    cards.css
    forms.css
    navigation.css
    modal.css
    feedback.css
  pages/
    intro.css
    home.css
    explorer.css
    solo.css
    multiplayer.css
    results.css
    leaderboard.css
    community.css
    articles.css
    profile.css
    system-states.css
  responsive.css
```

Adapte cette structure si l’audit montre qu’une organisation équivalente est
plus sûre. Évite les fichiers monolithiques.

Pour JavaScript :

- sépare le rendu des données ;
- conserve les contrats publics utilisés par les modules existants ;
- évite les globals supplémentaires ;
- n’utilise jamais de saisie utilisateur avec `innerHTML` ;
- utilise `textContent`, `createElement` et des helpers DOM sûrs ;
- conserve les protections anti-double action ;
- conserve l’idempotence côté serveur.

---

## 6. DESIGN SYSTEM OFFICIEL

Définis des variables CSS :

```css
--color-bg: #0F1720;
--color-gunmetal: #292F36;
--color-primary: #4ECDC4;
--color-text: #F7FFF7;
--color-danger: #FF6B6B;
--color-accent: #FFE66D;
```

Ajoute les tokens nécessaires pour :

- surfaces ;
- bordures ;
- textes secondaires ;
- états succès, avertissement et erreur ;
- ombres ;
- rayons ;
- espacements ;
- largeur maximale ;
- typographie ;
- transitions.

Contraintes visuelles :

- aucun violet dominant ;
- fond bleu-noir ;
- cartes sombres légèrement contrastées ;
- bordures fines ;
- turquoise pour les actions principales ;
- corail pour les actions secondaires ou destructives ;
- jaune pour les récompenses, rangs et accents ;
- illustrations 3D simples du pack ;
- textes en HTML/CSS, jamais incrustés dans les images ;
- pas de personnage ou logo externe ajouté depuis Internet.

---

## 7. ASSETS

Copie les assets d’exécution vers une arborescence stable, par exemple :

```text
assets/images/memoriz/
```

Conserve les noms de fichiers du pack.

### Catégories

Les 26 fichiers correspondent directement aux clés existantes :

```js
const imageUrl = `assets/images/memoriz/categories/${categoryKey}.webp`;
```

N’ajoute pas une seconde table de correspondance fragile si la clé suffit.

Prévois un fallback visuel si un fichier est absent.

### Images responsive

Pour l’introduction et les fonds :

- variantes mobile ;
- variantes web ;
- `<picture>` ou sélection contrôlée selon le viewport ;
- dimensions explicites ;
- `object-fit: cover` ;
- pas de déplacement de mise en page.

### Chargement

- précharge uniquement les cinq images de l’introduction ;
- charge paresseusement les catégories, articles et avatars hors viewport ;
- ne mets aucun asset massif en base64 dans le HTML ou le CSS.

---

## 8. INTRODUCTION AUTOMATIQUE

Implémente l’introduction avant le shell principal :

1. inactif ;
2. premier marqueur ;
3. deuxième marqueur ;
4. troisième marqueur ;
5. éveil ultime ;
6. fondu vers l’accueil.

Règles absolues :

- aucune interaction nécessaire ;
- aucun bouton « Suivant » ;
- aucun bouton « Commencer » ;
- aucune pagination cliquable ;
- aucun lien permettant de rejouer l’introduction ;
- aucun mockup de téléphone ;
- aucun texte incrusté dans les assets ;
- empêcher les clignotements entre images ;
- libérer les timers et écouteurs après la transition ;
- respecter `prefers-reduced-motion`.

Joue l’introduction une fois par session d’application avec `sessionStorage`.
En mode réduction des animations, affiche brièvement l’état final, puis ouvre
l’application sans mouvement complexe.

Ajoute des tests déterministes avec horloge contrôlée.

---

## 9. SHELL RESPONSIVE

### Mobile

- en-tête compact ;
- navigation inférieure fixe ;
- cinq destinations maximum ;
- zone centrale du logo/action telle que la référence ;
- respect des safe areas ;
- contenu non masqué par la navigation.

### Desktop

- barre de navigation horizontale ;
- largeur de contenu maîtrisée ;
- profil et notifications à droite ;
- grilles responsives ;
- panneaux latéraux sur les écrans de jeu, classement et articles.

Breakpoints à tester :

```text
320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920
```

Aucun débordement horizontal.

---

## 10. ÉCRANS À RECONSTRUIRE

### 10.1 Accueil

- accroche principale ;
- CTA pour lancer un quiz ;
- Solo, Multijoueur et Classement ;
- catégories à la une ;
- article récent ;
- aperçu de la communauté ;
- statistiques et badges sur desktop.

Les données doivent provenir des sources existantes, pas de valeurs codées en
dur.

### 10.2 Explorer

- recherche ;
- filtres ;
- tri ;
- affichage des 26 catégories ;
- navigation clavier ;
- état recherche vide ;
- correspondance exacte entre la clé et l’asset.

### 10.3 Solo

- catégorie ;
- chronomètre ;
- score ;
- progression ;
- réponses trouvées ;
- cases restantes ;
- champ de saisie ;
- bouton valider ;
- feedback correct, incorrect et doublon ;
- bonus ;
- encart explicatif si la donnée existe.

Ne révèle pas les réponses non trouvées avant la fin.

### 10.4 Portail multijoueur

- séparation claire Créer / Rejoindre ;
- catégorie ;
- nombre de joueurs ;
- paramètres réellement supportés par le backend ;
- option privée seulement si elle est supportée ;
- code de salle ;
- copier/coller ;
- erreurs explicites.

Ne présente pas de réglage qui n’existe pas côté serveur.

### 10.5 Lobby

- code copiable ;
- catégorie ;
- joueurs ;
- hôte ;
- prêt ;
- connecté/déconnecté ;
- places restantes ;
- quitter ;
- lancer uniquement pour l’hôte ;
- bouton actif uniquement lorsque les conditions serveur sont satisfaites.

Conserve la comparaison correcte entre `hostId` et l’identifiant de profil,
ainsi que le verrou anti-double lancement.

### 10.6 Partie multijoueur

Chaque joueur répond de son côté :

- interface proche du mode solo ;
- réponses personnelles uniquement ;
- progression personnelle ;
- score personnel ;
- classement en direct ;
- statut des autres joueurs sans révéler leurs réponses ;
- reconnexion ;
- abandon ;
- fin de partie.

Le serveur reste autoritaire.

### 10.7 Résultats

- podium ;
- classement final ;
- score personnel ;
- points crédités ;
- précision ;
- série ;
- réponses trouvées ;
- progression ;
- badges si disponibles ;
- rejouer, nouvelle partie et retour.

### 10.8 Classement

- Top 20 ;
- podium ;
- rang personnel ;
- départage existant ;
- filtres réellement pris en charge ;
- états chargement et vide.

### 10.9 Communauté et commentaires

- fil de commentaires ;
- création ;
- pagination ;
- Realtime privé ;
- modification ;
- suppression logique ;
- statut édité ;
- propriétaire seulement ;
- menu vertical à trois points ;
- fermer au clic extérieur, `Escape` et changement de commentaire ;
- ne pas afficher les actions sur les commentaires des autres.

Ne rajoute pas de système de likes ou de réponses si le backend actuel ne le
supporte pas. Les références visuelles représentent une direction, pas une
autorisation d’inventer de nouvelles données.

### 10.10 Articles

L’application existante contient des articles statiques. Recompose leur
présentation sans inventer un backend éditorial.

- liste ;
- recherche locale si pertinente ;
- filtres basés sur les métadonnées réellement disponibles ;
- article vedette ;
- page de lecture ;
- favoris uniquement s’ils sont déjà fonctionnels ;
- sommaire local ;
- images du pack ;
- typographie de lecture accessible.

### 10.11 Profil

- avatar ;
- pseudo ;
- niveau uniquement si la donnée existe ;
- score ;
- quiz terminés ;
- historique réel ;
- badges réels ;
- catégories préférées si calculables ;
- changement de pseudo avec délai de quatorze jours ;
- sélection d’un avatar parmi le pack.

Ne simule pas des métriques inexistantes. Masque ou adapte les blocs non
alimentables.

### 10.12 États système

Crée des composants réutilisables pour :

- chargement ;
- aucune donnée ;
- aucun résultat ;
- connexion perdue ;
- erreur serveur ;
- session expirée ;
- accès refusé ;
- maintenance ;
- contenu indisponible.

Chaque état doit comporter :

- illustration du pack ;
- titre ;
- message ;
- action pertinente ;
- accessibilité correcte.

---

## 11. ACCESSIBILITÉ

Minimum requis :

- HTML sémantique ;
- un seul `h1` par vue ;
- labels de formulaire ;
- erreurs associées aux champs ;
- navigation clavier ;
- focus visible ;
- modales avec focus piégé et restitué ;
- `aria-live` pour les scores, erreurs et changements de statut ;
- boutons d’au moins 44 × 44 px sur tactile ;
- contraste suffisant ;
- alternative textuelle des images ;
- `prefers-reduced-motion`.

Supprime les pseudo-en-têtes de sécurité invalides en `<meta>`, notamment
`X-Frame-Options`, qui doit être géré par les en-têtes HTTP et non par le HTML.

---

## 12. PERFORMANCE ET PWA

- conserver le manifeste et le service worker ;
- auditer le cache des nouveaux assets ;
- versionner le cache ;
- supprimer les anciens assets obsolètes uniquement après preuve qu’ils ne
  sont plus référencés ;
- optimiser les images sans perte visuelle notable ;
- éviter les polices distantes si elles bloquent le rendu ;
- éviter les gros scripts synchrones ;
- pas de fuite d’écouteurs ou de timers ;
- tester la navigation après restauration depuis le cache.

Budgets indicatifs :

- aucune image de catégorie supérieure à 350 Ko sans justification ;
- aucun fond supérieur à 700 Ko sans justification ;
- pas de bundle JavaScript monolithique supplémentaire ;
- pas de layout shift majeur.

---

## 13. TESTS

Conserve tous les tests existants et ajoute des tests dédiés.

### Tests frontend nécessaires

- introduction automatique complète ;
- réduction des animations ;
- shell mobile et desktop ;
- affichage des 26 catégories ;
- recherche et filtres ;
- solo : saisie, réponses trouvées, score et fin ;
- portail multijoueur ;
- profil prêt avant Socket.IO ;
- lobby hôte/invité ;
- bouton lancer ;
- double-clic avant ACK ;
- reconnexion ;
- résultats ;
- classement ;
- commentaires et menu vertical ;
- changement de pseudo ;
- choix d’avatar ;
- états système ;
- aucun débordement horizontal aux largeurs cibles.

### Tests de sécurité

- aucune clé secrète dans le frontend ;
- aucune saisie rendue avec HTML non sûr ;
- CORS inchangé ;
- Auth et RLS inchangés ;
- migrations inchangées ;
- fichiers runtime ignorés.

### Commandes finales

Exécute au minimum :

```powershell
npm run lint
npm run format:check
npm run security:scan
npm run test:frontend
npm run test:backend
npm run test:backend:socket
npm run test:all
npm run build:render
npm run test:render-build
git diff --check
```

Lance les suites plusieurs fois si elles ont historiquement été instables.

Pour Supabase :

```powershell
npx supabase start
npx supabase db reset
npx supabase test db
npx supabase db lint --local --schema public,private --fail-on error
npx supabase stop --no-backup
```

Ces commandes sont destinées au Supabase local uniquement.

N’exécute jamais :

```text
supabase db reset --linked
supabase migration repair
```

Aucune opération destructive sur le projet distant.

---

## 14. COMMITS

Crée des commits thématiques, par exemple :

```text
docs: add memoriz v4 design handoff
refactor: establish frontend v4 design system
feat: add automatic intro experience
feat: rebuild home and category explorer
feat: rebuild solo quiz experience
feat: rebuild multiplayer experience
feat: rebuild leaderboard and community
feat: rebuild articles and profile
test: validate frontend v4 responsive flows
docs: document frontend v4 architecture
```

Adapte les intitulés à ce qui est réellement modifié.

Ne pousse aucun commit.

---

## 15. AUTO-REVUE FINALE

Utilise au moins deux agents de revue indépendants :

### Revue 1 — sécurité et contrats

Vérifie :

- Auth ;
- profils ;
- RLS ;
- RPC ;
- Realtime ;
- Socket.IO ;
- score serveur ;
- secrets ;
- configuration Render ;
- absence de modification SQL.

### Revue 2 — UX, responsive et accessibilité

Vérifie :

- fidélité aux références ;
- cohérence mobile/web ;
- 320 à 1920 px ;
- clavier ;
- focus ;
- formulaires ;
- modales ;
- contraste ;
- réduction des animations ;
- états vides et erreurs.

Corrige les problèmes confirmés, rejoue les validations et produis un rapport
final.

---

## 16. RAPPORT FINAL ATTENDU

Réponds avec :

1. branche ;
2. hash de départ ;
3. état de `main` et `origin/main` ;
4. agents et skills utilisés ;
5. architecture avant/après ;
6. liste des écrans reconstruits ;
7. fichiers créés, modifiés et supprimés ;
8. contrats préservés ;
9. tests ajoutés ;
10. résultats complets des validations ;
11. audits accessibilité et responsive ;
12. audit des secrets ;
13. preuve que `backend/` et `supabase/` n’ont pas été modifiés, sauf fichiers
    explicitement justifiés ;
14. hashes des commits ;
15. `git status` final ;
16. anomalies ou limites restantes.

Verdict final exact parmi :

```text
FRONTEND V4 VALIDÉ — PRÊT POUR REVUE UTILISATEUR
```

ou :

```text
FRONTEND V4 BLOQUÉ — AUCUN PUSH
```

Aucun push, aucune fusion et aucun déploiement.
