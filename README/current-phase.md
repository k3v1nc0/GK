# Current Phase

Actieve status: Fase 9 server-side afgerond en klaar op `main`.

Fase 8, Fase 8.1 en Fase 9 zijn server-side afgerond en klaar. Fase 10 is nog niet geopend of geimplementeerd; die mag later alleen als volgende fase worden gestart wanneer Kevin dat doet.

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

## Actuele status

Fase 9 bouwt op:

- Fase 6 typed node graph core;
- Fase 7 asset library;
- Fase 8 entity/component core;
- Fase 8.1 procedural generation core.

Toegevoegd en server-side gevalideerd in Fase 9:

- world settings, level, zone, spawnpoint, zone bounds en transition schema-contracten;
- generated zone, placement, path network en resource distribution references uit Fase 8.1 als draft/candidate input;
- camera node contracts voor mode, follow target, orbit, zoom, bounds, collision en transition;
- lighting node contracts voor directional, ambient, fog, sky en day/night cycle;
- minimap view, layer, marker, icon en generated path/resource/spawn layer contracts;
- generieke UI asset display contracts met display size, scale mode, anchor, pivot, opacity, zIndex, responsive rules en nineSlice margins;
- Fase 9 node types in de core node registry;
- editor-only route contracts voor world, minimap en UI display validation;
- editor panel state voor World, Zone, Camera, Lighting, Minimap en UI Display Inspector;
- tests voor node types, candidate refs, UI display scaling, nineSlice validation, minimap view split, editor-only access en no-runtime-publish.

## Server-side verificatie

Laatste bevestigde Fase 9 main commit: `445ff68a803a7097d6cd6f59f05fc993cb7fbe4f` (`fase 9 fix build downstream`).

Codex server-side verificatie:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK, 86/86 tests pass;
- `pnpm lint`: OK;
- `gk-api` herstart: OK;
- `gk-editor-web` herstart: OK;
- services active/enabled: OK;
- beide services draaien via `/opt/gk/node-v22/bin/node`;
- `/editor`: OK;
- editor login: OK;
- `/auth/editor/me`: OK, `editor_admin`;
- Fase 9 route smokes: OK;
- anonymous denied: OK, 401 en niet 404;
- game smoke-scope denied: OK, 403 en niet 404;
- editor panels: OK, inclusief World Panel, Zone Panel, Camera Panel, Lighting Panel, Minimap Panel en UI Display Inspector;
- UI scaling validation: OK;
- no-runtime-publish: OK;
- no-asset-mutation: OK;
- GameBible save: OK via testdekking;
- game-site reachable: OK;
- worktree schoon;
- blockers: geen.

## Assetstatus

Commit `44defc0f79f032cabc07eba43573a40c5f629b97` (`Assets - new`) staat op `main`. De server-side asset refresh en scan zijn uitgevoerd en OK:

- GLB=4;
- UI images=37;
- audio files=21;
- invalid=0;
- missing=0;
- `assetsCopiedToGit=false`;
- `publishesRuntimeOutput=false`;
- `assignsDefinitiveRuntimeRoles=false`.

HUD-bestanden, icon-bestanden en minimap marker-bestanden zijn UI/image assets. Ambience, music, SFX en UI-audio zijn audio assets. Alle UI/audio assets blijven asset-library candidates en zijn geen hardcoded HUD/audio/minimap runtimecontent.

## Fase 9 grenzen

- Geen concrete gamecontent in runtimecode.
- Geen vaste camera, lighting, fog, sky, minimap, world, HUD of audio values hardcoded.
- World/camera/light/minimap/HUD display waarden komen uit node-data/editor-data/procedural draft/publish data.
- Source image natural size is metadata en mag niet blind als display size worden gebruikt.
- UI/minimap display size, scale mode, anchor en pivot moeten via node-data/editor-data komen.
- Default display sizes zijn schema/editor hints, geen concrete HUD-layout.
- GLB roles blijven candidate/editor-data.
- Generated Fase 8.1 world data blijft draft/candidate totdat een latere publish-flow accepteert.
- Geen runtime publish buiten de publish-flow.

## Open aandachtspunten

Geen Fase 8, Fase 8.1 of Fase 9 blockers open.

Blijvende gates voor latere fases:

- GLB role mapping pas definitief via editor/node-data of Kevin-input;
- UI/audio assets blijven asset-library candidates totdat editor/node-data ze kiest;
- generated Fase 8.1 data blijft draft/candidate tot een latere publish-flow;
- runtime publish blijft buiten Fase 9;
- Fase 10 nog niet implementeren totdat Kevin die fase opent.

Volgende fase: Fase 10 is toekomstwerk en mag later worden geopend wanneer Kevin dat doet.
