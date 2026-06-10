# Server Layout - Fase 2

## Status

Fase 2 Git-basis voorbereid; Codex serveractivatie open.

Dit document beschrijft de single-server fundering voor de nieuwe game onder `/var/www/gk`. Het is een blijvend ops-contract voor scripts, templates en serverchecks. Het claimt geen actieve serverstatus.

## Hoofdregels

- GK Code Copiloot beheert in Git alleen blijvende scripts, templates, docs en checks.
- Codex voert serverwerk buiten Git uit: OS, users, rechten, MySQL, Redis, Nginx, systemd, secrets, builds, runtime checks en lokale scans.
- Echte secrets, credentials, tokens, private keys en serverwaarden mogen niet in Git.
- Concrete gamecontent blijft buiten runtimecode en loopt via `Database > Editor/Node-system > Publish > Runtime Game`.
- Runtimecode mag alleen generieke engine-capabilities bevatten.

## Bevestigde paden

| Pad of env | Status | Opmerking |
|---|---|---|
| `/var/www/gk` | Bevestigd | Basis voor de eerste single-server omgeving. |
| `/var/www/gk/assets` | Bevestigd | Server assetbron. |
| `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` | Bevestigd | Door Codex buiten Git gezet of bevestigd. |

Nog te bevestigen door Kevin:

| Input | Veilige templatewaarde |
|---|---|
| `GAME_PUBLIC_PATH` | `__CONFIRM_WITH_KEVIN__` |
| `EDITOR_PUBLIC_PATH` | `__CONFIRM_WITH_KEVIN__` |
| `GAME_DOMAIN` | `__CONFIRM_WITH_KEVIN__` |
| `EDITOR_DOMAIN` | `__CONFIRM_WITH_KEVIN__` |

## Runtime directory layout

Voorgestelde basis onder `/var/www/gk`:

| Directory | Doel | Nginx publiek? |
|---|---|---|
| `/var/www/gk/assets` | Feitelijke assetbron voor asset library/scanner | Alleen via gecontroleerd assetpad |
| `/var/www/gk/releases` | Releasebuilds per deploy | Nee |
| `/var/www/gk/current` | Actieve release of werkdirectory voor systemd services | Nee |
| `/var/www/gk/shared` | Gedeelde runtimebestanden die niet in Git horen | Nee |
| `/var/www/gk/shared/config` | Niet-publieke serverconfig, zonder Git-secrets | Nee |
| `/var/www/gk/data` | Runtime data, uploads, database dumps of generated data indien later nodig | Nee |
| `/var/www/gk/logs` | Applicatie- en workerlogs | Nee |
| `/var/www/gk/tmp` | Tijdelijke runtimebestanden | Nee |
| `/var/www/gk/tmp/cache` | Cache | Nee |
| `/var/www/gk/tmp/run` | Runtime sockets/pids indien later nodig | Nee |

`ops/scripts/create-runtime-dirs` maakt deze directories idempotent aan met `/var/www/gk` als default. Het script maakt geen dummy assets en genereert geen secrets.

## Assetstatus

Codex heeft `/var/www/gk/assets` gecontroleerd:

| Type | Aantal | Gate |
|---|---:|---|
| GLB | 4 | Feitelijk aanwezig, nog geen definitieve runtime-role mapping |
| UI images | 0 | Latere asset-library/node gate |
| Audio | 0 | Latere asset-library/audio-node gate |

Aanwezige GLB-bestanden:

- `Blacksmit forge.glb`
- `Blacksmit.glb`
- `Taverne.glb`
- `Wizard.glb`

Er zijn geen submappen en geen dubbele bestandsnamen. `Blacksmit forge.glb` bevat een spatie; Fase 7 moet scanner, URLs, database records en node IDs daarop testen.

## Secrets en env

Echte serverwaarden horen buiten Git, bijvoorbeeld in:

- `/etc/gk/gk.env`
- een door Codex beheerde secret store of serverconfig

Git mag alleen veilige examples bevatten, zoals `ops/env/gk.example.env`.

Verplicht buiten Git te beheren:

- `DATABASE_URL`
- `REDIS_URL` wanneer Redis authenticatie of niet-default locatie nodig is
- `SESSION_SECRET`
- API keys, tokens en private keys
- echte domeinen en TLS-instellingen wanneer Kevin ze bevestigt

## Nginx serving policy

Nginx mag niet rechtstreeks serveren:

- env files of dotfiles;
- `/var/www/gk/data`;
- `/var/www/gk/logs`;
- `/var/www/gk/tmp`;
- `/var/www/gk/shared`;
- database dumps;
- release-interne bronbestanden tenzij een build expliciet als public directory is aangewezen.

Assets mogen alleen via een gecontroleerd publiek pad worden geserveerd dat naar `/var/www/gk/assets` wijst. De template `ops/nginx/gk.conf.template` gebruikt placeholders voor domein/subpad en moet server-side door Codex worden gerenderd en gevalideerd.

## systemd policy

De templates onder `ops/systemd/` gebruiken:

- `EnvironmentFile=/etc/gk/gk.env`;
- `WorkingDirectory=/var/www/gk/current`;
- generieke serviceprocessen voor API, realtime en worker;
- een veilige restart-policy.

Deze templates claimen niet dat services al bestaan of draaien. Codex moet de definitieve `ExecStart` server-side koppelen aan de echte runtime/build zodra tooling bestaat.

## MySQL en Redis

Geen credentials in Git.

Codex moet buiten Git:

- MySQL installeren of bevestigen;
- database en databasegebruiker maken;
- credentials opslaan buiten Git;
- migraties draaien wanneer repo-tooling bestaat;
- Redis lokaal of volgens Fase 2-serverkeuze installeren of bevestigen;
- `DATABASE_URL` en `REDIS_URL` in de buiten-Git env file zetten;
- runtime/build checks uitvoeren zodra services en tooling bestaan.

## Codex-taken buiten Git

Codex moet Fase 2 server-side uitvoeren:

1. `/var/www/gk` en runtime directories aanmaken of bevestigen met `ops/scripts/create-runtime-dirs`.
2. Rechten en ownership zetten voor de gekozen deploy/app user.
3. `/etc/gk/gk.env` of afgesproken secretlocatie aanmaken buiten Git.
4. MySQL database/user/secrets buiten Git maken.
5. Redis installeren of bevestigen.
6. Nginx-template renderen met Kevin-bevestigde domeinen/subpaden en `nginx -t` draaien.
7. systemd templates renderen, installeren, `daemon-reload` draaien en services pas starten wanneer runtime/build beschikbaar is.
8. `ops/scripts/check-host` en `ops/scripts/check-assets` op de server draaien.
9. Build, migraties en runtime checks draaien wanneer tooling bestaat.

## Fase 2-klaar criterium

Fase 2 is pas volledig server-klaar wanneer:

- scripts/templates/docs bestaan;
- beschikbare checks zijn uitgevoerd;
- Kevin domein/subpad heeft bevestigd of expliciet niet-blokkerend heeft gemaakt;
- Codex de server-side activatie heeft uitgevoerd;
- `create-runtime-dirs`, `check-host` en `check-assets` op de server zijn gedraaid;
- Nginx en systemd server-side zijn gevalideerd;
- secrets buiten Git staan.

Tot die tijd is de status: Fase 2 Git-basis voorbereid; Codex serveractivatie open.
