# Revue finale de securite Phase 6

## Perimetre

Cette revue couvre le frontend statique, Supabase local, PostgreSQL/RLS, le backend Express/Socket.io et les workflows CI. Aucun projet Supabase distant n'a ete lie ou modifie pendant la Phase 6.

## Matrice des risques

| Composant | Risque | Gravite | Preuve | Correction | Test associe | Statut |
| --- | --- | --- | --- | --- | --- | --- |
| Frontend legal | HTML injecte dans la modale legale | Moyenne | `assets/js/ui.js` utilisait `innerHTML` avec contenu statique | rendu via `createElement`, `textContent`, `replaceChildren` | `npm run lint:frontend` | Corrige |
| Frontend quiz solo | Template HTML historique | Faible | `assets/js/quiz-solo.js` garde `insertAdjacentHTML` pour un template applicatif interne | allowlist lint documentee, pas de donnee utilisateur injectee | `npm run lint:frontend`, tests quiz | Accepte |
| Frontend runtime config | Fichier local sensible suivi | Elevee | `assets/js/supabase-runtime-config.js` ignore dans Git | `.gitignore` renforce, scanner fichiers interdits | `npm run security:scan` | Corrige |
| Backend CORS | Origine trop ouverte ou unique mal documentee | Elevee | CORS et Socket.io acceptaient une chaine simple | liste fermee `FRONTEND_ORIGINS`, refus explicite, tests preflight/socket | backend integration/socket | Corrige |
| Backend env | Production demarre avec configuration incomplete | Elevee | schema env minimal Phase 5 | `NODE_ENV` borne, port borne, origines validees, localhost HTTP refuse en production | backend unit | Corrige |
| Backend logs | Token ou secret dans logs | Elevee | redaction partielle Phase 5 | redaction Bearer, JWT, sb_secret, postgres, password, access/refresh token | backend unit, `security:scan` | Corrige |
| Backend shutdown | Arret brutal possible | Moyenne | serveur sans handlers SIGTERM/SIGINT | lifecycle commun, fermeture Socket.io puis HTTP, timeout borne | backend unit, Docker SIGTERM | Corrige |
| Socket.io payload | payload massif | Moyenne | limite implicite Socket.io | `maxHttpBufferSize` borne a 4 KiB | backend socket | Corrige |
| PostgreSQL RLS | ecriture directe client | Elevee | migrations Phase 2A-5 | RLS activee, droits directs retires, RPC seules surfaces | pgTAP + scripts concurrence | Valide |
| PostgreSQL fonctions | `SECURITY DEFINER` dangereux | Elevee | audit migrations | `SET search_path = ''`, objets qualifies, grants cibles | pgTAP | Valide |
| Secrets | secrets reels dans Git | Critique | scan manuel et automatise | `security:scan`, workflows, `.gitignore` | `npm run security:scan` | Valide |

## CSP et headers

Frontend production recommande:

```text
Content-Security-Policy: default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://<project-ref>.supabase.co wss://<project-ref>.supabase.co https://<backend-host> wss://<backend-host>; upgrade-insecure-requests
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

En developpement local, retirer `upgrade-insecure-requests`, `Strict-Transport-Security`, et ajouter `http://127.0.0.1:4173`, `http://127.0.0.1:3001`, `ws://127.0.0.1:3001`, `http://127.0.0.1:54321`, `ws://127.0.0.1:54321` dans `connect-src`.

## Allowlist secrets et lint

Faux positifs documentes:

- `sb_secret_abc123`, `Bearer abc.def.ghi`, `eyJaaa.bbb.ccc` dans les tests de redaction;
- mentions documentaires de `postgres://`;
- placeholders `<supabase-publishable-key>` et `<backend-only-secret-key>`;
- template HTML interne historique dans `assets/js/quiz-solo.js`.

Aucune valeur reelle ne doit etre ajoutee a cette liste.

