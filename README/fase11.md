# Fase 11 - Runtime Projection Core

Fase 11 is door Kevin geopend.

Git-basis: voorbereid op `main`.

Server-side status: nog niet klaar. Codex/Claude moet build/typecheck/test/lint, live route smokes, auth/CSRF smokes, runtime read-only smokes en docs final nog bevestigen voordat Fase 11 als afgerond mag worden gemarkeerd.

## Doel

Fase 11 maakt een gecontroleerde runtime projection laag op basis van Fase 10 publish-ready snapshotmetadata en validatieresultaten.

De keten blijft:

`Editor/node/procedural/world/entity/UI/audio data -> Publish validation/snapshot metadata -> Runtime projection records/contracts -> latere Runtime Game renderer/client`

Fase 11 opent alleen de projection contractlaag. De Runtime Game renderer/client is nog niet geopend.

## Vaste grenzen

Niet toegestaan in Fase 11:

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

Toegevoegd:

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
- [ ] Server-side build/typecheck/test/lint bevestigd.
- [ ] Live editor/admin route smokes bevestigd.
- [ ] Runtime read-only route smokes bevestigd.
- [ ] Auth/CSRF smokes bevestigd.
- [ ] Panel smoke bevestigd.
- [ ] Docs final bevestigd.

## Open Codex/Claude-taken

Nog server-side valideren:

- `pnpm build`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm lint`;
- smoke `GET /editor/runtime-projection/status`;
- smoke `POST /editor/runtime-projection/validate`;
- smoke `POST /editor/runtime-projection/project` als contract-only manifest/read-model metadata;
- smoke `GET /editor/runtime-projection/manifests`;
- smoke `GET /editor/runtime-projection/manifests/:id`;
- smoke `GET /runtime/projection/status`;
- smoke `GET /runtime/projection/manifest`;
- smoke `GET /runtime/projection/records`;
- anonymous/game/non-admin denied;
- CSRF/Origin denied voor state-changing routes zonder proof;
- editor shell toont Runtime Projection panel;
- bevestigen dat geen runtime renderer/game client, concrete gamecontent of assetmutatie plaatsvindt.

## Fasebeoordeling

Fase 11 Git-basis is voorbereid.

Fase 11 is server-side nog niet klaar. Markeer Fase 11 pas als afgerond nadat Codex/Claude de open checks en live smokes bevestigt.

Geen Fase 12 voorbereiden of openen vanuit deze fase.
