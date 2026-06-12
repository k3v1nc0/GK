# Server Layout - Fase 2

## Status

Fase 2 serverfundering grotendeels uitgevoerd. Apache blijft voorlopig hoofdwebserver, Nginx blijft inactive/candidate, en de Fase 5.3 API/editor login plus GameBible browser-save flow zijn server-side gevalideerd. Fase 7 asset library, scanner, editor API, editor panels, database migration en runtime smoke zijn server-side gevalideerd door Claude op HEAD `0b4a0472870e4aa0fa09877a183aa1efa975340d` (`fase 7 - Claude`).

Dit document beschrijft de single-server fundering voor de nieuwe game onder `/var/www/gk`. Het is een blijvend ops-contract voor scripts, templates en serverchecks. Het claimt alleen serverstatus wanneer die expliciet server-side is gevalideerd.

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

Fase 5.2 rooktests gebruiken deze bevestigde endpointlijn via Apache en de API/editor services.

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

Fase 7 server-smoke heeft `/var/www/gk/assets` via `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` gevalideerd:

| Type | Aantal | Gate |
|---|---:|---|
| GLB | 4 | Feitelijk aanwezig, alleen kandidaat role mapping |
| UI images | 0 | Geldige lege library; geen dummy UI |
| Audio | 0 | Geldige lege library; Audio Panel gated/leeg |

Aanwezige GLB-bestanden:

- `Blacksmit forge.glb`
- `Blacksmit.glb`
- `Taverne.glb`
- `Wizard.glb`

Fase 7 bevestigd:

- `Blacksmit forge.glb` bevat een spatie en werkt in scanner/library.
- Alle 4 GLB records hebben `roleMapping.status=candidate`.
- GLB-bestanden krijgen geen definitieve runtime-role door de scanner.
- `assetsCopiedToGit=false`.
- `assignsDefinitiveRuntimeRoles=false`.
- `publishesRuntimeOutput=false`.
- UI/audio count 0 is geldig en veroorzaakt geen dummy assets.

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

Fase 5.2-status: GK-services en checks gebruiken structureel Node 22 onder `/opt/gk/node-v22`. `/usr/bin/node` bleef bewust serverbreed ongemoeid op `v18.19.1`; dit is geen GK-blocker.

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

Fase 5.2 voegt toe:

- `/auth/` proxyt naar de API runtime;
- `/editor/game-users` proxyt naar de API runtime;
- `/editor/game-bible-node/save` proxyt naar de API runtime;
- `/editor/game-bible-node/save-client.js` proxyt naar de API runtime en levert de browser-save bridge;
- `/editor/` proxyt naar de editor-web runtime;
- exact `/README/GameBibleNode.html`, `/README/GameBibleNode.json` en `/README/GameBibleNode.php` mogen bereikbaar blijven;
- andere `README`-paden blijven dicht.

Fase 7 voegt toe:

- `/editor/assets/library` proxyt naar de API runtime en blijft editor-only;
- `/editor/assets/scan` proxyt naar de API runtime en blijft editor-only plus CSRF/Origin beschermd;
- anonymous en game sessions krijgen geen editor asset beheer;
- asset scan uploadt niets, maakt geen assets aan, kopieert niets naar Git en publiceert niets naar Runtime Game.

GameBibleNode save-policy:

- publieke GET op HTML/JSON blijft toegestaan;
- schrijven naar `GameBibleNode.json` mag niet publiek of onbeschermd;
- voorkeursroute is `POST /editor/game-bible-node/save` met editor-auth en `editor_admin`;
- `GameBibleNode.html` krijgt de API-save client via Apache `substitute_module` of een gelijkwaardige server-side HTML patch;
- browser-save moet naar de API-route posten met Origin/CSRF, niet naar een publieke PHP-write;
- legacy `GameBibleNode.php` is gedepricieerd voor normale browser-saves en mag alleen tijdelijk schrijven met buiten-Git serverbescherming, zoals Basic Auth, IP allowlist of een buiten-Git token;
- Codex moet bevestigen dat POST zonder server-side auth faalt.

