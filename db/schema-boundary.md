# Database Boundary

Fase 3 maakt alleen de database-map aan als toekomstige migratieplek.

Regels:

- Geen productiedata in Git.
- Geen database dumps in Git.
- Geen secrets of credentials in Git.
- Concrete gamecontent wordt later via database, editor/node-data, registers of Game Bible brondata beheerd.
- Migraties mogen pas concrete tabellen of velden vastleggen wanneer de bijbehorende fase en node-contracten dat vragen.

