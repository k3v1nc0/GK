# Current Phase

## Fase

Actieve fase: Fase 3 - Repo-skelet en modulaire file werkwijze.

## Status

Fase-status: Fase 3 Git-basis voorbereid; install/build/typecheck gate open voor Codex.

Fase 3 is nog niet volledig klaar zolang de workspace niet met `pnpm install` is geinstalleerd en `pnpm build`, `pnpm typecheck` en `pnpm test` niet succesvol in een omgeving met registry-toegang hebben gedraaid.

## Doel

Fase 3 maakt een workspace die jaren kan groeien zonder grote monolithische bestanden.

De fase legt de eerste modulaire scheiding vast tussen:

- apps;
- engine-capability packages;
- database boundary;
- tests;
- architectuurdocumentatie.

## Bronnen gecontroleerd

Geopend of gecontroleerd voor deze fase:

- `README/current-phase.md`
- `docs/design/phase-plan/current-phase.md`
- `README/fase3.md`
- `README/fase2.md`
- `docs/design/content-gates.md`
- `docs/design/game-bible.md`
- `docs/ops/server-layout.md`
- `README/GameBibleNode.json`
- bestaande workspace/toolingpaden via GitHub search en lokale werkset

## Fase 1- en Fase 2-contracten die blijven gelden

- `README/GameBibleNode.json` is de leidende Game Bible.
- Concrete gamecontent mag alleen uit GameBible JSON, editor/node-data, registers, database of expliciete Kevin-input komen.
- Geen concrete gamecontent in runtimecode.
- Hoofdketen: `Database > Editor/Node-system > Publish > Runtime Game`.
- Runtimecode bevat alleen engine-capabilities.
- Assetpad is bevestigd: `/var/www/gk/assets`.
- `GK_ASSET_SOURCE_DIR=/var/www/gk/assets` is bevestigd.
- GLB=4, UI images=0, audio=0.
- GLB-assets hebben nog geen definitieve runtime-role mapping.
- UI/audio blijven latere asset/content gates.
- Apache blijft voorlopig hoofdwebserver.
- Nginx blijft alleen candidate/template voor een aparte latere migratiefase.

## Fase 2-open punten die open blijven

Deze punten blokkeren Fase 3 niet, maar blijven Codex-taken buiten Git:

1. `/etc/gk/gk.env` endpointvelden vervangen door de bevestigde waarden.
2. `ops/scripts/check-host` opnieuw draaien.
3. Apache vhost/reverse proxy renderen uit `ops/apache/gk-vhost.conf.template`.
4. Apache-config veilig testen en bevestigen dat bestaande sites niet breken.
5. `/var/www/gk/current` vullen zodra runtime/build bestaat.
6. Definitieve `gk-*.service` units renderen/installeren/starten wanneer echte `ExecStart` beschikbaar is.
7. Build, migraties en runtime checks uitvoeren zodra tooling bestaat.

## Workspace-keuze

De workspace gebruikt:

- `pnpm` met `pnpm-workspace.yaml`;
- TypeScript project references via root `tsconfig.json`;
- kleine package- en app-startbestanden;
- geen frameworkkeuze in Fase 3.

Deze keuze past bij `README/fase3.md`, waar Codex `pnpm install/build/test` moet draaien, en houdt apps/packages vanaf het begin gescheiden.

## Wat is aangemaakt of bijgewerkt

Root:

- `.gitignore`
- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `tsconfig.json`
- `scripts/check-workspace-boundaries.mjs`

Apps:

- `apps/editor-web`
- `apps/game-web`
- `apps/api-server`
- `apps/realtime-gateway`
- `apps/world-service`
- `apps/publish-service`
- `apps/asset-worker`

Packages:

- `packages/schemas`
- `packages/node-engine`
- `packages/node-types`
- `packages/net-protocol`
- `packages/shared-ui`
- `packages/shared-utils`
- `packages/renderer-runtime`
- `packages/audio-runtime`