Fase 5.3 voegt toe:

- `/auth/editor/login`, `/auth/editor/logout` en `/auth/editor/me` zijn echte API-routes op dezelfde `/auth/` proxy;
- de browser krijgt een editor session cookie en CSRF-cookie na succesvolle login;
- GameBibleNode browser-save gebruikt dezelfde editor session;
- Apache moet publieke `X-GK-Smoke-Scope` en `X-GK-Smoke-Editor-Roles` headers strippen voordat requests de API bereiken.

Codex-resultaat:

- Nginx is geinstalleerd als candidate-tooling.
- Candidate config uit template staat buiten Git op `/etc/gk/nginx/gk.conf.candidate`.
- `nginx -t -c /etc/gk/nginx/nginx-test.conf` was succesvol voor de candidate.
- Nginx is bewust inactive/disabled omdat Apache al op poort 80 actief is.
- Apache-hardening is buiten Git toegevoegd via `/etc/apache2/conf-available/gk-hardening.conf`.
- `a2enconf gk-hardening`, `apache2ctl configtest` en `systemctl reload apache2` zijn uitgevoerd.
- Apache serveert momenteel de GK-vhost en hardent `.git`, data, logs, tmp, shared en vergelijkbare paden naar 403.

Fase 5.2 Codex-resultaat:

- Apache blijft hoofdwebserver.
- Nginx blijft inactive/candidate.
- `apache2ctl configtest`: `Syntax OK`.
- bestaande sites bleven OK.
- `/editor`: OK.
- `/auth/editor/me`: `401` zonder sessie.
- `/editor/game-users`: `403` zonder `editor_admin`.
- `/README/GameBibleNode.html`: `200`.
- `/README/GameBibleNode.json`: `200`.
- `/README/GameBibleNode.php` is bereikbaar maar geen open write.
- andere README-bestanden blijven `403`.
- publieke POST naar legacy PHP faalt.
- publieke POST naar save API faalt.
- public smoke headers via Apache worden gestript.
- browser-save post naar `/editor/game-bible-node/save`, niet meer naar `GameBibleNode.php`.

Nginx blijft candidate-only tot een aparte migratiefase.

## systemd policy

De templates onder `ops/systemd/` gebruiken:

- `EnvironmentFile=/etc/gk/gk.env`;
- `WorkingDirectory=/var/www/gk/current`;
- concrete Fase 5.2 serviceprocessen voor API en editor-web;
- generieke serviceprocessen voor realtime en worker;
- een veilige restart-policy.

`gk-api.service.template` start `apps/api-server/dist/index.js` en `gk-editor-web.service.template` start `apps/editor-web/dist/index.js`.

Codex-resultaat:

- Node 22 is structureel geinstalleerd op `/opt/gk/node-v22`.
- `/opt/gk/node-v22/bin/node -v`: `v22.22.3`.
- `/opt/gk/node-v22/bin/corepack --version`: `0.34.6`.
- `pnpm` via Node 22: `10.12.4`.
- `gk-api` is active/enabled en draait via `/opt/gk/node-v22/bin/node`.
- `gk-editor-web` is active/enabled en draait via `/opt/gk/node-v22/bin/node`.
- API health: OK.
- editor-web health: OK.
- `pnpm install`: OK.
- `pnpm build`: OK.
- `pnpm typecheck`: OK.
- `pnpm test`: OK, 31/31 tests groen.
- `pnpm lint`: OK.

Realtime gateway, workers, publish-services en latere game runtime krijgen eigen fasegates voordat ze als permanent actief mogen worden gemarkeerd.

Fase 5.3 server-smoke:

