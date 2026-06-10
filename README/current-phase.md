# Current Phase

Actieve fase: `fase1.md`

Status: klaar voor Fase 2, met asset- en content-gates voor latere fases.

## Primaire Fase 1-status

Open voor de actuele Fase 1-contractstatus:

- `docs/design/phase-plan/current-phase.md`
- `docs/design/content-gates.md`
- `docs/design/game-bible.md`
- `README/GameBibleNode.json`

Dit README-fasebestand blijft de korte fase-index. De inhoudelijke poortwachterdocumenten staan onder `docs/design/`.

## Gebruik

- Werk aan 1 fase tegelijk.
- Open altijd eerst deze korte fase-index en daarna `docs/design/phase-plan/current-phase.md`.
- Voor content geldt `README/GameBibleNode.json` als leidende Game Bible.
- Pas een fase pas naar klaar aan als alle blokkerende input, Codex-taken en checks voor die fase zijn afgerond.

## Laatste afgeronde fase

Fase 1 is klaar voor Fase 2.

## Belangrijke gates voor latere fases

- Assetpad is bevestigd: `/var/www/gk/assets`.
- `GK_ASSET_SOURCE_DIR="/var/www/gk/assets"` is bevestigd.
- GLB: 4.
- UI images: 0.
- Audio: 0.
- Repo-assets zijn exact aanwezig op server.
- `Blacksmit forge.glb` bevat een spatie; Fase 7 moet dit in de asset pipeline valideren.
- GLB-assets hebben nog geen definitieve runtime-role mapping.
- UI/audio assets moeten later worden toegevoegd of gekozen via asset library en nodes.

## Fasebeoordeling

Fase 1 is klaar voor Fase 2. Latere fases moeten de open asset/content-gates blijven respecteren.
