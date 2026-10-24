# ADR-008 - Gepinde release, additive migratie en rollbackgrens

**Status:** voorgesteld. **Context:** `src/server/graph-repository.js:1192-1250` heeft een gepubliceerde JSON-row en history; er is geen verifieerbare deploy/IaC in de actuele boom. Code-rollback na destructieve DB-migratie kan corruptie veroorzaken.

**Besluit:** release = codeversie + compiler-/protocolversie + DB-migratiehead + immutable build-ID. Deploy volgorde: backup, additieve migratie, nieuwe release klaarzetten, readiness, drain oude joins, pointer switch, smoke, observatie. Actieve sessie houdt gepinde build en krijgt een duidelijke upgradegrens; incompatible client krijgt updatecode. Code-only rollback alleen als schema achterwaarts compatibel is; anders geteste DB+assetrestore met onderhoudsvenster. Readiness, metrics en logs zijn releasegates.

**Alternatieven:** in-place bestandoverschrijving, hot code reload en schemacontractie in een deploy zijn sneller maar onveilig. **Gevolgen:** extra schijfruimte voor oude builds/backups; expliciet onderhoud bij incompatibele release. **Toets:** F3-E2-T02/T03, F7-E2-T01..T03, F7-E3-T02. **Herzien als:** sessieoverdracht naar nieuwe build bewezen en nodig is.
