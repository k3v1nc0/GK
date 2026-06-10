# Current Phase

## Fase

Actieve fase: Fase 2 - Serverfundering onder `/var/www/gk`.

## Status

Fase-status: Fase 2 serverfundering grotendeels uitgevoerd; Apache blijft voorlopig hoofdwebserver; runtime, endpoint-env-update en service-activatie open.

Fase 2 is niet volledig server-klaar zolang `/etc/gk/gk.env` nog endpoint-placeholders kan bevatten, Apache vhost/reverse proxy nog niet server-side veilig is getest, `/var/www/gk/current` leeg is en er geen echte runtime/build/systemd service actief is.

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

## Bevestigde endpoints

Kevin heeft bevestigd:

| Endpoint | Waarde |
|---|---|
| Game | `https://gk-k3v1nc0.duckdns.org/` |
| Editor | `https://gk-k3v1nc0.duckdns.org/editor` |

Voor env en templates is dit genormaliseerd naar:

| Env | Waarde |
|---|---|
| `GAME_DOMAIN` | `gk-k3v1nc0.duckdns.org` |
| `GAME_PUBLIC_PATH` | `/` |
| `EDITOR_DOMAIN` | `gk-k3v1nc0.duckdns.org` |
| `EDITOR_PUBLIC_PATH` | `/editor` |

Open Codex-taak: `/etc/gk/gk.env` buiten Git bijwerken met deze waarden, omdat de eerdere serverrun nog placeholderwaarden meldde.

## Wat is aangemaakt of bijgewerkt

- `docs/ops/server-layout.md`
- `ops/scripts/create-runtime-dirs`
- `ops/scripts/check-host`
- `ops/scripts/check-assets`
- `ops/env/gk.example.env`
- `ops/apache/gk-vhost.conf.template`
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
| `ops/apache/gk-vhost.conf.template` | Apache vhost/reverse proxy template voor de voorlopige actieve webserver. |
| `ops/nginx/gk.conf.template` | Nginx candidate-template voor een aparte latere migratiefase; niet live activeren in Fase 2. |
| `ops/systemd/*.service.template` | Service-templates met buiten-Git `EnvironmentFile=/etc/gk/gk.env`. |
| `docs/ops/server-layout.md` | Blijvend serverlayout- en activatiecontract. |

## Webserver policy

Kevin heeft bevestigd:

- De server draait meerdere bestaande sites.
- Apache blijft voorlopig de actieve hoofdwebserver.
- GK moet voorlopig via Apache vhost/reverse proxy worden voorbereid.
- Nginx blijft alleen candidate/template.
- Nginx mag niet live worden geactiveerd op poort 80/443.
- Een volledige migratie naar Nginx vereist een aparte migratiefase.

## Codex serverresultaat

Codex heeft buiten Git gemeld:

- `/var/www/gk`, `/var/www/gk/assets` en runtime directories bestaan.
- `/etc/gk/gk.env` bestaat buiten Git als `root:gk` `0640`.
- `/etc/gk/nginx/*`, `/etc/gk/systemd-verify/*` en `/etc/apache2/conf-available/gk-hardening.conf` zijn buiten Git aangemaakt.
- `ops/scripts/create-runtime-dirs`: OK.
- `ops/scripts/check-host`: OK met 0 warnings, maar domein/env stonden toen technisch nog als placeholders.
- `ops/scripts/check-assets`: OK met 1 warning voor `Blacksmit forge.glb` met spatie.
- MySQL actief/enabled; database `gk` en user `gk_app@127.0.0.1` aangemaakt/gecontroleerd.
- Redis geinstalleerd, actief/enabled; `redis-cli ping` gaf `PONG`.
- Nginx geinstalleerd; candidate config gevalideerd met `nginx -t`, maar bewust inactive/disabled omdat Apache poort 80 gebruikt.
- Apache-hardening is geactiveerd en configtest/reload zijn uitgevoerd.
- systemd templates zijn gevalideerd met `systemd-analyze verify`, maar geen `gk-*.service` units geinstalleerd of gestart.
- Server Git-status bleef schoon.

## Open Kevin-input

Geen blokkerende Fase 2 endpoint-input meer open.

Geen blokkerende Fase 2 webserverkeuze meer open: Apache blijft voorlopig leidend. Nginx-migratie is expliciet uitgesteld naar een aparte migratiefase.

## Open Codex-taken buiten Git

Codex moet buiten Git nog uitvoeren:

1. `/etc/gk/gk.env` endpointvelden vervangen door de nu bevestigde waarden.
2. `ops/scripts/check-host` opnieuw draaien; het script detecteert nu placeholderwaarden.
3. Apache vhost/reverse proxy renderen uit `ops/apache/gk-vhost.conf.template`.
4. Apache-config veilig testen en bevestigen dat bestaande sites niet breken.
5. `/var/www/gk/current` vullen zodra runtime/build bestaat.
6. Definitieve `gk-*.service` units renderen/installeren/starten wanneer echte `ExecStart` beschikbaar is.
7. Build, migraties en runtime checks uitvoeren zodra tooling bestaat.

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

Serverfundering is ook grotendeels uitgevoerd door Codex:

- directories/users/rechten;
- buiten-Git env/secrets;
- MySQL;
- Redis;
- Nginx candidate-validatie;
- Apache-hardening;
- systemd template-validatie;
- host/assets checks.

Niet markeren als volledig server-klaar totdat:

- endpointwaarden in `/etc/gk/gk.env` zijn bijgewerkt en opnieuw gecheckt;
- Apache vhost/reverse proxy veilig is getest en server-side bevestigd;
- Nginx niet live is geactiveerd op poort 80/443 in Fase 2;
- `/var/www/gk/current` een echte runtime/build bevat;
- systemd services definitief zijn geinstalleerd/gestart wanneer `ExecStart` bestaat;
- beschikbare build/migratie/runtime checks zijn uitgevoerd zodra tooling bestaat.

Fase 3 mag pas starten als Kevin accepteert dat Fase 2 nog runtime/Apache/service-gates open heeft, of nadat Codex deze gates sluit.
