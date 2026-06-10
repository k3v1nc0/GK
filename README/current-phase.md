# Current Phase

Actieve fase: `fase5.md`

Status: Fase 5 Git-basis voorbereid; Codex build/typecheck en editor/API runtime smoke gate open.

## Primaire Fase 5-status

Open voor de actuele fasecontractstatus:

- `docs/design/phase-plan/current-phase.md`
- `README/fase5.md`
- `docs/architecture/editor-shell.md`
- `docs/architecture/auth-boundaries.md`
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

Fase 2 serverfundering is grotendeels uitgevoerd, maar niet volledig server-klaar. Fase 3 workspace en Fase 4 database/auth zijn server-side gevalideerd.

## Fase 5 Git-basis

Al aanwezig uit Fase 3:

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

Aangemaakt of bijgewerkt voor Fase 4:

- `db/migrations/0001_auth_foundation.sql`
- `db/seeds/0001_initial_editor_admin.sql.template`
- `packages/schemas/src/auth.ts`
- `apps/api-server/src/auth-policy.ts`
- `apps/api-server/src/auth-routes.ts`
- `apps/editor-web/src/auth-client.ts`
- `apps/game-web/src/auth-client.ts`
- `tests/auth-boundaries.test.mjs`
- `docs/architecture/auth-boundaries.md`
- `ops/env/gk.example.env`

Aangemaakt of bijgewerkt voor Fase 5:

- `packages/shared-ui/src/editor-layout.ts`
- `apps/editor-web/src/editor-shell.ts`
- `apps/editor-web/src/node-canvas.ts`
- `apps/editor-web/src/world-preview.ts`
- `apps/editor-web/src/panels.ts`
- `apps/editor-web/src/game-user-management.ts`
- `apps/api-server/src/editor-game-user-management.ts`
- `tests/editor-shell.test.mjs`
- `docs/architecture/editor-shell.md`

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
- Editor-auth en game-auth zijn strikt gescheiden.
- Game registratie is open en start met `pending_verification`.
- Editorregistratie is niet publiek.
- Eerste editor admin e-mail: `k3v1nc0@hotmail.com`.
- Admin seed password/hash/secret blijven buiten Git.
- Node Canvas en Viewport / World Preview zijn aparte main tabs.
- Viewport / World Preview blijft leeg tot gepubliceerde world/node-data beschikbaar is.
- Asset Panel en Audio Panel verzinnen geen assets, audio of runtime-rollen.
- Game Users vereist editor scope met `editor_admin`.

## Open Kevin-input

Geen blokkerende Fase 5-input open.

Latere fases houden hun eigen gates voor assetrollen, UI/audio, concrete content, economy, world settings en runtime services.

## Afgeronde eerdere Codex-validatie buiten Git

Codex heeft Fase 3/Fase 4 server-side gevalideerd:

- `pnpm install`: geslaagd.
- `pnpm build`: geslaagd.
- `pnpm typecheck`: geslaagd.
- `pnpm test`: geslaagd met Node 22 via `npx -p node@22`.
- `pnpm lint`: geslaagd.
- MySQL is actief.
- Database `gk` bestaat.
- User `gk_app@127.0.0.1` bestaat.
- Runtime DB-connectie is OK.
- `db/migrations/0001_auth_foundation.sql` is succesvol toegepast.
- Alle Fase 4-auth tabellen zijn aanwezig.
- Admin seed secret/temp password/hash staan buiten Git in `/etc/gk/secrets/initial-editor-admin.env`.
- Admin `k3v1nc0@hotmail.com` bestaat, is actief en heeft geverifieerde e-mail.
- Rol `editor_admin` is gekoppeld.
- `admin.seed` auditregel is aanwezig.
- Database/auth smoke tests zijn geslaagd.
- Git status bleef schoon.
- Geen harde Fase 4 database/auth blocker meer.

## Open aandachtspunten

Technische runtime/tooling gate:

- Systeem-Node is `v18.19.1`; toekomstige `pnpm test` runs vereisen Node 22-activatie of een structurele Node-upgrade.

Fase 2-open serverpunten blijven ook open totdat runtime/build bestaat:

- `/etc/gk/gk.env` endpointvelden bijwerken.
- `ops/scripts/check-host` opnieuw draaien.
- Apache vhost/reverse proxy server-side renderen en veilig testen.
- Bestaande sites controleren voor Apache reload.
- `/var/www/gk/current` vullen zodra runtime/build bestaat.
- Definitieve `gk-*.service` units starten wanneer echte `ExecStart` bestaat.

Fase 5 runtime-smoke blijft open voor Codex buiten Git:

- `pnpm install` draaien in server/toolingomgeving.
- `pnpm build` draaien.
- `pnpm typecheck` draaien.
- `pnpm test` draaien met Node 22-activatie.
- `pnpm lint` draaien.
- API/editor-web starten.
- Browserconsole controleren.
- Apache route `/editor` controleren.
- Editor login smoke test uitvoeren.
- Game-user beheer smoke test uitvoeren.
- Viewport/Node Canvas laden controleren.
- Bestaande sites niet breken.

## Fasebeoordeling

Fase 5 Git-basis is voorbereid met lokale fallbackchecks.

Huidige status: Fase 5 Git-basis voorbereid; Codex build/typecheck en editor/API runtime smoke gate open.
