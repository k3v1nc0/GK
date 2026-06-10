# Current Phase

## Fase

Actieve fase: Fase 5 - Editor-shell, node-canvas, panels en game-user beheer.

## Status

Fase-status: Fase 5 Git-basis voorbereid; Codex build/typecheck en editor/API runtime smoke gate open.

Fase 5 heeft de editor shell, node canvas, lege viewport, panels en game-user beheercontracten in Git voorbereid. `pnpm` build/typecheck en server/browser runtime-smoke zijn nog Codex-taken buiten Git.

## Doel

Fase 5 maakt de eerste generieke editorwerkplek met aparte editor login/session entry, node-raster, node menu, inspector, dockable panels, lege world preview en game-user beheer.

De fase legt generieke editor-capabilities vast voor:

- editor shell layout;
- Node Library;
- Node Canvas;
- Viewport / World Preview;
- Inspector en Validation;
- History/logs;
- Asset Panel en Audio Panel;
- HUD Editor en Minimap Panel;
- Game Users met editor_admin gate.

## Bronnen gecontroleerd

Geopend of gecontroleerd voor deze fase:

- `README/current-phase.md`
- `docs/design/phase-plan/current-phase.md`
- `README/fase5.md`
- `README/fase4.md`
- `README/fase3.md`
- `README/fase2.md`
- `docs/design/content-gates.md`
- `docs/design/game-bible.md`
- `docs/architecture/workspace-boundaries.md`
- `docs/architecture/auth-boundaries.md`
- `docs/ops/server-layout.md`
- `README/GameBibleNode.json`
- `package.json`
- `pnpm-workspace.yaml`
- `apps/api-server`
- `apps/editor-web`
- `apps/game-web`
- `packages/schemas`
- `packages/shared-ui`
- `packages/shared-utils`

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

Deze punten blokkeren Fase 4 Git-werk niet, maar blijven Codex-taken buiten Git:

1. `/etc/gk/gk.env` endpointvelden vervangen door de bevestigde waarden.
2. `ops/scripts/check-host` opnieuw draaien.
3. Apache vhost/reverse proxy renderen uit `ops/apache/gk-vhost.conf.template`.
4. Apache-config veilig testen en bevestigen dat bestaande sites niet breken.
5. `/var/www/gk/current` vullen zodra runtime/build bestaat.
6. Definitieve `gk-*.service` units renderen/installeren/starten wanneer echte `ExecStart` beschikbaar is.
7. Fase 2 runtime build/service checks uitvoeren zodra echte runtime/build bestaat.

## Fase 3-validatie

De Fase 3 workspace-checks zijn tijdens Fase 4 server-side gevalideerd:

1. `pnpm install`: geslaagd.
2. `pnpm build`: geslaagd.
3. `pnpm typecheck`: geslaagd.
4. `pnpm test`: geslaagd met Node 22 via `npx -p node@22`.
5. `pnpm lint`: geslaagd.

Aandachtspunt: systeem-Node is `v18.19.1`; toekomstige `pnpm test` runs vereisen Node 22-activatie of een structurele Node-upgrade.

## Fase 4-validatie

Fase 4 database/auth is server-side gevalideerd:

- MySQL database `gk` en user `gk_app@127.0.0.1` bestaan;
- runtime DB-connectie is OK;
- `db/migrations/0001_auth_foundation.sql` is toegepast;
- eerste editor admin `k3v1nc0@hotmail.com` bestaat, is actief en e-mail-geverifieerd;
- rol `editor_admin` is gekoppeld;
- `admin.seed` auditregel is aanwezig;
- database/auth smoke tests zijn geslaagd.

## Auth- en databasekeuzes

- Eerste editor admin e-mail: `k3v1nc0@hotmail.com`.
- Eerste admin password/hash/secret blijven buiten Git.
- Spelerregistratie is open.
- Editorregistratie is niet publiek.
- Editor users worden later alleen door editor admin aangemaakt.
- E-mail is verplicht, uniek en case-insensitive genormaliseerd.
- Game users starten bij registratie met `pending_verification`.
- Volledige gamefuncties vereisen e-mailverificatie.
- Editor admin moet geverifieerd en actief zijn voordat editor-toegang werkt.
- Editor-auth en game-auth blijven strikt gescheiden.
- Kruistoegang moet falen.

## Fase 5 editorlayout

Kevin heeft deze layout bevestigd:

- links: `Node Library`;
- midden: tabbed main area met `Node Canvas` en `Viewport / World Preview`;
- rechts: `Inspector` en `Validation`;
- onder: `History`;
- dock tabs: `Asset Panel`, `Audio Panel`, `HUD Editor`, `Minimap Panel`, `Game Users`.

Regels:

