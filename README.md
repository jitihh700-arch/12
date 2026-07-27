# Memoriz

Memoriz est un quiz web statique en francais autour de la culture pop, du sport, de la musique, des animes et du cinema. Le mode solo reste jouable sans compte, et la Phase 2B ajoute un profil anonyme Supabase avec pseudo unique.

## Prerequis

- Node.js 20 ou plus.
- npm.
- Docker Desktop avec le backend WSL 2 actif.
- Python disponible dans le PATH pour servir le frontend statique pendant les tests.

## Installation

```powershell
npm install
```

## Supabase local

Le projet utilise la CLI Supabase locale installee en dependance de developpement.

```powershell
$env:Path = 'C:\Program Files\Docker\Docker\resources\bin;' + $env:Path
npx supabase start
npx supabase db reset
```

Les connexions anonymes sont activees dans `supabase/config.toml` avec `enable_anonymous_sign_ins = true`.

## Configuration frontend

Le fichier suivi `assets/js/supabase-config.example.js` montre la forme attendue. Le fichier reel `assets/js/supabase-runtime-config.js` est ignore par Git.

Generez la configuration runtime avec des variables d'environnement:

```powershell
$env:SUPABASE_URL = 'https://example.supabase.co'
$env:SUPABASE_PUBLISHABLE_KEY = 'publishable-key'
npm run config:supabase
```

Le script refuse les valeurs absentes et les cles ressemblant a `service_role` ou a une secret key. Ne commitez jamais le fichier runtime reel.

## Lancement frontend

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Puis ouvrir `http://127.0.0.1:4173/index.html`.

## Tests

```powershell
npm run test:auth
npm run test:frontend
npx supabase db reset
npx supabase test db
npx supabase db lint --local
```

Pour installer les navigateurs Playwright sur une machine neuve:

```powershell
npx playwright install chromium
```

## Securite des cles

- Le frontend charge uniquement une publishable key.
- Aucune cle `service_role`, secret key, JWT secret ou chaine `postgres://` ne doit etre stockee dans Git.
- Le client n'ecrit pas directement dans `public.profiles`.
- Les operations profil passent uniquement par les RPC `register_profile`, `get_my_profile` et `change_my_pseudo`.

## Structure principale

- `index.html`: page statique Memoriz.
- `assets/js/quiz-data.js`: donnees du quiz.
- `assets/js/quiz-solo.js`: moteur du quiz solo.
- `assets/js/api.js`: client Supabase et wrapper RPC profil.
- `assets/js/auth.js`: session anonyme et interface profil.
- `assets/css/app.css`: styles.
- `supabase/`: migrations, configuration et tests SQL.
- `tests/frontend/`: tests Playwright Phase 2B.
- `docs/`: documentation technique par phase.
