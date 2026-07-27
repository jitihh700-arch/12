# Strategie temps reel

## Principe directeur

Le temps reel ne doit pas etre ajoute directement dans `showGamePanel` ou `QuizGame` actuels. Il faut d'abord isoler:

- l'etat de partie;
- la validation des reponses;
- le rendu DOM;
- le transport temps reel;
- la persistance.

Le mode solo doit rester local au debut pour limiter les regressions.

## Frontieres d'etat

| Etat | Autorite recommandee | Commentaire |
| --- | --- | --- |
| Theme | Client | Reste dans `localStorage` |
| Panneau ouvert | Client | Etat purement UI |
| Sons et animations | Client | Pas besoin de persistance |
| Profil/pseudo | Supabase + backend | Pseudo unique et valide |
| Commentaires | Supabase avec RLS | Temps reel via Supabase ou backend |
| Score leaderboard | Serveur/base | Ne pas faire confiance au client |
| Session multijoueur | Backend Socket.io | Room + snapshot autoritaire |
| Timer multijoueur | Serveur | `startedAt`/`endsAt` |
| Reponses trouvees en multi | Serveur | Idempotence et arbitrage |

## Evenements Socket.io proposes

Client vers serveur:

| Evenement | Role |
| --- | --- |
| `session:create` | Creer une session multijoueur |
| `session:join` | Rejoindre une session |
| `session:leave` | Quitter proprement |
| `answer:submit` | Soumettre une reponse |
| `reaction:send` | Envoyer une reaction |
| `leaderboard:subscribe` | Suivre un classement |

Serveur vers client:

| Evenement | Role |
| --- | --- |
| `session:snapshot` | Reconstruire tout l'etat apres join/reconnect |
| `player:joined` | Presence joueur |
| `player:left` | Depart ou timeout |
| `answer:accepted` | Reponse validee et etat mis a jour |
| `answer:rejected` | Reponse refusee avec raison |
| `timer:sync` | Synchronisation de temps |
| `game:completed` | Fin autoritaire |
| `reaction:received` | Reaction diffusee |
| `leaderboard:update` | Classement mis a jour |

## Payload minimal recommande

Tous les evenements importants doivent porter:

- `eventId`;
- `sessionId`;
- `playerId` si applicable;
- `categoryKey`;
- `clientSeq` pour les messages client;
- `serverSeq` pour les messages serveur;
- `createdAt`;
- `clientSubmissionId` pour `answer:submit`.

## Reconnexion et idempotence

Cas a couvrir:

- refresh pendant une partie;
- perte reseau puis retour;
- double clic sur validation;
- reemission d'un message par Socket.io;
- deux joueurs soumettent la meme reponse presque au meme moment;
- un joueur quitte puis revient.

Regle recommandee: le serveur renvoie toujours un `session:snapshot` complet apres reconnexion. Le client reconstruit l'ecran depuis le snapshot au lieu de supposer que `currentGame` est encore valable.

## Supabase Realtime ou Socket.io

Usage recommande:

- Supabase Realtime: commentaires, reactions simples, leaderboard lu en temps reel si les volumes restent faibles.
- Socket.io: sessions multijoueur, timer, presence, reponses simultanees, arbitrage et reconnexion.

Justification: les parties multijoueur demandent une autorite applicative, des rooms, de l'idempotence et une logique de sequence. Socket.io est plus adapte a cette couche que de simples changements de table.

## Securite temps reel

- Authentifier la socket avec le token Supabase.
- Verifier chaque `sessionId` cote serveur.
- Valider les payloads avec schemas.
- Refuser les evenements inattendus selon l'etat de session.
- Appliquer rate limit par joueur et par IP.
- Journaliser les erreurs de protocole.
- Ne jamais diffuser de contenu utilisateur sans echappement cote rendu.

## Tests temps reel obligatoires

- deux clients rejoignent la meme session;
- `answer:submit` simultane pour la meme question;
- reconnexion et snapshot;
- duplication de `clientSubmissionId`;
- expiration timer serveur;
- joueur deconnecte;
- payload invalide;
- tentative de rejoindre une session inexistante ou terminee.