- `Viewport / World Preview` blijft leeg tot latere nodes/world/runtime data iets plaatsen;
- geen dummy wereld, dummy assets of nepcontent;
- geen hard-coded camera, lighting, minimap, audio, HUD, NPC, quest, price, item, boss of route;
- `Game Users` vereist editor scope met `editor_admin`.

## Wat is aangemaakt of bijgewerkt

Root:

- `.gitignore`
- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `tsconfig.json`
- `scripts/check-workspace-boundaries.mjs`
- `ops/env/gk.example.env`

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
- `db/migrations/0001_auth_foundation.sql`
- `db/seeds/0001_initial_editor_admin.sql.template`
- `tests/workspace-boundaries.test.mjs`
- `tests/auth-boundaries.test.mjs`
- `docs/architecture/workspace-boundaries.md`
- `docs/architecture/auth-boundaries.md`
- `docs/architecture/editor-shell.md`
- `docs/design/phase-plan/current-phase.md`
- `README/current-phase.md`

Fase 5 aanvullingen:

- `packages/shared-ui/src/editor-layout.ts`
- `apps/editor-web/src/editor-shell.ts`
- `apps/editor-web/src/node-canvas.ts`
- `apps/editor-web/src/world-preview.ts`
- `apps/editor-web/src/panels.ts`
- `apps/editor-web/src/game-user-management.ts`
- `apps/api-server/src/editor-game-user-management.ts`
- `tests/editor-shell.test.mjs`

## Database/migraties

Fase 4 voegt schema-only migraties toe voor:

- `editor_users`
- `editor_roles`
- `editor_user_roles`
- `game_users`
- `game_user_status`
- `sessions`
- `player_profiles`
- `characters`
- `email_verification_tokens`
- `password_reset_tokens`
- `audit_log`

Geen productie-data of echte credentials in migraties. De admin seed-template gebruikt alleen buiten-Git env placeholders.

## API routes en scopes

Fase 4 routecontracten blijven leidend voor:

- editor login/logout/me;
- game register/login/logout/me;
- email verification request/confirm;
- password reset request/confirm;
- editor game-user list;
- editor game-user status update.

Scope-regels:

- editor routes vereisen editor session;
- game routes vereisen game session;
- editor game-user beheer vereist `editor_admin`;
- game session mag niet in editor;
- editor session mag niet automatisch player endpoints gebruiken;
- publieke auth routes gebruiken generieke responses zonder account-enumeratie.

Fase 5 voegt een API-helper toe voor editor game-user beheer. Deze helper gebruikt de Fase 4 routecontracten en geeft alleen toegang wanneer de sessie editor scope en `editor_admin` heeft.

## Editor shell, canvas, viewport en panels

Editor shell:

- editor login/session entry gebruikt editor-auth routes;
- hoofd-layout is modulair en niet monolithisch;
- dock layout is een model dat later door UI-rendering gebruikt kan worden.

Node Canvas:

- start met lege canvas state;
- heeft editor-grid/raster;
- bevat alleen generieke capability-definities voor schema, asset reference, validation en publish;
- bevat geen concrete gameplay nodes.

Viewport / World Preview:

- staat als aparte main tab naast Node Canvas;
- status is `empty`;
- wacht op gepubliceerde world-node data;
- bevat geen world objects, assets, audio, camera of lighting.

Panels:

- `Node Library`, `Inspector`, `Validation`, `History`, `Asset Panel`, `Audio Panel`, `HUD Editor`, `Minimap Panel`, `Game Users` bestaan als generieke capabilities;
- `Asset Panel` leest later asset inventory en wijst geen runtime-rollen toe;
- `Audio Panel` houdt de audio-gate open wanneer audio count 0 is;
- `HUD Editor` en `Minimap Panel` leggen geen definitieve waarden of layout vast;
- `Game Users` vereist editor scope met `editor_admin`.

## Content- en assetgrens

Niet toegevoegd:

- assets;
- data;
- secrets;
- dummy content;
- concrete gamecontent;
- runtime-hardcoded NPCs, quests, prijzen, camera, lighting, minimap, boss, item, route, HUD of audio-keuzes.

De startcode bevat alleen generieke boundaries, registries, primitives, env-readers en auth/database capabilities.

## Checks

Eerder Git-side uitgevoerd:

- Repo-bronnen geopend via GitHub connector.
- Fase 4-relevante workspacebestanden lokaal gecontroleerd.
- Root workspace-structuur gecontroleerd.
- Starter file size scan: sourcebestanden blijven klein.
- ASCII-scan op nieuwe workspacebestanden: OK.
- Secret/content scan op `apps/`, `packages/`, `db/`, `docs/architecture/`, `tests/`, `scripts/` en workspace-configs: geen echte secrets/assets/data/concrete runtimecontent gevonden.
- `node --experimental-strip-types --test tests/*.test.mjs`: OK.
- `node scripts/check-workspace-boundaries.mjs`: OK.
- `node --experimental-strip-types --check` op alle `apps/**/*.ts` en `packages/**/*.ts`: OK.
- `npm test`: OK.
- `npm run lint`: OK.
- Migratie- en seed-template scans: OK.
- Migratiestructuur-scan op tabeldefinities en statements: OK.

