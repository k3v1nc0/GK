# Fase 10 - Publish Flow Core

## Status

Fase 10 is door Kevin geopend.

Git-basis: voorbereid op `main`.

Server-side status: afgerond en klaar.

## Vaste regels voor deze fase

- Dit is een 100% nieuw project.
- GK Code Copiloot werkt GitHub-only en rechtstreeks op `main`.
- Geen branches en geen pull requests.
- Geen runtime game implementeren.
- Geen runtime renderer bouwen.
- Geen concrete gamecontent toevoegen.
- Geen dummy assets.
- Geen assets toevoegen, wijzigen, verwijderen of kopieren.
- Geen automatische publish.
- Geen runtime publish uitvoeren.
- Geen GLB role mapping definitief maken.
- Geen hardcoded world, camera, lighting, fog, sky, minimap, HUD, audio, NPC, quest, economy of contentwaarden.
- Snapshot creation in Fase 10 is metadata/contractbasis, geen runtime payload.
- Runtime game publish/renderer is nog niet geopend.

## Doel van de fase

Fase 10 bouwt de Git-basis voor een gecontroleerde Publish Flow Core.

De publish flow valideert editor/node/procedural/entity/world/camera/lighting/minimap/UI data vanuit `draft` en `candidate` state naar `publish-ready` snapshotmetadata.

Duidelijk onderscheid:

- `draft`: editor/node/procedural data is nog in bewerking;
- `candidate`: data is kandidaat-input voor publish validation;
- `publish-ready`: validatie heeft geen blocking errors;
- `published-snapshot`: metadata over een snapshot, zonder runtime payload.

## Verplichte afhankelijkheden

Fase 10 bouwt op:

- Fase 6 typed node graph core;
- Fase 7 asset/audio library;
- Fase 8 entity/component core;
- Fase 8.1 procedural generation core;
- Fase 9 world/camera/lighting/minimap/UI display core.

## Toegevoegde contracts

Schema/contracts:

- publish status/state model;
- publish candidate/input references;
- publish validation result model;
- publish gate result model;
- publish snapshot metadata;
- publish audit/event model;
- rollback/snapshot reference basis;
- candidate summary counts;
- no-runtime-publish/no-asset-mutation/no-hardcoded-content flags.

Node/socket contracts:

- `publish.candidate.reference`;
- `publish.validation.reference`;
- `publish.snapshot.reference`;
- `gk.publish.status`;
- `gk.publish.candidateReference`;
- `gk.publish.validate`;
- `gk.publish.snapshotMetadata`;
- `gk.publish.rollbackReference`.

## Validation gates

Fase 10 validation bewaakt:

- node graph completeness;
- asset candidates zonder definitieve hardcoded role mapping;
- entity/component validity;
- procedural generated refs als draft/candidate input;
- world/zone/camera/lighting/minimap/UI display validity;
- UI display sizing uit node/editor data;
- source natural size alleen als metadata;
- `nineSlice` vereist margins uit node-data;
- no-runtime-publish;
- no-asset-mutation/copy;
- no-hardcoded-content.

Generated Fase 8.1 data blijft draft/candidate totdat publish validation en latere publish-flow die expliciet accepteren.

## Editor/API contracts

Editor-only route contracts:

- `GET /editor/publish/status`;
- `POST /editor/publish/validate`;
- `POST /editor/publish/snapshots`;
- `GET /editor/publish/snapshots`;
- `GET /editor/publish/snapshots/:id`;
- `POST /editor/publish/rollback/validate`.

Regels:

- alleen editor admin;
- state-changing routes vereisen CSRF/Origin bescherming;
- anonymous, game en non-admin editor sessions worden geweigerd;
- responses bevatten geen concrete gamecontent;
- snapshot creation is metadata-only;
- routes publiceren niets naar Runtime Game;
- routes wijzigen geen assets.

## Editor panel/state

Fase 10 voegt een Publish Flow panel/state contract toe.

Het paneel mag tonen:

- status;
- validation issues;
- candidate summary;
- candidate references;
- snapshot metadata;
- geselecteerde snapshot metadata.

Het paneel mag niet tonen of maken:

- verzonnen world/NPC/quest/economy data;
- concrete HUD/minimap/audio runtimecontent;
- runtime publish acties;
- assetmutaties.

## Tests

Toegevoegd testcontract:

- publish schema exports bestaan;
- publish sockets/node types zijn geregistreerd;
- invalid draft/candidate data geeft validation issues;
- generated procedural refs blijven candidate input;
- UI display natural size is metadata en display size komt uit node/editor data;
- `nineSlice` zonder margins geeft validation issue;
- no-runtime-publish/no-asset-mutation/no-hardcoded-content;
- snapshot metadata bevat geen runtime payload;
- rollback reference valideert alleen en herstelt runtime niet automatisch;
- publish routes zijn editor-admin only;
- anonymous/game/non-admin denied;
- CSRF/Origin gate voor state-changing publish routes;
- Publish Flow panel is aanwezig in editor shell.

## Acceptatiechecklist

- [x] Publish schemas/contracts toegevoegd.
- [x] Publish validation gates toegevoegd.
- [x] Publish socket/node contracts toegevoegd.
- [x] Editor-only publish route contracts toegevoegd.
- [x] Publish Flow panel/state basis toegevoegd.
- [x] Tests toegevoegd.
- [x] Docs bijgewerkt.
- [x] Geen assets gewijzigd.
- [x] Geen runtime publish toegevoegd.
- [x] Geen concrete gamecontent toegevoegd.
- [x] Server-side build/typecheck/test/lint bevestigd.
- [x] Live route smokes bevestigd.
- [x] Auth/CSRF smokes bevestigd.
- [x] Panel smoke bevestigd.
- [x] Docs final bevestigd.

## Server-side verificatie

Bevestigd:

- `pnpm build`: OK;
- `pnpm typecheck`: OK;
- `pnpm test`: OK;
- `pnpm lint`: OK;
- `gk-api` en `gk-editor-web`: actief en enabled;
- editor login en `/auth/editor/me`: OK met `editor_admin`;
- `/editor` bereikbaar en Publish Flow panel zichtbaar in de editor shell: OK;
- `GET /editor/publish/status`: OK;
- `POST /editor/publish/validate`: OK;
- `POST /editor/publish/snapshots`: OK;
- `GET /editor/publish/snapshots`: OK;
- `GET /editor/publish/snapshots/:id`: OK;
- `POST /editor/publish/rollback/validate`: OK;
- anonymous/game/non-admin denied: OK;
- CSRF/Origin bescherming op state-changing publish routes: OK;
- no-runtime-publish/no-asset-mutation: OK;
- blockers: geen.

## Fasebeoordeling

Fase 10 is server-side afgerond en klaar.

Geen Fase 11 voorbereiden of openen vanuit deze fase.