- set-cookie TypeScript build-fix aanwezig in `apps/api-server/src/http-server.ts`;
- password-verifier ondersteunt beide scrypt formats;
- `pnpm install/build/typecheck/test/lint`: OK;
- `pnpm test`: OK, 35/35;
- services actief via `/opt/gk/node-v22/bin/node`;
- `/editor` toont login zonder sessie;
- editor admin login werkt;
- `/auth/editor/me` geeft authenticated true met `editor_admin`;
- GameBible save via `/editor/game-bible-node/save` werkt;
- backup en audit werken;
- logout werkt;
- save na logout faalt;
- publieke save en legacy PHP write blijven dicht;
- bestaande game-site blijft bereikbaar.

Fase 7 server-smoke:

- HEAD server-check: `0b4a0472870e4aa0fa09877a183aa1efa975340d` (`fase 7 - Claude`).
- `pnpm install`: OK.
- `pnpm build`: OK.
- `pnpm typecheck`: OK.
- `pnpm test`: OK, 53/53 pass.
- `pnpm lint`: OK.
- `db/migrations/0003_asset_library_register.sql` toegepast.
- `asset_library_records` bestaat.
- `asset_library_scan_runs` bestaat.
- GLB count = 4.
- UI count = 0.
- Audio count = 0.
- `Blacksmit forge.glb` met spatie werkt.
- `publishesRuntimeOutput=false`.
- `assetsCopiedToGit=false`.
- `assignsDefinitiveRuntimeRoles=false`.
- Alle 4 GLB records hebben `roleMapping.status=candidate`.
- `gk-api` active/enabled via `/opt/gk/node-v22/bin/node`.
- `gk-editor-web` active/enabled via `/opt/gk/node-v22/bin/node`.
- `/editor` werkt.
- Editor admin login werkt.
- `/auth/editor/me` geeft `editor_admin`.
- `GET /editor/assets/library` werkt.
- `POST /editor/assets/scan` werkt met editor session en CSRF.
- Anonymous krijgt geen asset beheer.
- Game session krijgt geen asset beheer.
- Asset Panel aanwezig.
- Audio Panel aanwezig en gated/leeg bij audio=0.
- GameBible save blijft werken.
- Game site blijft bereikbaar.
- DB CHECK constraint blokkeert `publishes_runtime_output=1`.
- Blockers: geen.

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

Codex-resultaat:

- MySQL is actief/enabled.
- `mysqladmin ping` gaf `mysqld is alive`.
- Database `gk` en user `gk_app@127.0.0.1` zijn aangemaakt/gecontroleerd.
- Redis is geinstalleerd, actief/enabled.
- `redis-cli ping` gaf `PONG`.
- Fase 7 migratie `db/migrations/0003_asset_library_register.sql` is toegepast.
- Fase 7 tabellen `asset_library_records` en `asset_library_scan_runs` bestaan.
- Fase 7 DB CHECK constraint blokkeert `publishes_runtime_output=1`.

## Codex-taken buiten Git

Afgerond door Codex/Claude:

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
11. Fase 7 install/build/typecheck/test/lint server-side groen bevestigd.
12. Fase 7 MySQL migratie toegepast en tabellen bevestigd.
13. Fase 7 echte scan op `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` bevestigd.
14. Fase 7 editor-only asset read/scan routes getest.
15. Fase 7 anonymous/game-denial getest.
16. Fase 7 watcher/polling smoke bevestigd zonder permanente daemon vanuit Git.
17. Fase 7 runtime-publish en Git-copy gates bevestigd.

Nog open voor Codex:

1. Toekomstige game runtime, realtime gateway, workers en publish-services pas installeren/starten wanneer hun fase en echte build-output bestaan.
2. Nginx niet live activeren zonder aparte migratiefase.
3. `/usr/bin/node` blijft serverbreed `v18.19.1`; geen actie nodig voor GK zolang GK via `/opt/gk/node-v22` draait.
4. Fase 8 pas voorbereiden of implementeren wanneer Kevin die fase opent.

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

Huidige status: Fase 2 serverfundering grotendeels uitgevoerd; Apache hoofdwebserver bevestigd; Nginx inactive/candidate; Fase 5.2/Fase 5.3 API/editor services actief en gevalideerd; Fase 7 asset library server-side gevalideerd en klaar. Toekomstige services blijven fasegebonden gates.
