# Current Phase

## Fase

Actieve fase: Fase 2 - Serverfundering onder `/var/www/gk`.

## Status

Fase-status: Fase 2 Git-basis voorbereid; Codex serveractivatie open.

Fase 2 is niet volledig server-klaar zolang domein/subpad niet is bevestigd en Codex de server-side activatie en checks nog niet heeft uitgevoerd.

## Doel

Fase 2 bereidt de single-server omgeving voor met blijvende repo-onderdelen voor:

- `/var/www/gk`;
- assets;
- data;
- releases;
- buiten-Git secrets;
- logs;
- MySQL;
- Redis;
- Nginx;
- systemd;
- serverchecks.

GK Code Copiloot levert alleen scripts, templates, docs en checks in Git. Codex voert OS-, database-, service-, secret- en runtimewerk buiten Git uit.

## Bronnen gecontroleerd

Geopend of gecontroleerd voor deze fase:

- `README/current-phase.md`
- `docs/design/phase-plan/current-phase.md`
- `docs/design/content-gates.md`
- `docs/design/game-bible.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `README/fase2.md`
- `README/GameBibleNode.json`
- root `package.json` pad
- beoogde ops-paden onder `docs/ops/` en `ops/`

## Fase 1-contracten die blijven gelden

- `README/GameBibleNode.json` is de leidende Game Bible.
- Concrete gamecontent mag alleen uit GameBible JSON, editor/node-data, registers, database of expliciete Kevin-input komen.
- Geen concrete gamecontent in runtimecode.
- Hoofdketen: `Database > Editor/Node-system > Publish > Runtime Game`.
- Runtimecode bevat alleen engine-capabilities.
- Assetpad is bevestigd: `/var/www/gk/assets`.
- `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` is bevestigd.
- GLB=4, UI images=0, audio=0.
- GLB-assets hebben nog geen definitieve runtime-role mapping.
- UI/audio blijven latere asset/content gates.

## Wat is aangemaakt of bijgewerkt

- `docs/ops/server-layout.md`
- `ops/scripts/create-runtime-dirs`
- `ops/scripts/check-host`
- `ops/scripts/check-assets`
- `ops/env/gk.example.env`
- `ops/nginx/gk.conf.template`
- `ops/systemd/gk-api.service.template`
- `ops/systemd/gk-realtime.service.template`
- `ops/systemd/gk-worker.service.template`
- `docs/design/phase-plan/current-phase.md`
- `README/current-phase.md`

## Ops-bestanden en bedoeling

| Bestand | Doel |
|---|---|
| `ops/scripts/create-runtime-dirs` | Maakt idempotent de `/var/www/gk` runtime directories aan zonder assets of secrets te genereren. |
| `ops/scripts/check-host` | Controleert servervoorbereiding, vereiste directories, tooling en open domein/subpad-env. |
| `ops/scripts/check-assets` | Controleert `GK_ASSET_SOURCE_DIR`, verwacht GLB=4, UI=0, audio=0 en waarschuwt over assetnamen met spaties. |
| `ops/env/gk.example.env` | Veilige env-template met placeholders; echte waarden blijven buiten Git. |
| `ops/nginx/gk.conf.template` | Nginx-template met placeholders en deny-regels voor secrets/data/logs/tmp/cache. |
| `ops/systemd/*.service.template` | Service-templates met buiten-Git `EnvironmentFile=/etc/gk/gk.env`. |
| `docs/ops/server-layout.md` | Blijvend serverlayout- en activatiecontract. |

## Open Kevin-input

Nog te bevestigen voor volledige serveractivatie:

- `GAME_PUBLIC_PATH`
- `EDITOR_PUBLIC_PATH`
- `GAME_DOMAIN`
- `EDITOR_DOMAIN`

Deze input blokkeert de Git-basis niet, omdat templates veilige placeholders gebruiken. Ze blokkeert wel volledige serveractivatie.

## Open Codex-taken buiten Git

Codex moet buiten Git uitvoeren:

1. `/var/www/gk` en runtime directories aanmaken of bevestigen met `ops/scripts/create-runtime-dirs`.
2. Users, groups, ownership en rechten instellen.
3. `/etc/gk/gk.env` of afgesproken buiten-Git secretlocatie aanmaken.
4. Echte MySQL database/user/secrets maken.
5. Redis installeren of bevestigen.
6. Nginx-template renderen met Kevin-bevestigde domeinen/subpaden en `nginx -t` draaien.
7. systemd templates renderen/installeren, `daemon-reload` draaien en services pas starten wanneer runtime/build beschikbaar is.
8. `ops/scripts/check-host` op de server draaien.
9. `ops/scripts/check-assets` op de server draaien.
10. Build, migraties en runtime checks uitvoeren zodra tooling bestaat.

## Checks

Uit te voeren voor commit:

- Repo-structuur gecontroleerd via GitHub connector en lokale werkset.
- Bevestigen dat `package.json` op rootpad ontbreekt.
- `bash -n` op alle shell scripts.
- `shellcheck` indien beschikbaar.
- Secret/content scan op nieuwe ops/docs-bestanden.
- Git diff of equivalente lokale diff controleren.

Niet volledig uitvoerbaar in deze omgeving:

- `build`: geen root `package.json` of buildtooling zichtbaar.
- `typecheck`: geen TypeScript/package tooling zichtbaar.
- `tests`: geen testconfig of package script zichtbaar.
- `lint`: geen lintconfig of package script zichtbaar.
- Serverchecks: moeten door Codex op de server worden uitgevoerd.

## Fasebeoordeling

Fase 2 is Git-basis voorbereid.

Niet markeren als volledig server-klaar totdat:

- Codex serveractivatie heeft uitgevoerd;
- domein/subpad door Kevin is bevestigd of expliciet niet-blokkerend is gemaakt;
- `create-runtime-dirs`, `check-host` en `check-assets` op de server zijn gedraaid;
- Nginx en systemd server-side zijn gevalideerd;
- echte secrets buiten Git zijn geplaatst;
- beschikbare build/migratie/runtime checks zijn uitgevoerd zodra tooling bestaat.

Fase 3 mag pas starten als Kevin accepteert dat Fase 2 nog serveractivatie-gates open heeft, of nadat Codex deze gates sluit.
