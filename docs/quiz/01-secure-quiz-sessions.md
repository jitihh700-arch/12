# Sessions de quiz securisees

## Perimetre

La Phase 4A deplace la reference canonique du quiz dans PostgreSQL sans brancher le frontend. `index.html`, `assets/css/` et `assets/js/` restent inchanges. Le quiz solo local garde son score historique `+1`, son timer de 600 secondes et ses messages actuels.

Le score serveur destine au profil et au leaderboard vaut 10 points par bonne reponse. Le navigateur ne fournit jamais de points, de nombre de bonnes reponses, de statut final ou de `user_id`.

## Audit Du Moteur Actuel

| Categorie | Identifiant | Reponses | Duree | Normalisation | Metadonnees |
| --- | --- | ---: | --- | --- | --- |
| 📺 Séries TV - Top 20 des légendes | `series` | 20 | 600 s | minuscules, NFD, retrait accents, prefixe annee, ponctuation hors `[a-z0-9\s]`, trim | aucune |
| 🎬 Cinéma - Top 20 des icônes | `films` | 20 | 600 s | meme regle | aucune |
| 🌍 Anime/Manga - Top 30 des plus célèbres au monde | `animeCelebres` | 30 | 600 s | meme regle | aucune |
| 💀 Anime/Manga - Top 20 des plus détestés | `animeDeteste` | 20 | 600 s | meme regle | aucune |
| 🌌 Anime/Manga - Top 20 des plus puissants (Version Ultime) | `animeForts` | 20 | 600 s | meme regle | aucune |
| 🧠 Anime/Manga - Top 15 des génies ultimes | `animeIntelligents` | 15 | 600 s | meme regle | aucune |
| ⚽🏀🎵 Sports & Musique - Top 40 des stars mondiales | `sportsMusique` | 40 | 600 s | meme regle | aucune |
| 👎 Séries TV - Top 10 des plus détestés | `seriesDeteste` | 10 | 600 s | meme regle | aucune |
| 👸 Anime/Manga - Top 15 des filles les plus puissantes | `fillesPuissantes` | 15 | 600 s | meme regle | aucune |
| ⚽ Football - Top 15 des meilleurs joueurs de tous les temps | `meilleursFootballeurs` | 15 | 600 s | meme regle | aucune |
| 📋 Football - Top 10 des meilleurs entraîneurs de tous les temps | `meilleursEntraineurs` | 10 | 600 s | meme regle | aucune |
| 📖 Mangas - Top 15 des meilleurs mangas de tous les temps | `meilleursMangas` | 15 | 600 s | meme regle | aucune |
| 🎬 Animes - Top 15 des meilleurs animes de tous les temps | `meilleursAnimes` | 15 | 600 s | meme regle | aucune |
| 🤪 Anime/Manga - Top 10 des personnages les plus idiots | `animeIdiots` | 10 | 600 s | meme regle | aucune |
| ⚔️ Anime/Manga - Top 20 des meilleurs combats (tapez le nom avec 'vs') | `meilleursCombats` | 20 | 600 s | meme regle | aucune |
| 📖 Anime/Manga - Top 10 des meilleurs arcs | `meilleursArcs` | 10 | 600 s | meme regle | aucune |
| ✨ Anime/Manga - Top 10 des meilleures techniques | `meilleuresTechniques` | 10 | 600 s | meme regle | aucune |
| 🔄 Anime/Manga - Top 10 des meilleures transformations | `meilleuresTransformations` | 10 | 600 s | meme regle | aucune |
| 🏆 Ligue des Champions - Vainqueurs de 2000 à 2026 | `ligueDesChampions` | 27 | 600 s | meme regle | 27 annees |
| 🥇 Ballon d'Or - Vainqueurs de 2000 à 2025 | `ballonDor` | 25 | 600 s | meme regle | 25 annees |
| 🎮 Légendes du Jeu Vidéo - Top 10 des jeux cultes | `jeuxVideo` | 10 | 600 s | meme regle | aucune |
| 🦸 Super-héros Marvel & DC - Top 20 | `superHeros` | 20 | 600 s | meme regle | aucune |
| 🎤 Rap Français & US - Top 15 des légendes | `rapFrUs` | 15 | 600 s | meme regle | aucune |
| 🔍 Trouve l'Anime (Emojis) | `trouveAnime` | 15 | 600 s | meme regle | 15 indices |
| 🎭 Devine le Personnage (Indices) | `devinePersonnage` | 20 | 600 s | meme regle | 20 indices, doublon `Naruto Uzumaki` preserve |
| 🏛️ Anime par Organisation | `animeParOrganisation` | 9 | 600 s | meme regle | 9 indices |

Le moteur courant marque la premiere reponse non trouvee qui matche: reponse normalisee exacte, premier mot si plus de deux caracteres, ou dernier mot si la reponse normalisee contient plusieurs mots. Les doublons deja trouves ne rapportent plus sur la meme instance. Le doublon `Naruto Uzumaki` dans `devinePersonnage` est volontairement conserve: une deuxieme soumission peut trouver la deuxieme occurrence, comme dans le JS actuel.

`restartGame()` ferme la session locale puis rouvre la meme categorie. `closeGame()` supprime le panneau et arrete le timer. `endGame()` revele les reponses non trouvees cote navigateur; la Phase 4A ne change pas ce comportement local.

## Modele Serveur

Le schema `private` contient `quiz_categories` et `quiz_answers`. Les tables publiques `quiz_sessions`, `quiz_session_answers` et `user_category_stats` portent seulement l'etat joueur. RLS est activee et les droits directs sont retires aux roles clients.

Une seule session active est autorisee par joueur. `start_quiz_session` expire les sessions actives deja depassees puis abandonne toute autre session active du meme joueur avant d'en creer une nouvelle. Cette regle prepare les futurs boutons close et restart sans double credit.

`submit_quiz_answer` verrouille la session avec `FOR UPDATE`, normalise la saisie et cherche la premiere reponse canonique non trouvee. Les bonnes reponses sont stockees par `answer_id` et valeur normalisee, jamais avec le texte original saisi. Les mauvaises reponses ne revelent ni la bonne reponse ni la liste restante.

`complete_quiz_session` est idempotente. Elle credite `profiles.total_points`, `profiles.quizzes_completed` et `user_category_stats` seulement lors du passage effectif de `active` a `completed`. Une session expiree ou abandonnee ne credite aucun point.

## Securite

Les fonctions clientes utilisent `auth.uid()`, des objets qualifies, `SECURITY DEFINER` quand une ecriture controlee est necessaire, et `set search_path = ''`. Les helpers prives ne sont pas executables par `authenticated`.

Limite transitoire: les reponses canoniques restent aussi dans `assets/js/quiz-data.js` tant que le frontend solo local n'est pas migre. La protection Phase 4A concerne le score serveur et le leaderboard, pas encore la revelation locale historique en fin de quiz.
