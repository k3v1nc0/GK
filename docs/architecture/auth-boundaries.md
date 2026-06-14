# Auth Boundaries

Fase 4 voegt database- en authfundering toe als generieke engine/data capability.

## Scope split

Editor-auth en game-auth zijn strikt gescheiden:

- editor accounts staan in `editor_users`;
- game accounts staan in `game_users`;
- editor roles staan in `editor_roles` en `editor_user_roles`;
- game-user status staat op `game_users.status` en in de `game_user_status` history;
- sessies dragen expliciet scope `editor` of `game`.

Een game user is niet automatisch editor user. Een editor user is niet automatisch player. Een player session is niet geldig voor editor routes en een editor session is niet geldig voor game routes.

## Fase 11 runtime projection routes

Fase 11 editor/admin runtime projection routes vereisen editor scope en `editor_admin`:

- `GET /editor/runtime-projection/status`;
- `POST /editor/runtime-projection/validate`;
- `POST /editor/runtime-projection/project`;
- `GET /editor/runtime-projection/manifests`;
- `GET /editor/runtime-projection/manifests/:id`.

Fase 11 runtime read-only routes:

- `GET /runtime/projection/status`;
- `GET /runtime/projection/manifest`;
- `GET /runtime/projection/records`.

Read-only routes zijn geen editor/admin routes, voeren geen state change uit, lekken geen raw editor draft data en bevatten geen renderer/game client.

## Fase 15 runtime asset reference planning boundary

Fase 15 Runtime Asset Reference Planning Core Git-basis is toegevoegd. Server-side validatie staat nog open.

Regels:

- runtime asset reference planning gebruikt geen editor/admin routes;
- runtime asset reference planning gebruikt geen editor credentials, CSRF token of editor session;
- runtime asset reference planning consumeert alleen Fase 14 runtime scene-plan metadata;
- runtime asset reference planning toont geen raw editor draft/candidate data;
- runtime asset reference planning voert geen state-changing request uit;
- runtime asset reference planning uploadt, laadt, fetcht, wijzigt of verwijdert geen assets;
- runtime asset reference planning bevat geen secrets en geen concrete gamecontent;
- runtime asset reference planning finaliseert geen GLB of asset role mapping;
- runtime asset reference planning bouwt geen asset-loader, renderer draw calls, gameplay, movement, combat, HUD/minimap runtime of audio playback;
- browser-smoke moet asset reference planning marker en empty asset reference plan bevestigen zonder editor/admin route leakage.

## Live auth smoke runbook

Gebruik `docs/ops/server-verification-runbook.md` voor live auth- en route-smokes. Echte editor login via `POST /auth/editor/login` is de voorkeursroute voor live serververificatie, gevolgd door `GET /auth/editor/me` met de editor session cookie.

Browser-smokes gebruiken server-only credentials uit `/etc/gk/secrets/initial-editor-admin.env` en optioneel `/etc/gk/secrets/smoke-users.env`. Git documenteert alleen deze paden en variabelenamen:

- `GK_INITIAL_EDITOR_ADMIN_EMAIL`;
- `GK_INITIAL_EDITOR_ADMIN_TEMP_PASSWORD`;
- `GK_SMOKE_EDITOR_EMAIL`;
- `GK_SMOKE_EDITOR_PASSWORD`;
- `GK_SMOKE_GAME_EMAIL`;
- `GK_SMOKE_GAME_PASSWORD`.

Smoke headers of speciale testheaders mogen alleen worden gebruikt waar ze expliciet geactiveerd zijn en alleen voor deny/contract-smokes. Live verificatie mag niet afhankelijk worden van test-hacks. Secret values mogen nooit worden geprint, in rapporten geplakt, in screenshots/traces zichtbaar zijn of naar Git geschreven.

Game browser-smoke mag alleen met een bestaande smoke user inloggen wanneer die server-side veilig is voorbereid. De Fase 12 runtime shell, Fase 13 render surface, Fase 14 scene assembly en Fase 15 asset reference planning smoke mogen ook zonder game login draaien wanneer `GK_GAME_WEB_ORIGIN` of `GK_GAME_FRONT_DOOR_URL` naar de shellroute wijst. De smoke mag geen account aanmaken, geen GameBible muteren, geen assets uploaden en geen dummy content invoeren.

## Audit

Audit logt minimaal:

- editor login;
- admin seed;
- user status changes;
- role changes;
- password reset request/complete;
- failed login throttling events;
- game-user beheeracties door editor admin;
- publish validation;
- publish snapshot metadata creation;
- publish rollback validation;
- runtime projection validation;
- runtime projection manifest metadata creation;
- runtime projection read-model access;
- runtime client shell status/read-model access;
- runtime render surface status/capability access;
- runtime scene assembly status/plan access;
- runtime asset reference planning status/plan access.

Audit bevat actor, action, target, scope, timestamp en metadata. Fase 15 asset reference planning status bevat geen secrets, geen editor draft data en geen concrete gamecontent.

## Server-side validatie

Codex heeft Fase 4 t/m Fase 14 server-side afgerond waar van toepassing. Fase 15 server-side validatie staat nog open.

Open voor Fase 15:

- build/typecheck/test/lint;
- live route-smokes;
- browser-smoke game/full;
- asset reference planning marker en empty asset reference plan;
- no editor/admin route usage;
- no editor draft/candidate data;
- no asset/GLB/texture/audio load requests;
- no asset byte fetch;
- no definitive asset role mapping;
- no concrete gamecontent;
- no renderer draw calls;
- no gameplay/audio playback;
- worktree schoon.

## Open aandachtspunt

GK gebruikt structureel Node 22 onder `/opt/gk/node-v22`. `/usr/bin/node` is serverbreed bewust op `v18.19.1` blijven staan en is geen GK-blocker zolang GK-services en checks via `/opt/gk/node-v22` lopen.
