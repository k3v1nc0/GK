# Runtime Game Core Architecture

## Status

Fase 17 Git-basis. Server-side verificatie moet nog bevestigen dat build, typecheck, test, lint en runtime/browser-smokes groen zijn.

## Doel

Runtime Game Core is de eerste runtime-laag die de game-shell startbaar maakt vanuit published/read-model-data. De laag is bewust een boot- en contractlaag, geen content-, renderer-, movement-, combat-, economy-, multiplayer- of audiofase.

## Keten

```text
Database > Editor/Node-system > Publish > Runtime Projection > Runtime Client Shell > Runtime Render Surface > Runtime Scene Assembly > Runtime Asset Reference Planning > Runtime Game Core
```

Runtime Game Core consumeert alleen:

- published runtime projection read-models;
- Fase 15 runtime asset-reference planning metadata;
- runtime-safe capability-adapterpunten voor camera, HUD en audio;
- runtime state envelope voor save/load.

Runtime Game Core consumeert niet:

- editor/admin routes;
- draft, preview of candidate data;
- concrete zone-, NPC-, quest-, item-, economy-, combat- of audio-inhoud;
- asset bytes of final asset roles buiten published data.

## Contracten

De Fase 17 contracts staan in:

- `packages/schemas/src/runtime-game-core.ts`
- `packages/schemas/src/runtime-game-core-validation.ts`
- `packages/node-types/src/runtime-game-core-nodes.ts`
- `apps/game-web/src/runtime-game-core.ts`

Belangrijkste contractdelen:

- `RuntimeGamePublishedBuildSource`: published/read-model bron voor runtime boot.
- `RuntimeGameManifestReader`: read-only manifest reader over runtime projection routes.
- `RuntimeGameAssetReferenceResolver`: metadata-only koppeling met Fase 15 asset-reference planning.
- `RuntimeGameWorldBootstrap`: world bootstrap uit published read models, met veilige block wanneer data ontbreekt.
- `RuntimeGamePlayerSessionBootstrap`: player-session envelope zonder concrete content.
- `RuntimeGameInputAdapter`: input intent boundary zonder movement/combat binding.
- `RuntimeGameCapabilityAdapters`: camera/HUD/audio adapterpunten, published-data-required.
- `RuntimeGameSaveLoadState`: save/load basis voor runtime-state only.
- `RuntimeGameDiagnostic`: safe-for-display diagnostics voor ontbrekende published data.

## Startgedrag

Wanneer published manifest, world read-model of asset-reference metadata ontbreekt, moet Runtime Game Core veilig blokkeren met diagnostics. Dat is geen failure state van de fase; dat is het bedoelde gedrag totdat echte published data beschikbaar is.

Wanneer published data en metadata aanwezig zijn, mag de core lifecycle `ready` worden. Ook dan blijven renderer draw calls, asset byte fetches, concrete content en latere gameplay-systemen buiten scope.

## Node-system

Fase 17 voegt runtime-consumer nodes toe:

- `gk.runtimeGameCore.source`
- `gk.runtimeGameCore.boot`
- `gk.runtimeGameCore.playerSession`
- `gk.runtimeGameCore.inputAdapter`
- `gk.runtimeGameCore.saveState`
- `gk.runtimeGameCore.diagnostics`

Deze nodes mogen geen concrete gamecontent maken. Ze valideren tegen editor/draft gebruik, asset byte loads, final role mapping, renderer draw calls, hardcoded runtime values, latere runtime systemen en asset/published-data mutaties.

## Game-web surface

De game shell toont een Fase 17 marker:

- `data-runtime-game-core="phase-17"`
- `data-runtime-game-uses-editor-routes="false"`
- `data-runtime-game-uses-draft-data="false"`
- `data-runtime-game-loads-assets="false"`
- `data-runtime-game-fetches-bytes="false"`
- `data-runtime-game-hardcodes-content="false"`

`/game/shell.json` en `/health/game` publiceren dezelfde contractstatus, inclusief dat de huidige empty/default state veilig blokkeert op ontbrekende published data.

## Verificatie

Server-side moet nog draaien:

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm typecheck`
- lokale game route-smokes
- Apache/front-door route-smokes
- `pnpm smoke:browser:game`
- `pnpm smoke:browser`

De Fase 17 browser-smoke staat in `tests/smoke/runtime-game-core-smoke.mjs` en draait mee met `smoke:browser` en `smoke:browser:game`.
