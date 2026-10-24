# ADR-006 - Een wereld, Regions en afgeleide Cells

**Status:** voorgesteld. **Context:** `apps/web/public/shared/world-runtime.js` bevat chunkloading; oud F2 introduceert Region/Area/Cell en oud F3 verwacht navmesh. Bestaande `player_positions` in migratie 003 zijn REAL worldposities.

**Besluit:** een gepubliceerde World bevat niet-overlappende Regionowners, overlappende betekenis-Areas en 64 m globale, afgeleide Cells. Authoring bewaart vanaf F4 integer mm; legacy schaal wordt gemeten vóór eenmalige conversie. Surface/collider/walkable is een gedeeld compilecontract voor movement en latere navmesh. Een server world-instance is de authoritygrens; Region is **niet** automatisch een proces of shard. Preview is een afzonderlijke server-side instance met default-deny PersistencePort en een draftbuild.

**Alternatieven:** elke Region als aparte shard (onnodige handoff), alleen client-preview (kan echte state muteren), navmeshauthoring los van collision (tegenspraak). **Gevolgen:** Region/Area-geometrie en negatieve Cellgrenzen vragen exacte tests; dynamische wereldwijzigingen starten nieuwe build/instance in plaats van live mutable terrain. **Toets:** F4-E1-T01..T03, F4-E2-T01/T02, F4-E3-T01. **Herzien als:** worldafmetingen integergrenzen overschrijden of gemeten Cellstreaming faalt.
