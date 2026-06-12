# Current Phase

Actieve status: Fase 8.1 server-side afgerond en klaar.

Volgende fase: Fase 9 blijft de volgende implementatiefase pas wanneer Kevin die later opent.

Status: Fase 8 is server-side afgerond en klaar. Fase 8.1 heeft de procedural generation core, routes, panel, migratie en tests server-side bevestigd. Procedural output blijft editor draft/preview/bake data totdat een latere publish-flow expliciet publiceert.

## Primaire bronnen

Open voor de actuele fasecontractstatus:

- `docs/design/phase-plan/current-phase.md`
- `README/fase8.md`
- `README/fase8.1.md`
- `README/fase9.md`
- `README/node-system-super-dynamic-contract.md`
- `docs/architecture/editor-shell.md`
- `docs/architecture/auth-boundaries.md`
- `docs/design/content-gates.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/design/game-bible.md`
- `docs/ops/server-layout.md`
- `README/GameBibleNode.json`

Dit README-fasebestand blijft de korte fase-index. De inhoudelijke fasebeoordeling staat onder `docs/design/phase-plan/current-phase.md`.

## Gebruik

- Werk aan 1 fase tegelijk.
- Open altijd eerst deze korte fase-index en daarna `docs/design/phase-plan/current-phase.md`.
- Voor content geldt `README/GameBibleNode.json` als leidende Game Bible.
- Concrete gamecontent loopt via `Database > Editor/Node-system > Publish > Runtime Game`, niet via runtime-hardcoding.
- Pas een fase pas naar klaar aan als alle blokkerende input, Codex-taken en checks voor die fase zijn afgerond.
- Fase 8.1 is nu als klaar bevestigd na server-side verificatie.

## Laatste status

Fase 1 is klaar.

Fase 2 serverfundering is grotendeels uitgevoerd. Apache blijft hoofdwebserver, Nginx blijft inactive/candidate, en GK-services draaien via Node 22 onder `/opt/gk/node-v22`.

Fase 3 workspace, Fase 4 database/auth en Fase 5/Fase 5.3 editor-login plus GameBible browser-save zijn server-side gevalideerd.

Fase 6 is server-side afgerond. De node graph core bestaat uit typed sockets, meerdere poorten, dropdown/input field schemas, edge validation, editor graph operations, undo/redo history met 100 acties per editor session, operation log en draft preview zonder publish.

Fase 7 is server-side afgerond en klaar. Asset library scan, editor-only asset routes, Asset Panel, Audio Panel, migratie en runtime/gate checks zijn server-side bevestigd. GLB=4, UI=0 en audio=0. GLB role mapping staat alleen op `candidate` totdat editor-data/Kevin anders kiest.

Fase 8 is server-side afgerond en klaar op HEAD `5b4872cfc1dbf737d31e78fb965e78af7aaf74d0` (`fase 8 fix codex`):

- `pnpm install`: OK;
- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- migratie `0004_entity_component_core.sql`: OK;
- nieuwe Fase 8 tabellen: OK;
- entity routes: OK;
- anonymous/game denied: OK;
- `Taverne.glb` object-test: OK;
- `Wizard.glb` NPC-test: OK;
- animation warning/blocker: OK;
- GameBible save: OK;
- game-site reachable: OK;
- runtime publish: nee bevestigd;
- assets niet naar Git: bevestigd;
- blockers: geen;
- `gk-api` en `gk-editor-web` zijn herstart om de huidige build live te laden.

Fase 8.1 is server-side afgerond en klaar. De verificatie bevestigde:

- `pnpm install`: OK;
- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- migratie `0005_procedural_generation_core.sql`: OK;
- nieuwe Fase 8.1 tabellen: OK;
- procedural routes: OK;
- anonymous/game denied: OK;
- same-seed determinism: OK;
- different-seed smoke: OK;
- no runtime publish: OK;
- no asset copy to Git: OK;
- GameBible save: OK;
- game-site reachable: OK;
- `gk-api` en `gk-editor-web` draaien via Node 22 en zijn actief/herstart.

## Bevestigde grenzen

- Apache blijft voorlopig de actieve hoofdwebserver.
- Nginx blijft alleen candidate/template.
- Assetpad: `/var/www/gk/assets`.
- `GK_ASSET_SOURCE_DIR=/var/www/gk/assets`.
- GLB=4, UI=0, audio=0.
- GLB assets hebben nog geen definitieve runtime-role mapping.
- GLB role mapping blijft editor-data/Kevin-keuze.
- UI/audio count 0 is geldig en veroorzaakt geen dummy assets.
- Geen assets, data, secrets, dummy content of concrete gamecontent toegevoegd.
- Editor-auth en game-auth zijn strikt gescheiden.
- Draft preview, asset scan, entity validation en procedural preview/bake publiceren niets naar runtime.
- Procedural output blijft editor draft/preview/bake data totdat een latere publish-flow expliciet publiceert.

## Open aandachtspunten

Geen Fase 8 blockers open.

Open blijft toekomstwerk voor latere fases:

- definitieve GLB-role mapping via editor-data/Kevin-keuze;
- concrete UI-assets, audio-assets, content, economy en world settings;
- Fase 9 world/camera/lighting/minimap pas bouwen op Fase 8.1 procedural core;
- runtime publish en game runtime pas activeren wanneer hun fase dit expliciet opent;
- Nginx blijft candidate; geen Nginx-migratie zonder aparte migratiefase.
