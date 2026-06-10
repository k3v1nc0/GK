# Database Boundary

Fase 4 gebruikt deze map voor blijvende migraties en seed-templates voor auth/account engine-capabilities.

Regels:

- Geen productiedata in Git.
- Geen database dumps in Git.
- Geen secrets of credentials in Git.
- Concrete gamecontent wordt later via database, editor/node-data, registers of Game Bible brondata beheerd.
- Migraties mogen alleen schema en generieke engine/account capabilities vastleggen.
- Admin seed templates mogen alleen buiten-Git env placeholders bevatten.

Huidige migraties:

- `db/migrations/0001_auth_foundation.sql`: editor auth, game auth, sessions, player profiles, characters, verification/reset tokens en audit log.

Huidige seed templates:

- `db/seeds/0001_initial_editor_admin.sql.template`: eerste editor admin via buiten-Git env/secret.
