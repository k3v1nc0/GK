# Current Phase

## Fase

Actieve fase: Fase 7 - auto asset/audio library uit assets-map.

## Status

Fase-status: Fase 7 Git-basis voorbereid; server-side validatie staat nog open.

Fase 7 bouwt de basis voor een automatische asset/audio library uit `GK_ASSET_SOURCE_DIR=/var/www/gk/assets`. De fase voegt schema-contracten, scanner core, editor-only API-contracten, editor panel state, asset-worker scan/polling contract, database-migratie en tests toe. De fase publiceert niets naar Runtime Game.

## Doel

Fase 7 maakt server-assets zichtbaar en beheerbaar als editor/library-data zonder assets in Git te zetten en zonder definitieve runtime-roles te hard-coden.

De fase legt generieke capabilities vast voor:

- asset records voor `glb`, `ui_image` en `audio`;
- original filename, normalized key/id, relative path, extension, size, modified timestamp, content hash waar haalbaar, metadata JSON en status;
- statuswaarden `active`, `missing` en `invalid`;
- role mapping status `unassigned`, `candidate` en `assigned`;
- recursive scanner voor `GK_ASSET_SOURCE_DIR`;
- filenames met spaties;
- GLB, UI image en audio extensieherkenning;
- missing asset reconciliation zonder serverbestanden te verwijderen;
- watcher/polling contract zonder permanente daemon vanuit Git;
- editor asset/audio panel counts en role mapping status;
- editor-only read/scan routes;
- scan responses met counts en validation issues;
- database-schema voor asset register en scan runs zonder echte assetdata.

## Bronnen gecontroleerd

Voor deze statusupdate zijn de actuele GitHub-bronnen gebruikt:

- `README/current-phase.md`
- `docs/design/phase-plan/current-phase.md`
- `README/fase7.md`
- `README/node-system-super-dynamic-contract.md`
- `docs/design/content-gates.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/architecture/editor-shell.md`
- `docs/ops/server-layout.md`
- `README/GameBibleNode.json`

## Blijvende fasecontracten

- `README/GameBibleNode.json` is de leidende Game Bible.
- Concrete gamecontent mag alleen uit GameBible JSON, editor/node-data, registers, database of expliciete Kevin-input komen.
- Geen concrete gamecontent in runtimecode.
- Hoofdketen: `Database > Editor/Node-system > Publish > Runtime Game`.
- Runtimecode bevat alleen engine-capabilities.
- Assetpad is bevestigd: `/var/www/gk/assets`.
- `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` is bevestigd.
- GLB=4, UI images=0, audio=0.
- GLB-assets hebben nog geen definitieve runtime-role mapping.
- GLB-bestanden mogen alleen generieke kandidaat-capability metadata krijgen.
- Role mapping is editor-data; Kevin/editor kiest later definitieve rollen.
- UI/audio count 0 is geldig en mag geen dummy assets veroorzaken.
- Asset scan kopieert geen assets naar Git en publiceert niets naar runtime.

## Fase 7 Git-output

Aangemaakt of bijgewerkt in Fase 7:

- `packages/asset-library/*`
- `apps/asset-worker/src/index.ts`
- `apps/api-server/src/editor-asset-library-routes.ts`
- `apps/api-server/src/auth-routes.ts`
- `apps/api-server/src/http-server.ts`
- `apps/api-server/src/index.ts`
- `apps/editor-web/src/panels.ts`
- package/tsconfig workspace-koppelingen voor API, editor-web, asset-worker en asset-library
- `db/migrations/0003_asset_library_register.sql`
- `tests/phase7-asset-library.test.mjs`
- fase-documentatie

## Asset schema/contract

Een asset record bevat:

- `assetId`;
- `assetType`: `glb`, `ui_image` of `audio`;
- `originalFilename`;
- `normalizedKey`;
- `relativePath`;
- `extension`;
- `sizeBytes`;
- `modifiedAt`;
- `contentHash` met `sha256` wanneer veilig/haalbaar;
- `metadata`;
- `status`: `active`, `missing` of `invalid`;
- `roleMapping.status`: `unassigned`, `candidate` of `assigned`.

GLB krijgt standaard alleen kandidaat-capability metadata. `assignedRole` blijft `null` totdat editor-data die keuze vastlegt.

## API contract

Editor-only routes:

- `GET /editor/assets/library`
- `POST /editor/assets/scan`

Beide routes vereisen editor scope. De scanroute is CSRF/Origin beschermd, uploadt niets, maakt geen assets aan, kopieert niets naar Git en publiceert niets naar runtime.

Game sessions en anonieme requests mogen geen editor asset beheer krijgen.

## Database/schema contract

Fase 7 database/schema contract:

- `asset_library_records`
- `asset_library_scan_runs`

De migratie is idempotent met `CREATE TABLE IF NOT EXISTS` en bevat geen echte assetdata.

## Content- en assetgrens

Niet toegevoegd:

- assets;
- dummy assets;
- fake GLB/UI/audio;
- concrete gamecontent;
- runtime-hardcoded NPCs, quests, prijzen, camera, lighting, minimap, boss, item, route, HUD of audio-keuzes.

De bekende serverassetstatus blijft:

- GLB=4;
- UI=0;
- audio=0;
- GLB role mapping nog niet definitief gekozen.

## Open Kevin-input

Geen blokkerende Kevin-input voor de Git-basis van Fase 7.

Definitieve GLB-role mapping, UI-assets en audio-assets blijven latere editor/content gates. Zonder Kevin/editor-keuze mag de code geen roles invullen.

## Open Codex-taken buiten Git

- `pnpm install` draaien en lockfile/workspace symlinks valideren.
- `pnpm build`, `pnpm typecheck`, `pnpm test` en `pnpm lint` draaien.
- `db/migrations/0003_asset_library_register.sql` toepassen.
- Echte scan uitvoeren op `GK_ASSET_SOURCE_DIR=/var/www/gk/assets`.
- Bevestigen dat de scan GLB=4, UI=0 en audio=0 meldt.
- Filename met spatie server-side controleren.
- Watcher/polling smoke doen zonder permanente daemon vanuit Git.
- Editor-only route smoke doen voor read/scan.
- Anonymous/game session denial testen.
- Bevestigen dat scan niets publiceert naar runtime en geen assets naar Git kopieert.

## Fasebeoordeling

Fase 7 is nog niet volledig server-side klaar.

Afgerond in Git:

- schema/contract;
- scanner core;
- watcher/polling contract;
- editor asset/audio panel state;
- editor-only API-contracten;
- database-migratie;
- tests;
- documentatiecorrectie rond GLB kandidaat-capabilities en role mapping.

Nog open:

- server-side install/build/typecheck/test/lint;
- MySQL migratie;
- echte assets-map scan;
- watcher/polling smoke;
- API/editor smoke.

Huidige status: Fase 7 Git-basis voorbereid; server-side validatie moet nog volgen.
