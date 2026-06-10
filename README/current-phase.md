# Current Phase

Actieve fase: `fase2.md`

Status: Fase 2 Git-basis voorbereid; Codex serveractivatie open.

## Primaire Fase 2-status

Open voor de actuele Fase 2-contractstatus:

- `docs/design/phase-plan/current-phase.md`
- `docs/ops/server-layout.md`
- `README/fase2.md`
- `docs/design/content-gates.md`
- `docs/design/game-bible.md`
- `README/GameBibleNode.json`

Dit README-fasebestand blijft de korte fase-index. De inhoudelijke serverlayout en poortwachterdocumenten staan onder `docs/`.

## Gebruik

- Werk aan 1 fase tegelijk.
- Open altijd eerst deze korte fase-index en daarna `docs/design/phase-plan/current-phase.md`.
- Voor content geldt `README/GameBibleNode.json` als leidende Game Bible.
- Concrete gamecontent loopt via `Database > Editor/Node-system > Publish > Runtime Game`, niet via runtime-hardcoding.
- Pas een fase pas naar klaar aan als alle blokkerende input, Codex-taken en checks voor die fase zijn afgerond.

## Laatste afgeronde fase

Fase 1 is klaar voor Fase 2.

## Fase 2 Git-basis

Aangemaakt of bijgewerkt voor Fase 2:

- `docs/ops/server-layout.md`
- `ops/scripts/create-runtime-dirs`
- `ops/scripts/check-host`
- `ops/scripts/check-assets`
- `ops/env/gk.example.env`
- `ops/nginx/gk.conf.template`
- `ops/systemd/gk-api.service.template`
- `ops/systemd/gk-realtime.service.template`
- `ops/systemd/gk-worker.service.template`

## Bevestigde server- en assetfeiten

- Basisserverpad: `/var/www/gk`.
- Assetpad: `/var/www/gk/assets`.
- `GK_ASSET_SOURCE_DIR=/var/www/gk/assets`.
- GLB: 4.
- UI images: 0.
- Audio: 0.
- Geen submappen onder assets.
- Repo/server assets matchen exact.
- `Blacksmit forge.glb` bevat een spatie; Fase 7 moet dit in de asset pipeline valideren.
- GLB-assets hebben nog geen definitieve runtime-role mapping.
- UI/audio assets moeten later worden toegevoegd of gekozen via asset library en nodes.

## Open Kevin-input

Nog te bevestigen voor volledige serveractivatie:

- `GAME_PUBLIC_PATH`
- `EDITOR_PUBLIC_PATH`
- `GAME_DOMAIN`
- `EDITOR_DOMAIN`

## Open Codex-taken buiten Git

Codex moet nog server-side uitvoeren:

- `/var/www/gk` runtime directories aanmaken of bevestigen.
- OS users, groups, ownership en rechten zetten.
- `/etc/gk/gk.env` of afgesproken buiten-Git secretlocatie maken.
- MySQL database/user/secrets buiten Git maken.
- Redis installeren of bevestigen.
- Nginx-template renderen, activeren en `nginx -t` draaien.
- systemd templates renderen, installeren en valideren.
- `ops/scripts/create-runtime-dirs`, `ops/scripts/check-host` en `ops/scripts/check-assets` op de server draaien.
- Build, migraties en runtime checks uitvoeren zodra tooling bestaat.

## Fasebeoordeling

Fase 2 is niet volledig server-klaar.

Huidige status: Git-basis voorbereid. Volledige serveractivatie blijft open totdat Kevin domein/subpad bevestigt en Codex de server-side taken en checks heeft uitgevoerd.