Overig:

- `db/schema-boundary.md`
- `tests/workspace-boundaries.test.mjs`
- `docs/architecture/workspace-boundaries.md`
- `docs/design/phase-plan/current-phase.md`
- `README/current-phase.md`

## Apps/packages boundary

Apps zijn toekomstige deploybare surfaces of services. Packages zijn herbruikbare engine-capabilities.

Regels:

- Apps mogen packages gebruiken.
- Packages mogen geen concrete app-runtime of contentbeslissingen hard-coden.
- Renderer en audio blijven apart.
- Schemas, node-engine en node-types blijven apart.
- Net-protocol blijft apart van UI, services en runtime rendering.
- Asset-worker leest generiek `GK_ASSET_SOURCE_DIR`, maar wijst geen runtime-rollen toe.

## Content- en assetgrens

Niet toegevoegd:

- assets;
- data;
- secrets;
- dummy content;
- concrete gamecontent;
- runtime-hardcoded NPCs, quests, prijzen, camera, lighting, minimap, boss, item, route, HUD of audio-keuzes.

De startcode bevat alleen generieke boundaries, registries, protocoltypes, validators, renderer/audio primitives en env-readers.

## Checks

Uitgevoerd:

- Repo-bronnen geopend via GitHub connector.
- Bestaande workspace/tooling gezocht; geen bestaande `apps/`, `packages/`, root `package.json`, `pnpm-workspace.yaml` of `tsconfig` gevonden.
- Root workspace-structuur lokaal gecontroleerd.
- Starter file size scan: sourcebestanden blijven klein.
- ASCII-scan op nieuwe workspacebestanden: OK.
- Secret/content scan op `apps/`, `packages/`, `db/`, `docs/architecture/`, `tests/`, `scripts/` en workspace-configs: geen echte secrets/assets/data/concrete runtimecontent gevonden.
- `node --test tests/*.test.mjs`: OK.
- `node scripts/check-workspace-boundaries.mjs`: OK.
- `node --experimental-strip-types --check` op alle `apps/**/*.ts` en `packages/**/*.ts`: OK.

Niet volledig uitvoerbaar in deze omgeving:

- `pnpm install`: niet uitvoerbaar, omdat Corepack de pnpm tarball niet kon downloaden via registry-toegang.
- `pnpm build`: niet uitvoerbaar zonder pnpm install en TypeScript dependency.
- `pnpm typecheck`: niet uitvoerbaar zonder pnpm install en TypeScript dependency.
- `pnpm test`: rootscript niet via pnpm uitvoerbaar zonder pnpm install; de onderliggende Node-test is wel direct uitgevoerd en geslaagd.

## Open Kevin-input

Geen blokkerende Fase 3-structuurinput open. Kevin heeft akkoord gegeven op de apps/packages-structuur uit `README/fase3.md`.

Latere fases houden hun eigen gates voor GLB-role mapping, UI-assets, audio-assets, concrete content, economy, world settings en runtime services.

## Open Codex-taken buiten Git

Codex moet na deze commit buiten Git of in een omgeving met registry-toegang uitvoeren:

1. `pnpm install`.
2. `pnpm build`.
3. `pnpm typecheck`.
4. `pnpm test`.
5. `pnpm lint`.
6. Fase 2 servergates verder sluiten zodra runtime/build bestaat.

## Fasebeoordeling

Fase 3 is Git-basis voorbereid, maar nog niet volledig klaar.

Niet markeren als volledig klaar totdat:

- workspace install succesvol is;
- build/typecheck/test/lint via pnpm succesvol draaien;
- eventuele TypeScript/project-reference fouten zijn opgelost;
- geen generated `dist`, `node_modules`, secrets, assets of data in Git belanden.

Fase 4 mag pas starten als Kevin accepteert dat Fase 3 nog install/build/typecheck-gates open heeft, of nadat Codex deze gates sluit.

