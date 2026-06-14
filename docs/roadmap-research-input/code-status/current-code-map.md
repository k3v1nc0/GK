# Current Code Map

Bronnen:

- Huidige main snapshot: `3536ab028391066e3d97712c5ae719098b1d1cc1`.
- Padlijst: GitHub compare `2a9a6077510237e8dfc5c638d0ca996b67a5fa05` naar `main`.
- Package metadata: `package.json`, `pnpm-workspace.yaml`, `apps/*/package.json`, `packages/*/package.json`.

Deze kaart is feitelijke onderzoeksinput. Er is geen build, test, servercheck of runtimecheck uitgevoerd voor dit pakket.

## Workspace

- `package.json`: workspace package `gk-workspace`; scripts `build`, `typecheck`, `test`, `lint`, `smoke:browser`, `smoke:browser:editor`, `smoke:browser:game`.
- `pnpm-workspace.yaml`: workspace bevat `apps/*` en `packages/*`.

## apps/editor-web

Package metadata:

- `apps/editor-web/package.json`: package `@gk/editor-web`; dependencies `@gk/asset-library`, `@gk/schemas`, `@gk/shared-ui`; scripts `start`, `build`, `typecheck`.

Bestanden zichtbaar in de GitHub-padlijst:

- `apps/editor-web/src/auth-client.ts`: auth client.
- `apps/editor-web/src/editor-shell.ts`: editor shell.
- `apps/editor-web/src/game-user-management.ts`: game user management.
- `apps/editor-web/src/http-server.ts`: HTTP server.
- `apps/editor-web/src/index.ts`: package entrypoint.
- `apps/editor-web/src/node-canvas.ts`: node canvas.
- `apps/editor-web/src/panels.ts`: panels.
- `apps/editor-web/src/publish-flow-panel.ts`: publish flow panel.
- `apps/editor-web/src/runtime-projection-panel.ts`: runtime projection panel.
- `apps/editor-web/src/world-camera-minimap-panels.ts`: world/camera/minimap panels.
- `apps/editor-web/src/world-preview.ts`: world preview.
- `apps/editor-web/tsconfig.json`: TypeScript config.

## apps/game-web

Package metadata:

- `apps/game-web/package.json`: package `@gk/game-web`; dependencies `@gk/audio-runtime`, `@gk/renderer-runtime`, `@gk/schemas`; scripts `build`, `typecheck`.

Bestanden zichtbaar in de GitHub-padlijst:

- `apps/game-web/src/auth-client.ts`: auth client.
- `apps/game-web/src/http-server.ts`: HTTP server.
- `apps/game-web/src/index.ts`: package entrypoint.
- `apps/game-web/src/runtime-asset-reference-planning.ts`: runtime asset reference planning.
- `apps/game-web/src/runtime-client-shell-styles.ts`: runtime client shell styles.
- `apps/game-web/src/runtime-client-shell.ts`: runtime client shell.
- `apps/game-web/src/runtime-projection-client.ts`: runtime projection client.
- `apps/game-web/src/runtime-render-surface.ts`: runtime render surface.
- `apps/game-web/src/runtime-scene-assembly.ts`: runtime scene assembly.
- `apps/game-web/tsconfig.json`: TypeScript config.

## packages/schemas

Package metadata:

- `packages/schemas/package.json`: package `@gk/schemas`; exports package root; scripts `build`, `typecheck`.

Bestanden zichtbaar in de GitHub-padlijst:

- `packages/schemas/src/auth.ts`: auth schemas.
- `packages/schemas/src/entity-components.ts`: entity component schemas.
- `packages/schemas/src/entity-validation.ts`: entity validation.
- `packages/schemas/src/index.ts`: package entrypoint.
- `packages/schemas/src/node-graph.ts`: node graph schemas.
- `packages/schemas/src/node-publish.ts`: node publish schemas.
- `packages/schemas/src/procedural-generation.ts`: procedural generation schemas.
- `packages/schemas/src/procedural-validation.ts`: procedural validation.
- `packages/schemas/src/publish-flow.ts`: publish flow schemas.
- `packages/schemas/src/publish-flow-validation.ts`: publish flow validation.
- `packages/schemas/src/runtime-asset-reference-planning.ts`: runtime asset reference planning schemas.
- `packages/schemas/src/runtime-asset-reference-planning-validation.ts`: runtime asset reference planning validation.
- `packages/schemas/src/runtime-client-shell.ts`: runtime client shell schemas.
- `packages/schemas/src/runtime-client-shell-validation.ts`: runtime client shell validation.
- `packages/schemas/src/runtime-projection.ts`: runtime projection schemas.
- `packages/schemas/src/runtime-projection-validation.ts`: runtime projection validation.
- `packages/schemas/src/runtime-render-surface.ts`: runtime render surface schemas.
- `packages/schemas/src/runtime-render-surface-validation.ts`: runtime render surface validation.
- `packages/schemas/src/runtime-scene-assembly.ts`: runtime scene assembly schemas.
- `packages/schemas/src/runtime-scene-assembly-validation.ts`: runtime scene assembly validation.
- `packages/schemas/src/world-camera-minimap.ts`: world/camera/minimap schemas.
- `packages/schemas/src/world-camera-minimap-validation.ts`: world/camera/minimap validation.
- `packages/schemas/tsconfig.json`: TypeScript config.

## packages/node-types

Package metadata:

- `packages/node-types/package.json`: package `@gk/node-types`; dependency `@gk/schemas`; exports package root; scripts `build`, `typecheck`.

