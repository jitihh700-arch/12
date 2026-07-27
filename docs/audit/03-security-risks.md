# Risques de securite

## Portee

Audit statique du depot actuel. Aucun backend, aucune authentification, aucune base de donnees, aucun endpoint API et aucune dependance npm ne sont presents. Les risques ci-dessous concernent donc l'application statique actuelle et les surfaces qui deviendront critiques lors de l'ajout de Supabase, commentaires, leaderboard et Socket.io.

## Risques confirmes

| Priorite | Risque | Preuve observee | Impact | Mitigation progressive |
| --- | --- | --- | --- | --- |
| Haute actuelle/future | XSS DOM via `innerHTML` | `handleQuickSubmit()` reinjecte `answer` dans les messages d'erreur, puis `showMessage()` rend avec `innerHTML`; autres usages dans `updateRow`, `updateFoundList`, `endGame`, `showLegalPage`; `insertAdjacentHTML` dans `showGamePanel` | Aujourd'hui le risque est surtout self-XSS. Avec pseudos, commentaires, leaderboard ou Socket.io, il deviendrait partage ou persistant | Remplacer en priorite `showMessage()` par rendu texte/creation DOM; remplacer les rendus dynamiques utilisateur par `textContent`; reserver `innerHTML` aux contenus statiques controles |
| Haute future | Score client non fiable | `QuizGame.submitAnswer()` incremente `score` cote navigateur | Leaderboard ou multi pourraient etre manipules si le score client devient source d'autorite | Le serveur doit recalculer score et validation; le client n'envoie que des intentions |
| Haute future | Timer client non autoritaire | `startTimer()` decremente `timeLeft` localement | En multijoueur, fins de partie divergentes; manipulation possible | Utiliser `startedAt`/`endsAt` serveur et synchronisation Socket.io |
| Moyenne actuelle | Headers securite incomplets | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` sont en `meta`; pas de CSP observee | Les metas ne couvrent pas tous les controles; absence de CSP avant contenus dynamiques | Ajouter de vrais headers cote hebergement/backend, puis CSP adaptee |
| Moyenne future | Donnees personnelles et texte legal incoherents | `legalContent.privacy` indique aucune collecte | Supabase anonymous auth, pseudos, commentaires et leaderboard collecteront des donnees | Revoir confidentialite/CGU avant Phase 2 et Phase 3 |
| Moyenne future | Absence de rate limiting | Aucune couche serveur actuelle | Spam commentaires, spam reactions, brute force de reponses en multi | Rate limits Express/Socket.io, quotas Supabase, moderation |
| Moyenne future | Identite utilisateur non definie | Pas de pseudo, profil ni auth actuellement | Collision de pseudos, usurpation, abus de leaderboard | Pseudo unique en base, RLS, contraintes SQL, validation serveur |
| Moyenne future | Evenements temps reel non idempotents | Modele actuel marque une reponse par index local | Reconnexion ou double submit pourrait compter deux fois | `clientSubmissionId`, `eventId`, contrainte unique par `sessionId/questionId` |
| Basse actuelle | `window.onclick` global | `initLegalPages()` assigne `window.onclick` | Peut ecraser un handler global futur | Utiliser `addEventListener` et nettoyer les listeners |
| Basse actuelle | Liens et domaines externes | Liens Sapeo, YouTube, TikTok, Twitch, WhatsApp, Twitter/X | Surface de navigation externe, dont reverse tabnabbing si `noopener` manque | Conserver `rel="noopener noreferrer"` sur tous les `target="_blank"` et ouvrir les partages avec `noopener` |
| Basse actuelle | Fichier Pinterest volumineux | `pinterest-96d89.html` contient une page complete avec ressources externes, pas seulement une preuve minimale | Chargements tiers inutiles si l'URL est visitee | Confirmer le besoin, puis reduire a la verification minimale si possible |

## Usage de `innerHTML`

Le risque existe deja pour la saisie de reponse: une reponse refusee ou deja trouvee est incluse dans le message affiche, puis rendue par `showMessage()` avec `innerHTML`. Dans l'application actuelle, l'impact est surtout local a l'utilisateur, car il n'y a pas de compte, token applicatif, commentaire ni diffusion reseau.

Le risque deviendra eleve quand les sources suivantes seront ajoutees:

- pseudo utilisateur;
- commentaire;
- reaction;
- contenu Supabase;
- message Socket.io;
- donnee de leaderboard.

Regle recommandee: tout contenu venant d'un utilisateur ou d'une API doit etre rendu avec `textContent` ou une fonction de creation DOM. Les contenus HTML statiques, comme les pages legales, doivent rester dans un module controle et audite.

Correction prioritaire a planifier, sans la faire dans cette Phase 0: `showMessage()` doit creer un conteneur `.message`, definir sa classe depuis une liste blanche (`success`, `error`) et inserer le texte via `textContent`.

## Stockage local

Seule la cle `memoriz_theme` est utilisee dans `localStorage`. Aucun token, score ou profil n'est stocke actuellement. Lors de l'ajout Supabase:

- ne pas stocker de secret de service cote client;
- ne pas stocker de role privilegie;
- conserver uniquement les tokens geres par le SDK Supabase cote navigateur;
- documenter la duree de session anonyme.

## Supabase et RLS: controles attendus

Avant activation production:

- activer RLS sur toutes les tables exposees;
- refuser les updates directes de score client si le score doit etre autoritaire;
- separer politiques de lecture publique et ecriture authentifiee;
- limiter les colonnes modifiables par l'utilisateur;
- ajouter contraintes SQL pour pseudo unique, reaction unique par utilisateur/cible, soumission unique par session/question;
- valider les migrations localement et en CI.

## Socket.io: controles attendus

- Authentifier la connexion avec le token Supabase anonyme.
- Verifier cote serveur que le joueur appartient a la session.
- Valider tous les payloads avec un schema.
- Ajouter idempotence et numeros de sequence.
- Gerer deconnexion, reconnexion et replay.
- Ne jamais faire confiance au score envoye par le client.

## Secrets et dependances

Aucun fichier d'environnement ou secret n'a ete observe dans le depot actuel. Lors de l'ajout du backend:

- utiliser `.env.example` sans valeurs sensibles;
- ajouter `.gitignore` pour `.env`;
- activer detecteur de secrets en CI;
- eviter toute cle Supabase `service_role` cote frontend;
- auditer les dependances avec `npm audit` ou outil equivalent.

## Verifications restantes

- Verifier les vrais headers HTTP sur l'hebergement Render, car ils ne sont pas prouvables par lecture du depot.
- Confirmer le domaine canonique avant CSP et configuration CORS.
- Confirmer la politique produit sur moderation des commentaires et reactions.
