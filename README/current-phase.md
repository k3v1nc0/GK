# Current Phase

Actieve fase: Fase 8 - universal entity/component systeem voor GLB objecten en NPCs.

Status: Fase 8 Git-basis voorbereid. Entity/component schemas, validators, node types, editor-only API-contracten, Entity/Component panel state, database-migratie en tests staan klaar in Git. Server-side migratie, install/build/typecheck/test/lint, API/editor smoke en asset/entity checks moeten nog door Codex/Claude op de server worden uitgevoerd.

## Primaire bronnen

Open voor de actuele fasecontractstatus:

- `docs/design/phase-plan/current-phase.md`
- `README/fase8.md`
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

## Laatste status

Fase 1 is klaar.

Fase 2 serverfundering is grotendeels uitgevoerd. Apache blijft hoofdwebserver, Nginx blijft inactive/candidate, en GK-services draaien via Node 22 onder `/opt/gk/node-v22`.

Fase 3 workspace, Fase 4 database/auth en Fase 5/Fase 5.3 editor-login plus GameBible browser-save zijn server-side gevalideerd.

Fase 6 is server-side afgerond. De node graph core bestaat uit typed sockets, meerdere poorten, dropdown/input field schemas, edge validation, editor graph operations, undo/redo history met 100 acties per editor session, operation log en draft preview zonder publish.

Fase 7 is server-side afgerond en klaar. Asset library scan, editor-only asset routes, Asset Panel, Audio Panel, migratie en runtime/gate checks zijn server-side bevestigd. GLB=4, UI=0 en audio=0. GLB role mapping staat alleen op `candidate` totdat editor-data/Kevin anders kiest.

Fase 8 Git-basis is voorbereid:

- entity/component contracts bestaan voor transform, renderable, collider, interactable, npc_brain, audio_emitter, combatant, boss, loot, quest_target, merchant, player_appearance en group_transform;
- entity drafts kunnen naar `asset.reference` uit de Fase 7 asset library verwijzen;
- dezelfde GLB kan via editor-data/componenten object-candidate en NPC-candidate zijn;
- `Taverne.glb` en `Wizard.glb` zijn alleen Kevin-testkeuzes, geen hardcoded runtimecontent;
- missing animation mapping is warning voor candidate entities;
- runtime-active NPC/combat/player behavior vereist expliciete animation mapping via editor-data;
- audio emitter blijft gated bij audio count 0;
- Fase 8 node types zijn toegevoegd als engine-capabilities;
- editor-only entity API-contracten en Entity/Component panel state zijn voorbereid;
- database-migratie `0004_entity_component_core.sql` bevat alleen schema, geen echte assetdata;
- Fase 8 publiceert niets naar Runtime Game.

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
- Draft preview, asset scan en entity validation publiceren niets naar runtime.

## Bevestigde Fase 8-input

- Object test GLB: `Taverne.glb`.
- NPC test GLB: `Wizard.glb`.
- Ontbrekende animaties zijn geen blocker voor kandidaat-entity.
- Ontbrekende animaties geven wel validation warning.
- NPC/combat/player behavior mag pas runtime-actief worden zodra animation mapping expliciet via editor-data is ingesteld.

## Open aandachtspunten

Open Fase 8 Codex/Claude-taken:

- `pnpm install` server-side draaien.
- `pnpm build`, `pnpm typecheck`, `pnpm test` en `pnpm lint` server-side draaien.
- `db/migrations/0004_entity_component_core.sql` toepassen op MySQL.
- Nieuwe Fase 8 tabellen controleren.
- Entity API routes met editor session en CSRF testen.
- Anonymous/game session denial voor entity beheer testen.
- Asset/entity checks met `Taverne.glb` en `Wizard.glb` uitvoeren.
- Bevestigen dat missing animation mapping warning is voor candidate en blocker voor runtime-active behavior.
- Bevestigen dat Fase 8 niets publiceert naar runtime en geen assets naar Git kopieert.

Open blijft toekomstwerk voor latere fases:

- definitieve GLB-role mapping via editor-data/Kevin-keuze;
- concrete UI-assets, audio-assets, content, economy en world settings;
- runtime publish en game runtime pas activeren wanneer hun fase dit expliciet opent;
- Nginx blijft candidate; geen Nginx-migratie zonder aparte migratiefase.