Bestanden zichtbaar in de GitHub-padlijst:

- `packages/node-types/src/entity-component-nodes.ts`: entity component nodes.
- `packages/node-types/src/index.ts`: package entrypoint.
- `packages/node-types/src/procedural-generation-nodes.ts`: procedural generation nodes.
- `packages/node-types/src/publish-flow-nodes.ts`: publish flow nodes.
- `packages/node-types/src/runtime-asset-reference-planning-nodes.ts`: runtime asset reference planning nodes.
- `packages/node-types/src/runtime-client-shell-nodes.ts`: runtime client shell nodes.
- `packages/node-types/src/runtime-projection-nodes.ts`: runtime projection nodes.
- `packages/node-types/src/runtime-render-surface-nodes.ts`: runtime render surface nodes.
- `packages/node-types/src/runtime-scene-assembly-nodes.ts`: runtime scene assembly nodes.
- `packages/node-types/src/world-camera-minimap-nodes.ts`: world/camera/minimap nodes.
- `packages/node-types/tsconfig.json`: TypeScript config.

## Publish, runtime en projectie onderdelen

Bestanden zichtbaar in de GitHub-padlijst met publish/runtime/projection termen in pad of bestandsnaam:

- `apps/publish-service/package.json`: package metadata voor publish service.
- `apps/publish-service/src/index.ts`: publish service entrypoint.
- `apps/publish-service/tsconfig.json`: TypeScript config.
- `apps/api-server/src/editor-publish-routes.ts`: editor publish routes.
- `apps/api-server/src/runtime-projection-routes.ts`: runtime projection routes.
- `apps/editor-web/src/publish-flow-panel.ts`: publish flow panel.
- `apps/editor-web/src/runtime-projection-panel.ts`: runtime projection panel.
- `apps/game-web/src/runtime-asset-reference-planning.ts`: runtime asset reference planning.
- `apps/game-web/src/runtime-client-shell.ts`: runtime client shell.
- `apps/game-web/src/runtime-projection-client.ts`: runtime projection client.
- `apps/game-web/src/runtime-render-surface.ts`: runtime render surface.
- `apps/game-web/src/runtime-scene-assembly.ts`: runtime scene assembly.
- `packages/node-types/src/publish-flow-nodes.ts`: publish flow nodes.
- `packages/node-types/src/runtime-asset-reference-planning-nodes.ts`: runtime asset reference planning nodes.
- `packages/node-types/src/runtime-client-shell-nodes.ts`: runtime client shell nodes.
- `packages/node-types/src/runtime-projection-nodes.ts`: runtime projection nodes.
- `packages/node-types/src/runtime-render-surface-nodes.ts`: runtime render surface nodes.
- `packages/node-types/src/runtime-scene-assembly-nodes.ts`: runtime scene assembly nodes.
- `packages/schemas/src/node-publish.ts`: node publish schemas.
- `packages/schemas/src/publish-flow.ts`: publish flow schemas.
- `packages/schemas/src/publish-flow-validation.ts`: publish flow validation.
- `packages/schemas/src/runtime-asset-reference-planning.ts`: runtime asset reference planning schemas.
- `packages/schemas/src/runtime-asset-reference-planning-validation.ts`: runtime asset reference planning validation.
- `packages/schemas/src/runtime-client-shell.ts`: runtime client shell schemas.
- `packages/schemas/src/runtime-client-shell-validation.ts`: runtime client shell validation.
- `packages/schemas/src/runtime-projection.ts`: runtime projection schemas.
- `packages/schemas/src/runtime-projection-validation.ts`: runtime projection validation.
- `packages/schemas/src/runtime-render-surface.ts`: runtime render surface schemas.
- `packages/schemas/src/runtime-render-surface-validation.ts`: runtime render surface validation.
- `packages/schemas/src/runtime-scene-assembly.ts`: runtime scene assembly schemas.
- `packages/schemas/src/runtime-scene-assembly-validation.ts`: runtime scene assembly validation.

## tests/smoke

Package scripts die naar smoke verwijzen:

- `package.json`: `smoke:browser` draait `node tests/smoke/browser-smoke.mjs`.
- `package.json`: `smoke:browser:editor` draait `node tests/smoke/browser-smoke.mjs --editor`.
- `package.json`: `smoke:browser:game` draait `node tests/smoke/browser-smoke.mjs --game`.

Bestand opgehaald uit GitHub:

- `tests/smoke/browser-smoke.mjs`: browser smoke harness; zichtbare selectors in de eerste regels verwijzen naar `publish-flow-panel`, `runtime-projection-panel`, `data-runtime-client-shell='phase-12'`, `data-runtime-render-surface='phase-13'`, `data-runtime-scene-assembly='phase-14'` en `data-runtime-asset-reference-planning='phase-15'`.

Aanvullende testbestanden zichtbaar in de GitHub-padlijst:

- `tests/phase10-publish-flow.test.mjs`: phase 10 publish flow test.
- `tests/phase11-runtime-projection.test.mjs`: phase 11 runtime projection test.
- `tests/phase12-runtime-client-shell.test.mjs`: phase 12 runtime client shell test.
- `tests/phase13-runtime-render-surface.test.mjs`: phase 13 runtime render surface test.
- `tests/phase14-runtime-scene-assembly.test.mjs`: phase 14 runtime scene assembly test.
- `tests/phase15-runtime-asset-reference-planning.test.mjs`: phase 15 runtime asset reference planning test.
