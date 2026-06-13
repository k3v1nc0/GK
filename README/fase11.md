# Fase 11 - Runtime Projection Core

Fase 11 is door Kevin geopend en is nu afgerond.

Git-basis: voorbereid op `main`.

Server-side status: groen bevestigd door Codex/Claude. Fase 11 Runtime Projection Core is klaar.

Fase 12 is nog niet geimplementeerd en wordt pas geopend wanneer Kevin dat doet.

## Doel

Fase 11 maakt een gecontroleerde runtime projection laag op basis van Fase 10 publish-ready snapshotmetadata en validatieresultaten.

De keten blijft:

`Editor/node/procedural/world/entity/UI/audio data -> Publish validation/snapshot metadata -> Runtime projection records/contracts -> latere Runtime Game renderer/client`

Fase 11 opent alleen de projection contractlaag. De Runtime Game renderer/client is nog niet geopend.

## Vaste grenzen

Niet toegestaan en niet toegevoegd in Fase 11:

- 3D runtime game bouwen;
- renderer bouwen;
- movement, combat of player gameplay bouwen;
- HUD runtime renderer bouwen;
- minimap runtime renderer bouwen;
- audio runtime playback bouwen;
- concrete gamecontent toevoegen;
- dummy assets toevoegen;
- assets toevoegen, wijzigen, verwijderen of kopieren;
- GLB role mapping definitief maken;
- hardcoded world, camera, light, minimap, HUD, audio, NPC, quest of economy values toevoegen;
- automatische publish uitvoeren;
- Fase 12 voorbereiden;
- secrets toevoegen.

## Bouwt op

Fase 11 bouwt op:

- Fase 6 typed node graph core;
- Fase 7 asset/audio library;
- Fase 8 entity/component core;
- Fase 8.1 procedural generation core;
- Fase 9 world/camera/lighting/minimap/UI display core;
- Fase 10 Publish Flow Core.

## Toegevoegd in de Git-basis

### Runtime projection schemas/contracts

Nieuwe contracts:

- `RuntimeProjectionStatus`;
- `RuntimeProjectionSource`;
- `RuntimeProjectionManifest`;
- `RuntimeProjectionRecord`;
- `RuntimeProjectionValidationResult`;
- `RuntimeProjectionAuditEvent`;
- `RuntimeProjectionReadModel`;
- `RuntimeProjectionSafetyFlags`.

Duidelijk gescheiden:

- Fase 10 publish snapshot metadata;
- projection candidate/source;
- runtime projection manifest;
- runtime-readable projection/read model;
- Runtime Game renderer/client, nog niet geopend.

Runtime projection mag verwijzen naar gevalideerde publish data en accepted generated refs. Runtime projection mag geen concrete world map, NPCs, quests, economy, loot, camera values, lighting presets, HUD layout, minimap layout, definitieve GLB roles of renderer instructies bevatten.

### Validation gates

Fase 11 validation bewaakt:

- projection source moet uit Fase 10 publish snapshotmetadata en publish-ready validation komen;
- geen projection vanuit raw draft;
- geen projection vanuit procedural preview/bake zonder publish acceptatie;
- geen asset copy/mutation;
- geen concrete gamecontent;
- geen hardcoded content;
- UI display size komt uit node/editor/publish data, niet uit source natural size;
- GLB roles blijven candidate/editor-data tenzij expliciet via publish data;
- runtime projection is read-model/contract, geen renderer;
- safety flags blijven:
  - `publishesRuntimeProjection=true`;
  - `implementsRuntimeRenderer=false`;
  - `mutatesAssets=false`;
  - `containsConcreteGameContent=false`;
  - `usesHardcodedContent=false`.

### Editor/admin route contracts

Nieuwe editor/admin route contracts:

- `GET /editor/runtime-projection/status`;
- `POST /editor/runtime-projection/validate`;
- `POST /editor/runtime-projection/project`;
- `GET /editor/runtime-projection/manifests`;
- `GET /editor/runtime-projection/manifests/:id`.

Server-side groen bevestigd.

Regels:

- editor admin only;
- anonymous/game/non-admin denied;
- state-changing routes CSRF/Origin protected;
- geen automatische projection;
- project action maakt alleen contract-safe manifest/read-model metadata;
- geen concrete gamecontent in responses;
- geen asset mutatie of kopie.

### Runtime read-only route contracts

Nieuwe runtime read-only route contracts:

- `GET /runtime/projection/status`;
- `GET /runtime/projection/manifest`;
- `GET /runtime/projection/records`.

Server-side groen bevestigd.

Regels:

