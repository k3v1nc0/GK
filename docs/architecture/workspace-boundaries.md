# Workspace Boundaries

Fase 3 splitst de repo in deploybare apps en herbruikbare packages.

## Apps

Apps zijn toekomstige deploybare surfaces of services:

- `editor-web`
- `game-web`
- `api-server`
- `realtime-gateway`
- `world-service`
- `publish-service`
- `asset-worker`

Apps mogen packages gebruiken, maar mogen geen concrete gamecontent hard-coden.

## Packages

Packages bevatten engine-capabilities:

- `schemas`
- `node-engine`
- `node-types`
- `net-protocol`
- `shared-ui`
- `shared-utils`
- `renderer-runtime`
- `audio-runtime`

Renderer en audio blijven bewust gescheiden. Schemas, node-engine en node-types blijven bewust gescheiden. Net-protocol blijft apart van services en UI.

## Content Boundary

Concrete gamecontent loopt via:

`Database > Editor/Node-system > Publish > Runtime Game`

Runtimecode mag alleen generieke capabilities bevatten. Assetrollen, camera, lighting, minimap, economy, NPCs, quests, bosskeuzes, HUD en audio-keuzes blijven node/editor/database-data of expliciete Game Bible input.

## Package Manager

De workspace gebruikt `pnpm` met `pnpm-workspace.yaml`. TypeScript gebruikt project references via de root `tsconfig.json`, zodat modules apart kunnen groeien en apart door `tsc -b` worden gecontroleerd.

