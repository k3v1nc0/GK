# Server Layout - Fase 2

## Status

Fase 2 serverfundering grotendeels uitgevoerd; Apache blijft voorlopig hoofdwebserver; runtime, endpoint-env-update en service-activatie open.

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

Door Kevin bevestigd op 2026-06-10:

| Input | Waarde |
|---|---|
| Game endpoint | `https://gk-k3v1nc0.duckdns.org/` |
| Editor endpoint | `https://gk-k3v1nc0.duckdns.org/editor` |
| `GAME_DOMAIN` | `gk-k3v1nc0.duckdns.org` |
| `GAME_PUBLIC_PATH` | `/` |
| `EDITOR_DOMAIN` | `gk-k3v1nc0.duckdns.org` |
| `EDITOR_PUBLIC_PATH` | `/editor` |

Let op: Codex meldde dat `/etc/gk/gk.env` tijdens de serverrun nog placeholderwaarden bevatte voor deze endpointvelden. Codex moet die buiten Git vervangen door bovenstaande bevestigde waarden en daarna `ops/scripts/check-host` opnieuw draaien.

## Webserver policy

Kevin heeft bevestigd:

- De server draait meerdere bestaande sites.
- Apache blijft voorlopig de actieve hoofdwebserver.
- GK wordt in Fase 2 via Apache vhost/reverse proxy voorbereid.
- Nginx mag alleen voorbereid blijven als candidate/template.
- Nginx mag niet live worden geactiveerd op poort 80/443.
- Er komt geen volledige migratie naar Nginx zonder aparte migratiefase.

Blijvende templates:

| Template | Status | Gebruik |
|---|---|---|
| `ops/apache/gk-vhost.conf.template` | Actieve Fase 2-richting | Server-side renderen, testen en pas daarna in Apache activeren. |
| `ops/nginx/gk.conf.template` | Candidate voor latere migratie | Alleen renderen/testen als candidate; niet live activeren in Fase 2. |

## Runtime directory layout

Codex heeft bevestigd dat deze basis bestaat onder `/var/www/gk`:

| Directory | Doel | Publiek via Apache? |
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

Codex-resultaat:

- `ops/scripts/create-runtime-dirs` draaide OK.
- Alle runtime directories zijn ready gemeld.
- Het script maakte geen secrets en geen assets.

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

Codex-resultaat:

- `/etc/gk/gk.env` bestaat buiten Git als `root:gk` met mode `0640`.
- De `gk` service-user kan de env-file lezen.
- Secretwaarden zijn niet geprint en niet in de repo gezet.
- MySQL secret staat alleen in `/etc/gk/gk.env`.

Open: endpointvelden in `/etc/gk/gk.env` moeten nog worden vervangen door de nu bevestigde waarden.

## Apache serving policy

Apache mag niet rechtstreeks serveren:

- env files of dotfiles;
- `/var/www/gk/data`;
- `/var/www/gk/logs`;
- `/var/www/gk/tmp`;
- `/var/www/gk/shared`;
- database dumps;
- release-interne bronbestanden tenzij een build expliciet als public directory is aangewezen.

Assets mogen alleen via een gecontroleerd publiek pad worden geserveerd dat naar `/var/www/gk/assets` wijst. De template `ops/apache/gk-vhost.conf.template` bereidt de bevestigde host en `/editor` route voor, maar moet server-side door Codex worden gerenderd, veilig getest en pas daarna geactiveerd.

Fase 5.1 voegt toe:

- `/auth/` proxyt naar de API runtime;
- `/editor/game-users` proxyt naar de API runtime;
- `/editor/game-bible-node/save` proxyt naar de API runtime;
- `/editor/` proxyt naar de editor-web runtime;
- exact `/README/GameBibleNode.html`, `/README/GameBibleNode.json` en `/README/GameBibleNode.php` mogen bereikbaar blijven;
- andere `README`-paden blijven dicht.

GameBibleNode save-policy:

- publieke GET op HTML/JSON blijft toegestaan;
- schrijven naar `GameBibleNode.json` mag niet publiek of onbeschermd;
- voorkeursroute is `POST /editor/game-bible-node/save` met editor-auth en `editor_admin`;
- legacy `GameBibleNode.php` mag alleen tijdelijk schrijven met buiten-Git serverbescherming, zoals Basic Auth, IP allowlist of een buiten-Git token;
- Codex moet bevestigen dat POST zonder server-side auth faalt.

Codex-resultaat:

