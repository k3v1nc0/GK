# Current Phase

Actieve fase: `fase3.md`

Status: Fase 3 Git-basis voorbereid; install/build/typecheck gate open voor Codex.

## Primaire Fase 3-status

Open voor de actuele fasecontractstatus:

- `docs/design/phase-plan/current-phase.md`
- `README/fase3.md`
- `docs/design/content-gates.md`
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

Fase 2 serverfundering is grotendeels uitgevoerd, maar niet volledig server-klaar. Dat is akkoord voor Fase 3, omdat `/var/www/gk/current`, echte services, build, migraties en runtimechecks pas kunnen afronden nadat de workspace/runtime-basis bestaat.

## Fase 3 Git-basis

Aangemaakt of bijgewerkt voor Fase 3:

- root `package.json`
- `pnpm-workspace.yaml`
- root TypeScript configs
- `apps/editor-web`
- `apps/game-web`
- `apps/api-server`
- `apps/realtime-gateway`
- `apps/world-service`
- `apps/publish-service`
- `apps/asset-worker`
- `packages/schemas`
- `packages/node-engine`
- `packages/node-types`
- `packages/net-protocol`
- `packages/shared-ui`
- `packages/shared-utils`
- `packages/renderer-runtime`
- `packages/audio-runtime`
- `db/schema-boundary.md`
- `tests/workspace-boundaries.test.mjs`
- `docs/architecture/workspace-boundaries.md`

## Bevestigde grenzen

- Apache blijft voorlopig de actieve hoofdwebserver.
- Nginx blijft alleen candidate/template.
- Assetpad: `/var/www/gk/assets`.
- `GK_ASSET_SOURCE_DIR=/var/www/gk/assets`.
- GLB=4, UI=0, audio=0.
- Geen assets, data, secrets, dummy content of concrete gamecontent toegevoegd.
- Renderer en audio zijn aparte packages.
- Schemas, node-engine en node-types zijn aparte packages.
- Net-protocol is apart.
- Asset-worker leest generiek `GK_ASSET_SOURCE_DIR` en wijst geen runtime-rollen toe.

## Open Kevin-input

Geen blokkerende Fase 3-structuurinput open. Kevin heeft akkoord gegeven op de apps/packages-structuur uit `README/fase3.md`.

Latere fases houden hun eigen gates voor assetrollen, UI/audio, concrete content, economy, world settings en runtime services.

## Open Codex-taken buiten Git

Codex moet nog uitvoeren in een omgeving met registry-toegang:

- `pnpm install`
- `pnpm build`
- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`

Fase 2-open serverpunten blijven ook open totdat runtime/build bestaat:

- `/etc/gk/gk.env` endpointvelden bijwerken.
- `ops/scripts/check-host` opnieuw draaien.
- Apache vhost/reverse proxy server-side renderen en veilig testen.
- Bestaande sites controleren voor Apache reload.
- `/var/www/gk/current` vullen zodra runtime/build bestaat.
- Definitieve `gk-*.service` units starten wanneer echte `ExecStart` bestaat.

## Fasebeoordeling

Fase 3 is niet volledig klaar zolang de workspace niet echt met pnpm is geinstalleerd en build/typecheck/test/lint niet via pnpm zijn geslaagd.

Huidige status: Git-basis voorbereid; install/build/typecheck gate open.