- read-only;
- geen state change;
- geen editor/admin secrets;
- geen editor draft leakage;
- geen raw unpublished draft/candidate data;
- veilige empty state wanneer er nog geen projection bestaat;
- geen dummy content.

### Node/socket contracts

Nieuwe socket types:

- `runtime.projection.source.reference`;
- `runtime.projection.validation.reference`;
- `runtime.projection.manifest.reference`;
- `runtime.projection.read-model.reference`;
- `runtime.projection.audit.reference`.

Nieuwe publish-boundary node types:

- `gk.runtimeProjection.source`;
- `gk.runtimeProjection.validate`;
- `gk.runtimeProjection.manifest`;
- `gk.runtimeProjection.readModel`;
- `gk.runtimeProjection.auditEvent`.

Deze nodes bouwen geen gameplay-node, renderer-node of hardcoded world values.

### Editor panel/state basis

Toegevoegd en server-side bevestigd:

- `Runtime Projection` panel;
- status;
- validation issues;
- source snapshot metadata;
- projection manifest metadata;
- safety flags;
- audit events;
- runtime read-only route summary.

Het panel toont geen verzonnen world content, NPC/quest/economy dummy data, asset previews die role mapping definitief maken of renderer output.

## Tests

Toegevoegd testcontract voor:

- runtime projection schema exports;
- runtime projection sockets en node types;
- invalid raw draft/candidate projection;
- generated refs blijven draft/candidate totdat publish validation accepteert;
- manifest/read-model bevat geen concrete hardcoded gamecontent;
- renderer flags blijven uit;
- asset mutation/copy blijft uit;
- UI display size komt uit data, niet uit source natural size;
- editor/admin routes zijn editor-only;
- anonymous/game/non-admin denied;
- CSRF/Origin gate voor state-changing projection routes;
- runtime read-only routes geven veilige empty state zonder draft leakage;
- Runtime Projection panel registratie.

Server-side bevestigd: `pnpm test` OK met 111 tests / 55 suites / 0 fail.

## Server-side verificatie

Codex/Claude heeft bevestigd:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK, 111 tests / 55 suites / 0 fail;
- `pnpm lint`: OK;
- `gk-api` active/enabled: OK;
- `gk-editor-web` active/enabled: OK;
- beide services via `/opt/gk/node-v22/bin/node`: OK;
- editor login: OK;
- `/auth/editor/me` geeft `editor_admin`: OK;
- `/editor` bereikbaar: OK;
- Runtime Projection panel aanwezig: OK;
- `/editor/runtime-projection/status`: OK;
- `/editor/runtime-projection/validate`: OK;
- `/editor/runtime-projection/project`: OK;
- `/editor/runtime-projection/manifests`: OK;
- `/editor/runtime-projection/manifests/:id`: OK;
- `/runtime/projection/status`: OK;
- `/runtime/projection/manifest`: OK;
- `/runtime/projection/records`: OK;
- anonymous/game/non-admin denied: OK;
- CSRF/Origin protection: OK;
- GameBible save beschermd en content ongewijzigd: OK;
- game-site reachable: OK;
- worktree schoon: OK;
- blockers: geen.

Browser smoke en ops/docs-hardening zijn ook afgerond op `main` via commit `346533a98e6786e741fded8bcc5af4177e3cfd36` (`Codex/Claude - browser en ops/docs-hardining`). De editor browser-smoke is groen. Game browser-smoke mag `skipped` blijven totdat game front door/login expliciet wordt geopend.

## Checklist

- [x] Runtime projection schemas/contracts toegevoegd.
- [x] Runtime projection validation gates toegevoegd.
- [x] Editor/admin projection route contracts toegevoegd.
- [x] Runtime read-only route contracts toegevoegd.
- [x] Node/socket contracts toegevoegd.
- [x] Runtime Projection panel/state basis toegevoegd.
- [x] Tests toegevoegd.
- [x] Docs bijgewerkt.
- [x] Geen assets gewijzigd.
- [x] Geen concrete gamecontent toegevoegd.
- [x] Geen runtime renderer/game client gebouwd.
- [x] Geen hardcoded world/camera/light/minimap/HUD/audio values toegevoegd.
- [x] Server-side build/typecheck/test/lint bevestigd.
- [x] Live editor/admin route smokes bevestigd.
- [x] Runtime read-only route smokes bevestigd.
- [x] Auth/CSRF smokes bevestigd.
- [x] Panel smoke bevestigd.
- [x] Docs final bevestigd.

## Fasebeoordeling

Fase 11 Runtime Projection Core is afgerond en server-side klaar.

Fase 12 is nog niet geimplementeerd. Volgende stap: Kevin mag Fase 12 openen.