- Nginx is geinstalleerd als candidate-tooling.
- Candidate config uit template staat buiten Git op `/etc/gk/nginx/gk.conf.candidate`.
- `nginx -t -c /etc/gk/nginx/nginx-test.conf` was succesvol voor de candidate.
- Nginx is bewust inactive/disabled omdat Apache al op poort 80 actief is.
- Apache-hardening is buiten Git toegevoegd via `/etc/apache2/conf-available/gk-hardening.conf`.
- `a2enconf gk-hardening`, `apache2ctl configtest` en `systemctl reload apache2` zijn uitgevoerd.
- Apache serveert momenteel de GK-vhost en hardent `.git`, data, logs, tmp, shared en vergelijkbare paden naar 403.

Open: Codex moet de Apache vhost/reverse proxy server-side renderen, met `apache2ctl configtest` testen, bestaande sites controleren en pas daarna veilig herladen. Nginx blijft candidate-only tot een aparte migratiefase.

## systemd policy

De templates onder `ops/systemd/` gebruiken:

- `EnvironmentFile=/etc/gk/gk.env`;
- `WorkingDirectory=/var/www/gk/current`;
- generieke serviceprocessen voor API, realtime en worker;
- een veilige restart-policy.

Deze templates claimen niet dat services al bestaan of draaien. Codex moet de definitieve `ExecStart` server-side koppelen aan de echte runtime/build zodra tooling bestaat.

Codex-resultaat:

- Templates zijn server-side gevalideerd via tijdelijke units onder `/etc/gk/systemd-verify`.
- `systemd-analyze verify` gaf exit 0 voor GK-units.
- Er zijn geen `gk-*.service` units geinstalleerd of gestart.

Open: `/var/www/gk/current` is nog leeg en er bestaat nog geen echte runtime/build/`ExecStart`.

## MySQL en Redis

Geen credentials in Git.

Codex moet buiten Git:

- MySQL installeren of bevestigen;
- database en databasegebruiker maken;
- credentials opslaan buiten Git;
- migraties draaien wanneer repo-tooling bestaat;
- Redis lokaal of volgens Fase 2-serverkeuze installeren of bevestigen;
- `DATABASE_URL` en `REDIS_URL` in de buiten-Git env file zetten;
- runtime/build checks uitvoeren zodra services en tooling bestaat.

Codex-resultaat:

- MySQL is actief/enabled.
- `mysqladmin ping` gaf `mysqld is alive`.
- Database `gk` en user `gk_app@127.0.0.1` zijn aangemaakt/gecontroleerd.
- Redis is geinstalleerd, actief/enabled.
- `redis-cli ping` gaf `PONG`.

## Codex-taken buiten Git

Afgerond door Codex:

1. `/var/www/gk` runtime directories aangemaakt of bevestigd.
2. `gk` group/user aangemaakt.
3. Ownership en rechten op runtimepaden gezet.
4. `/etc/gk/gk.env` buiten Git aangemaakt.
5. MySQL geinstalleerd/bevestigd, database/user/secrets buiten Git gemaakt.
6. Redis geinstalleerd/bevestigd.
7. Nginx candidate config buiten Git gegenereerd en gevalideerd, maar niet live geactiveerd.
8. Apache-hardening buiten Git toegevoegd en Apache configuratie gevalideerd/herladen.
9. systemd templates buiten Git gevalideerd.
10. `ops/scripts/create-runtime-dirs`, `ops/scripts/check-host` en `ops/scripts/check-assets` server-side gedraaid.

Nog open voor Codex:

1. `/etc/gk/gk.env` endpointvelden bijwerken met de bevestigde Kevin-waarden.
2. `ops/scripts/check-host` opnieuw draaien met placeholderdetectie.
3. Apache vhost/reverse proxy renderen uit `ops/apache/gk-vhost.conf.template`.
4. Apache-config veilig testen en bevestigen dat bestaande sites niet breken.
5. `/var/www/gk/current` vullen zodra runtime/build bestaat.
6. Definitieve `gk-*.service` units renderen/installeren/starten wanneer echte `ExecStart` beschikbaar is.
7. Build, migraties en runtime checks draaien wanneer tooling bestaat.

## Fase 2-klaar criterium

Fase 2 is pas volledig server-klaar wanneer:

- scripts/templates/docs bestaan;
- beschikbare checks zijn uitgevoerd;
- Kevin domein/subpad heeft bevestigd;
- Codex de endpointwaarden buiten Git heeft bijgewerkt;
- Codex de Apache vhost/reverse proxy veilig heeft getest en server-side bevestigd;
- Nginx niet live is geactiveerd op 80/443 in Fase 2;
- `create-runtime-dirs`, `check-host` en `check-assets` op de server zijn gedraaid;
- systemd server-side is gevalideerd en waar relevant actief;
- secrets buiten Git staan.

Huidige status: Fase 2 serverfundering grotendeels uitgevoerd; Apache frontend voorbereiding, runtime, endpoint-env-update en service-activatie open.
