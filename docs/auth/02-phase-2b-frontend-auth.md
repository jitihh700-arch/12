# Phase 2B - Authentification anonyme frontend

## Perimetre

La Phase 2B ajoute l'integration frontend minimale pour les profils anonymes Supabase. Elle ne change pas les donnees du quiz, les regles de score, les durees, les categories, les commentaires, le leaderboard, le multijoueur ou le partage social.

Le frontend reste statique. Aucun backend Express et aucun Socket.io ne sont ajoutes.

## Configuration runtime

Le fichier suivi `assets/js/supabase-config.example.js` donne uniquement la forme attendue:

```js
window.MEMORIZ_SUPABASE_CONFIG = {
    url: '',
    publishableKey: ''
};
```

Le fichier reel `assets/js/supabase-runtime-config.js` est ignore par Git. Il peut contenir l'URL Supabase et la publishable key de l'environnement courant, mais aucune valeur locale ne doit etre committee.

La cle `service_role` est interdite cote frontend. Le client utilise seulement la publishable key et les regles RLS/RPC de la Phase 2A.

La generation reproductible se fait avec:

```powershell
$env:SUPABASE_URL = '<url>'
$env:SUPABASE_PUBLISHABLE_KEY = '<publishable-key>'
npm run config:supabase
```

Le script `scripts/generate-supabase-config.mjs` refuse les valeurs absentes et les cles qui ressemblent a une secret key ou a une cle `service_role`. Il masque les valeurs dans la console.

## Chargement frontend

`index.html` charge:

- `@supabase/supabase-js` en version exacte `2.110.9` depuis jsDelivr;
- `assets/js/supabase-runtime-config.js`, ignore par Git;
- `assets/js/api.js`, wrapper RPC;
- `assets/js/auth.js`, orchestration auth anonyme et profil.

Si le CDN, la configuration ou Supabase local sont indisponibles, `auth.js` affiche un etat de profil hors ligne et ne bloque pas le quiz solo.

Le choix actuel reste un CDN a version figee, pas `latest`. Il est reproductible tant que jsDelivr sert cette version exacte. Aucun fichier de `node_modules` n'est charge directement par le navigateur.

## Flux utilisateur

```text
Chargement de la page
        ↓
auth.js lit window.MEMORIZ_SUPABASE_CONFIG
        ↓
api.js cree ou reutilise un seul client Supabase si la configuration est presente
        ↓
reprise ou creation d'une session anonyme
        ↓
get_my_profile()
        ↓
profil affiche ou invitation a creer un pseudo
```

Pour creer un profil, l'interface appelle `register_profile(p_pseudo)`.

Pour changer le pseudo, l'interface appelle `change_my_pseudo(p_pseudo)`.

L'interface calcule la prochaine date de changement seulement pour l'affichage. PostgreSQL reste l'autorite finale sur le delai de 14 jours.

## Surface API autorisee

`assets/js/api.js` initialise un seul client Supabase et expose seulement les RPC suivantes:

- `register_profile`;
- `get_my_profile`;
- `change_my_pseudo`.

Le frontend ne fait aucune ecriture directe dans `public.profiles`, ne lit pas une table avec `.from('profiles')`, n'envoie pas de `userId` et n'utilise aucune route applicative.

Il n'existe pas de fichier `supabase-client.js` separe dans cette phase: `api.js` porte volontairement la responsabilite du client unique et du wrapper RPC afin d'eviter deux points d'initialisation.

## Rendu et securite

Les pseudos renvoyes par Supabase sont des donnees utilisateur. Ils sont affiches avec `textContent`, jamais avec `innerHTML`.

La validation JavaScript du pseudo sert uniquement a ameliorer l'experience utilisateur. Les contraintes definitives restent celles de PostgreSQL:

- 3 a 20 caracteres;
- lettres, chiffres, espaces et underscores;
- nettoyage des espaces externes;
- reduction des espaces consecutifs;
- unicite insensible a la casse;
- accents conserves.

## Mode degrade

Le mode solo doit rester disponible dans ces cas:

- aucune configuration Supabase runtime;
- client CDN indisponible;
- Supabase local ou distant arrete;
- session anonyme impossible;
- RPC momentanement indisponible.

Dans ces cas, les cartes de categorie continuent d'appeler `showGamePanel(categoryKey)` et le score local reste gere par `quiz-solo.js`.

## Accessibilite profil

La modale profil utilise `role="dialog"`, `aria-modal="true"`, `aria-labelledby` et `aria-describedby`. La premiere creation de pseudo est obligatoire: `Escape`, le bouton fermer et le clic hors modale ne ferment pas cette modale tant que le profil n'existe pas. Le focus est place sur le champ pseudo, boucle dans la modale et revient au bouton d'origine apres un changement de pseudo.

## Limites restantes

- La persistence repose sur la session anonyme stockee par Supabase dans le navigateur. Si l'utilisateur efface les donnees locales, il perd l'acces a ce profil anonyme.
- Le profil ne met pas encore a jour `total_points`, `quizzes_completed` ou `last_played_at`.
- Aucun classement public n'est expose.
- La liaison vers un compte permanent reste une phase future.
- La modale legale historique n'est pas refondue en Phase 2B; elle est seulement couverte par une regression d'ouverture/fermeture.
