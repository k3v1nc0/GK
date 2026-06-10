# Current Phase

Actieve fase: `fase2.md`

Status: Fase 2 serverfundering grotendeels uitgevoerd; runtime, endpoint-env-update en definitieve webserver/service-activatie open.

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
- Game endpoint: `https://gk-k3v1nc0.duckdns.org/`.
- Editor endpoint: `https://gk-k3v1nc0.duckdns.org/editor`.

## Open Kevin-input

Geen blokkerende Fase 2 endpoint-input meer open.

Nog te kiezen voordat volledige webserveractivatie kan afronden:

- Apache actief laten en Nginx later migreren;
- of Apache/Nginx rolverdeling wijzigen zodat Nginx definitief kan activeren.

## Open Codex-taken buiten Git

Codex heeft server-side uitgevoerd:

- `/var/www/gk` runtime directories aanmaken of bevestigen.
- OS users, groups, ownership en rechten zetten.
- `/etc/gk/gk.env` of afgesproken buiten-Git secretlocatie maken.
- MySQL database/user/secrets buiten Git maken.
- Redis installeren of bevestigen.
- Nginx candidate config renderen en `nginx -t` draaien.
- Apache-hardening activeren en herladen.
- systemd templates renderen en valideren.
- `ops/scripts/create-runtime-dirs`, `ops/scripts/check-host` en `ops/scripts/check-assets` op de server draaien.

Codex moet nog server-side uitvoeren:

- `/etc/gk/gk.env` endpointvelden vervangen door de nu bevestigde waarden.
- `ops/scripts/check-host` opnieuw draaien met placeholderdetectie.
- Apache/Nginx migratiekeuze uitvoeren.
- `/var/www/gk/current` vullen zodra runtime/build bestaat.
- Definitieve `gk-*.service` units installeren/starten wanneer echte `ExecStart` beschikbaar is.
- Build, migraties en runtime checks uitvoeren zodra tooling bestaat.

## Fasebeoordeling

Fase 2 is niet volledig server-klaar.

Huidige status: serverfundering grotendeels uitgevoerd. Volledige serveractivatie blijft open totdat endpoint-env is bijgewerkt, de Apache/Nginx keuze is afgerond, `/var/www/gk/current` een echte runtime/build bevat en de definitieve services/runtimechecks bestaan.
