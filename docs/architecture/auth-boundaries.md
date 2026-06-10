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

## Routes

Fase 4 definieert route-contracten voor:

- `editor.login`
- `editor.logout`
- `editor.me`
- `game.register`
- `game.login`
- `game.logout`
- `game.me`
- `email_verification.request`
- `email_verification.confirm`
- `password_reset.request`
- `password_reset.confirm`
- `editor.game_users.list`
- `editor.game_users.status_update`

Editor game-user beheer vereist een editor session met `editor_admin`.

## Registration and verification

Game registratie is publiek open. Nieuwe game users starten als `pending_verification`. Volledige gamefuncties mogen pas beschikbaar komen nadat e-mailverificatie de user naar een toegestane actieve status brengt.

Editorregistratie is niet publiek. Editor users worden later alleen door een editor admin aangemaakt.

De eerste editor admin gebruikt Kevin-bevestigde e-mail `k3v1nc0@hotmail.com`, maar seed password/hash/secret mogen alleen buiten Git worden gezet.

## Password and token policy

De auth contracts volgen deze regels:

- minimaal 15 tekens;
- minimaal 64 tekens maximale lengte ondersteunen;
- spaties/passphrases toestaan;
- geen verplichte hoofdletter/cijfer/special-character-regels;
- geen periodieke verplichte wachtwoordwissel;
- blocklist-hook voor veelgebruikte, zwakke of gecompromitteerde wachtwoorden;
- wachtwoorden nooit plain-text opslaan;
- password reset via random expiring token;
- reset- en verificatietokens alleen hashed opslaan;
- token maar een keer bruikbaar;
- geen security questions.

Hash-algoritme en parameters worden server-side door Codex gekozen en in buiten-Git runtimeconfig vastgelegd.

## Sessions

Sessies:

- roteren na login;
- worden ingetrokken bij logout;
- worden ingetrokken of ongeldig gemaakt bij password reset;
- bewaren alleen token hashes;
- zijn scope-gebonden;
- gebruiken HttpOnly/Secure/SameSite cookies als cookies worden gebruikt;
- vereisen TLS voor login en authenticated pages.

## Audit

Audit logt minimaal:

- editor login;
- admin seed;
- user status changes;
- role changes;
- password reset request/complete;
- failed login throttling events;
- game-user beheeracties door editor admin.

Audit bevat actor, action, target, scope, timestamp en metadata.

## Server-side validatie

Codex heeft de Fase 4 database/auth-validatie buiten Git afgerond:

- `pnpm install/build/typecheck/test/lint` zijn geslaagd;
- `pnpm test` is geslaagd met Node 22 via `npx -p node@22`;
- MySQL is actief;
- database `gk` en user `gk_app@127.0.0.1` bestaan;
- runtime DB-connectie is OK;
- `db/migrations/0001_auth_foundation.sql` is succesvol toegepast;
- alle vereiste auth-tabellen zijn aanwezig;
- admin seed secret/temp password/hash staan buiten Git in `/etc/gk/secrets/initial-editor-admin.env`;
- editor admin `k3v1nc0@hotmail.com` bestaat, is actief en heeft geverifieerde e-mail;
- rol `editor_admin` is gekoppeld;
- `admin.seed` auditregel is aanwezig;
- database/auth smoke tests zijn geslaagd.

## Open aandachtspunt

Systeem-Node is `v18.19.1`. Toekomstige `pnpm test` runs vereisen Node 22-activatie of een structurele Node-upgrade.
