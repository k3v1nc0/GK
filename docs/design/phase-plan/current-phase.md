# Current Phase

## Fase

Actieve fase: Fase 4 - Database, migraties, editor-login en game-login.

## Status

Fase-status: Fase 4 Git-basis voorbereid; Codex database migration/seed gate open.

Fase 4 is nog niet volledig klaar zolang Codex de MySQL migraties, admin seed en database/auth smoke tests nog niet server-side heeft uitgevoerd.

## Doel

Fase 4 maakt database- en authfundering met gescheiden editor-login, game-login, game users, player profiles en characters.

De fase legt generieke account/auth-capabilities vast voor:

- editor users en editor roles;
- game users en game-user status;
- sessions met scope;
- player profiles en characters;
- email verificatie en password reset tokens;
- audit logging;
- scoped API-routecontracten.

## Bronnen gecontroleerd

Geopend of gecontroleerd voor deze fase:

- `README/current-phase.md`
- `docs/design/phase-plan/current-phase.md`
- `README/fase4.md`
- `README/fase3.md`
- `README/fase2.md`
- `docs/design/content-gates.md`
- `docs/design/game-bible.md`
- `docs/architecture/workspace-boundaries.md`
- `docs/ops/server-layout.md`
- `README/GameBibleNode.json`
- `package.json`
- `pnpm-workspace.yaml`
- `apps/api-server`
- `apps/editor-web`
- `apps/game-web`
- `packages/schemas`
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
7. Build, migraties en runtime checks uitvoeren zodra tooling bestaat.

## Fase 3-open punten die open blijven

Deze punten blokkeren Fase 4 Git-werk niet, maar blijven Codex-taken:

1. `pnpm install`.
2. `pnpm build`.
3. `pnpm typecheck`.
4. `pnpm test`.
5. `pnpm lint`.

Niet claimen dat de workspace volledig bewezen is totdat deze checks server-side of in een omgeving met registry-toegang zijn geslaagd.

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
- `docs/design/phase-plan/current-phase.md`
- `README/current-phase.md`

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

Routecontracten toegevoegd voor:

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

## Content- en assetgrens

Niet toegevoegd:

- assets;
- data;
- secrets;
- dummy content;
- concrete gamecontent;
- runtime-hardcoded NPCs, quests, prijzen, camera, lighting, minimap, boss, item, route, HUD of audio-keuzes.

De startcode bevat alleen generieke boundaries, registries, protocoltypes, validators, renderer/audio primitives, env-readers en auth/database capabilities.

## Checks

Uitgevoerd:

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

Niet volledig uitvoerbaar in deze omgeving:

- `pnpm install`: niet uitvoerbaar, omdat Corepack de pnpm tarball niet kon downloaden via registry-toegang.
- `pnpm build`: niet uitvoerbaar zonder pnpm install en TypeScript dependency.
- `pnpm typecheck`: niet uitvoerbaar zonder pnpm install en TypeScript dependency.
- `pnpm test`: rootscript niet via pnpm uitvoerbaar zonder pnpm install; de onderliggende Node-test is wel direct uitgevoerd en geslaagd met TypeScript strip-check.
- `npm run build`: niet uitvoerbaar, omdat `tsc` niet lokaal beschikbaar is.
- `npm run typecheck`: niet uitvoerbaar, omdat `tsc` niet lokaal beschikbaar is.
- MySQL migratie-parse/run: niet uitvoerbaar, omdat `mysql` niet lokaal beschikbaar is en databasewerk door Codex buiten Git moet gebeuren.

## Open Kevin-input

Geen blokkerende Fase 4-input open.

Latere fases houden hun eigen gates voor GLB-role mapping, UI-assets, audio-assets, concrete content, economy, world settings en runtime services.

## Open Codex-taken buiten Git

Codex moet na deze commit buiten Git of in een omgeving met registry-toegang uitvoeren:

1. `pnpm install`.
2. `pnpm build`.
3. `pnpm typecheck`.
4. `pnpm test`.
5. `pnpm lint`.
6. MySQL migraties draaien.
7. Admin seed secret buiten Git zetten.
8. Eerste editor admin seed uitvoeren met e-mail `k3v1nc0@hotmail.com`.
9. Runtime env controleren.
10. Database/auth smoke tests draaien op server.
11. Fase 2 servergates verder sluiten zodra runtime/build bestaat.

## Fasebeoordeling

Fase 4 is Git-basis voorbereid, maar nog niet volledig klaar.

Niet markeren als volledig klaar totdat:

- workspace install succesvol is;
- build/typecheck/test/lint via pnpm succesvol draaien;
- MySQL migraties server-side succesvol zijn;
- eerste editor admin seed via buiten-Git env/secret succesvol is;
- database/auth smoke tests op server slagen;
- geen generated `dist`, `node_modules`, secrets, assets of data in Git belanden.

Fase 5 mag pas starten als Kevin accepteert dat Fase 4 nog migration/seed/runtime-gates open heeft, of nadat Codex deze gates sluit.
