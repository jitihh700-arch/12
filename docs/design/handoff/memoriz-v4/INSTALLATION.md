# Utilisation du kit

## 1. Extraire

Extraire le dossier `memoriz_frontend_handoff_v4` dans un emplacement temporaire.

## 2. Copier dans le dépôt

Depuis PowerShell, adapter le chemin du dossier extrait :

```powershell
$repo = "C:\Users\HP\Documents\mohamed\12"
$kit = "C:\CHEMIN\VERS\memoriz_frontend_handoff_v4"

New-Item -ItemType Directory -Force `
  "$repo\docs\design\handoff\memoriz-v4" | Out-Null

Copy-Item "$kit\*" `
  "$repo\docs\design\handoff\memoriz-v4" `
  -Recurse -Force
```

## 3. Lancer Codex

Ouvrir le dépôt :

```powershell
cd C:\Users\HP\Documents\mohamed\12
```

Donner à Codex le contenu de :

```text
docs/design/handoff/memoriz-v4/prompts/CODEX_FRONTEND_REBUILD_V4.md
```

Le prompt exige un audit avant modification, interdit le push et protège le
backend, Supabase et les migrations.