Eerder server-side door Codex afgerond voor Fase 3/Fase 4:

- `pnpm install`: OK.
- `pnpm build`: OK.
- `pnpm typecheck`: OK.
- `pnpm test`: OK met Node 22 via `npx -p node@22`.
- `pnpm lint`: OK.
- MySQL actief.
- Database `gk` aanwezig.
- User `gk_app@127.0.0.1` aanwezig.
- Runtime DB-connectie OK.
- `db/migrations/0001_auth_foundation.sql` succesvol toegepast.
- Vereiste tabellen aanwezig: `editor_users`, `editor_roles`, `editor_user_roles`, `game_users`, `game_user_status`, `sessions`, `player_profiles`, `characters`, `email_verification_tokens`, `password_reset_tokens`, `audit_log`.
- Admin seed secret/temp password/hash staan buiten Git in `/etc/gk/secrets/initial-editor-admin.env`.
- Admin `k3v1nc0@hotmail.com` bestaat, is actief en heeft geverifieerde e-mail.
- Rol `editor_admin` is gekoppeld.
- `admin.seed` auditregel is aanwezig.
- Database/auth smoke tests: OK.
- Server-side Git status bleef schoon.

Fase 5 Git-side uitgevoerd:

- `npm test`: OK.
- `npm run lint`: OK.
- `node --experimental-strip-types --check` op `apps/**/*.ts` en `packages/**/*.ts`: OK.
- Secret/content scan op Fase 5 editor shell, docs en tests: OK.
- Asset/dummy-content scan op Fase 5 bestanden: OK.
- Diff-scope controle: alleen Fase 5 editor/API/shared-ui/test/docs/current-phase bestanden.

Niet lokaal uitvoerbaar in deze omgeving:

- `pnpm install`: `pnpm` ontbreekt lokaal en Corepack kan `pnpm-10.12.4.tgz` niet downloaden door registry/proxyblokkade.
- `pnpm build`: niet uitvoerbaar zonder `pnpm install`.
- `pnpm typecheck`: niet uitvoerbaar zonder `pnpm install` en `tsc`.
- `pnpm test`: niet via `pnpm` uitvoerbaar zonder `pnpm install`; fallback `npm test` is wel geslaagd.
- `pnpm lint`: niet via `pnpm` uitvoerbaar zonder `pnpm install`; fallback `npm run lint` is wel geslaagd.
- `npm run build` en `npm run typecheck`: niet uitvoerbaar omdat `tsc` lokaal ontbreekt.

## Open Kevin-input

Geen blokkerende Fase 5-input open.

Latere fases houden hun eigen gates voor GLB-role mapping, UI-assets, audio-assets, concrete content, economy, world settings en runtime services.

## Open Codex-taken buiten Git

Fase 4 database/auth-taken zijn afgerond. Open blijven:

1. Fase 2 servergates verder sluiten zodra echte runtime/build bestaat.
2. Node 22 activeren voor toekomstige `pnpm test` runs of de systeem-Node structureel upgraden vanaf `v18.19.1`.
3. `pnpm install` draaien.
4. `pnpm build` draaien.
5. `pnpm typecheck` draaien.
6. `pnpm test` draaien met Node 22-activatie.
7. `pnpm lint` draaien.
8. API/editor-web starten.
9. Browserconsole controleren.
10. Apache route `/editor` controleren.
11. Editor login smoke test uitvoeren.
12. Game-user beheer smoke test uitvoeren.
13. Viewport/Node Canvas laden controleren.
14. Bestaande sites niet breken.

## Fasebeoordeling

Fase 5 Git-basis is voorbereid met lokale fallbackchecks.

Afgerond voor deze fase:

- editor shell layoutmodel bestaat;
- Node Canvas en Viewport / World Preview zijn aparte main tabs;
- Viewport / World Preview blijft leeg zonder dummy content;
- Fase 5 panels bestaan als generieke capabilities;
- game-user beheer vereist editor scope met `editor_admin`;
- lokale Fase 5 tests, lint en TS syntaxchecks slagen;
- geen generated `dist`, `node_modules`, secrets, assets of data zijn in Git beland;
- er is geen harde Fase 5 Git-basis blocker meer.

Niet verwarren met Fase 2 servervoltooiing: runtime/service/webserverpunten blijven open tot echte runtime/build bestaat.

Niet markeren als volledig browser/server-klaar totdat Codex de `pnpm` build/typecheck/test/lint gate en editor/API runtime smoke gate buiten Git sluit.
