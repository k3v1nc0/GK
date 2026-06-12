# Server Layout - Fase 2

## Status

Fase 2 serverfundering grotendeels uitgevoerd. Apache blijft voorlopig hoofdwebserver, Nginx blijft inactive/candidate, en de Fase 5.3 API/editor login plus GameBible browser-save flow zijn server-side gevalideerd.

Fase 7 asset library, scanner, editor API, editor panels, database migration en runtime smoke zijn server-side gevalideerd door Claude op HEAD `0b4a0472870e4aa0fa09877a183aa1efa975340d` (`fase 7 - Claude`).

Fase 8 entity/component core is server-side gevalideerd door Codex op HEAD `5b4872cfc1dbf737d31e78fb965e78af7aaf74d0` (`fase 8 fix codex`).

Fase 8.1 procedural generation core is server-side gevalideerd en klaar.

Dit document beschrijft de single-server fundering voor de nieuwe game onder `/var/www/gk`. Het is een blijvend ops-contract voor scripts, templates en serverchecks. Het claimt alleen serverstatus wanneer die expliciet server-side is gevalideerd.

## Hoofdregels

- GK Code Copiloot beheert in Git alleen blijvende scripts, templates, docs en checks.
- Codex voert serverwerk buiten Git uit: OS, users, rechten, MySQL, Redis, Nginx, systemd, secrets, builds, runtime checks en lokale scans.
- Echte secrets, credentials, tokens, private keys en serverwaarden mogen niet in Git.
- Concrete gamecontent blijft buiten runtimecode en loopt via `Database > Editor/Node-system > Publish > Runtime Game`.
- Runtimecode mag alleen generieke engine-capabilities bevatten.
- Procedural generation output blijft draft/preview/bake data totdat een latere publish-flow expliciet publiceert.

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

Fase 8 bevestigd:

- `Taverne.glb` object-test OK als Kevin-testkeuze, geen runtime hardcode.
- `Wizard.glb` NPC-test OK als Kevin-testkeuze, geen runtime hardcode.
- Missing animation mapping warning/blocker OK.
- Assets niet naar Git.
- Runtime publish nee bevestigd.

## Procedural generation status

Fase 8.1 server-side verificatie is afgerond:

- procedural contracts en validators;
- deterministic random utility;
- procedural node types;
- editor-only procedural API contracts;
- Procedural Generation Panel state;
- migratie `0005_procedural_generation_core.sql`;
- tests voor determinism, draft-only output, generated entity/asset/audio gates en editor-only access.

Bevestigd:

- `pnpm install/build/typecheck/test/lint`;
- migratie `0005_procedural_generation_core.sql` toegepast;
- procedural API/editor smoke;
- determinism smoke: zelfde seed + graph + inputs geeft dezelfde output;
- different-seed smoke: andere seed mag andere output geven;
- preview publiceert niets naar Runtime Game;
- bake maakt alleen editor draft data of bake draft result;
- geen assets naar Git;
- anonymous/game session krijgt geen procedural editor beheer.

Geen permanente daemon, watcher of runtime publish mag door Git-docs alleen worden verondersteld.

## Webserver policy

Kevin heeft bevestigd:

- De server draait meerdere bestaande sites.
- Apache blijft voorlopig de actieve hoofdwebserver.
- GK wordt in Fase 2 via Apache vhost/reverse proxy voorbereid.
- Nginx mag alleen voorbereid blijven als candidate/template.
- Nginx mag niet live worden geactiveerd op poort 80/443.
- Er komt geen volledige migratie naar Nginx zonder aparte migratiefase.

Apache mag niet rechtstreeks serveren:

- env files of dotfiles;
- `/var/www/gk/data`;
- `/var/www/gk/logs`;
- `/var/www/gk/tmp`;
- `/var/www/gk/shared`;
- database dumps;
- release-interne bronbestanden tenzij een build expliciet als public directory is aangewezen.

Assets mogen alleen via een gecontroleerd publiek pad worden geserveerd dat naar `/var/www/gk/assets` wijst. Procedural generated draft/bake data mag niet publiek worden geserveerd alsof het runtimecontent is; alleen een latere publishfase mag expliciet runtime projections publiceren.

Fase 8.1 voegt toe als API-contract:

- `/editor/procedural/graph`;
- `/editor/procedural/validate`;
- `/editor/procedural/preview`;
- `/editor/procedural/bake-draft`;
- `/editor/procedural/generated`;
- `/editor/procedural/issues`.

Deze routes blijven editor-only, CSRF/Origin beschermd waar state-changing, en no-runtime-publish. Server-side Apache/API smoke is bevestigd.

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

## systemd policy

De templates onder `ops/systemd/` gebruiken:

- `EnvironmentFile=/etc/gk/gk.env`;
- `WorkingDirectory=/var/www/gk/current`;
- concrete Fase 5.2 serviceprocessen voor API en editor-web;
- generieke serviceprocessen voor realtime en worker;
- een veilige restart-policy.

Realtime gateway, workers, publish-services en latere game runtime krijgen eigen fasegates voordat ze als permanent actief mogen worden gemarkeerd.

## Server-smokes

### Fase 7

- HEAD server-check: `0b4a0472870e4aa0fa09877a183aa1efa975340d` (`fase 7 - Claude`).
- `pnpm install/build/typecheck/test/lint`: OK.
- `pnpm test`: OK, 53/53 pass.
- Migratie `0003_asset_library_register.sql`: OK.
- Asset routes, panels, anonymous/game denial en runtime gates: OK.

### Fase 8

- HEAD server-check: `5b4872cfc1dbf737d31e78fb965e78af7aaf74d0` (`fase 8 fix codex`).
- `pnpm install/build/typecheck/test/lint`: OK.
- Migratie `0004_entity_component_core.sql`: OK.
- Entity routes, anonymous/game denial, Taverne/Wizard checks en runtime gates: OK.
- `gk-api` en `gk-editor-web` zijn herstart om huidige build live te laden.

### Fase 8.1

- `pnpm install/build/typecheck/test/lint`: OK.
- migratie `0005_procedural_generation_core.sql`: OK.
- procedural routes en panel smoke: OK.
- determinism/different-seed smoke: OK.
- no runtime publish: OK.
- no asset copy to Git: OK.
- anonymous/game denied: OK.

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

Fase 7 en Fase 8 migraties zijn server-side toegepast. Fase 8.1 migratie is toegepast en bevestigd.

## Codex-taken buiten Git

Afgerond door Codex/Claude:

1. Runtime directories, user/group, env, MySQL, Redis, Apache-hardening en systemd templates server-side gevalideerd.
2. Fase 7 install/build/typecheck/test/lint, migratie, asset scan en route smoke afgerond.
3. Fase 8 install/build/typecheck/test/lint, migratie, entity routes en runtime gates afgerond.
4. Fase 8.1 install/build/typecheck/test/lint, migratie, procedural smoke en no-runtime-publish/no-asset-copy checks afgerond.

Nog open voor Codex/Claude:

1. Toekomstige game runtime, realtime gateway, workers en publish-services pas installeren/starten wanneer hun fase en echte build-output bestaan.
2. Nginx niet live activeren zonder aparte migratiefase.
3. `/usr/bin/node` blijft serverbreed `v18.19.1`; geen actie nodig voor GK zolang GK via `/opt/gk/node-v22` draait.
