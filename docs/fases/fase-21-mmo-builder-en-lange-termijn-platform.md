# Fase 21 - MMO builder en lange-termijn platform

## Status

Gepland. Deze fase mag pas geopend worden nadat de kleine authoritative shared-world slice stabiel is.

## Bronbasis

De onderzoeken wijzen dezelfde richting op: GK moet niet eindigen als losse gamecode, maar als onderhoudbare node-driven contentmachine. JSON Schema-achtige validatie, pluginbare nodepackages, migrations, published build immutability en runbooks zijn de basis voor 10+ jaar onderhoudbaarheid.

## Echt doel

Maak van GK een MMO game builder waarin nieuwe content vooral via nodepackages, schemas, migrations, published read models en editorconfiguratie wordt toegevoegd.

## Waarom nu

Na een werkende shared-world slice moet het project schaalbaar worden voor een solo-maker. De core moet stabiel blijven, terwijl content, nodes, migrations en operations gecontroleerd kunnen evolueren.

## Scope

- Plugin/node package spec.
- Node schema registry.
- Editor metadata contract per nodepackage.
- Runtime handler contract per nodepackage.
- Publish validator contract.
- Schema versioning en migration CLI.
- Published build registry en immutability rules.
- Backup/restore runbooks.
- Deploy/rollback runbooks.
- Observability voor publish, room lifecycle, migrations en economy/combat mutations.

## Niet in scope

- Nieuwe concrete gamecontent.
- Nieuwe brede MMO-zones.
- Pluginmechaniek gebruiken om core-architectuurproblemen te verbergen.
- Breaking schema changes zonder migratie.
- Unsigned of ongecontroleerde runtime plugins.

## Verplichte gates

- Core blijft correct als een helper/plugin wordt verwijderd.
- Nodepackages mogen engine-capabilities uitbreiden, maar geen content hard-coden.
- Draft graphs en published builds blijven gescheiden.
- Migrations hebben dry-run, report en rollback plan.
- Backups en restore-drills zijn operationeel beschreven.

## Deliverables

- Plugin/node package spec.
- Schema registry contract.
- Migration CLI plan of implementatie.
- Compatibility test suite.
- Release/rollback runbook.
- Backup/restore runbook.
- Observability checklist.

## Acceptatie

- Een nieuwe nodefamilie kan als package worden toegevoegd zonder core-code als contentcontainer te misbruiken.
- Oude nodegraphs kunnen via migrations naar ondersteunde schema-versies.
- Published builds blijven reproduceerbaar en rollbackbaar.
- Restore-procedure is getest of als blocker expliciet gedocumenteerd.
- Security en supply-chain risico's voor plugins zijn benoemd.

## Prompt 1 - GK Code Copiloot

```text
Je bent GK Code Copiloot in builder/maintenance mode. Werk GitHub-only op main en bewaak core before helpers.

DOEL
Bouw Fase 21 - MMO builder en lange-termijn platform. Maak de node-driven contentmachine onderhoudbaar, migreerbaar en operationeel veilig.

VERPLICHTE BRONNEN
- docs/fases/fase-20-authoritative-gedeelde-wereld.md
- README/node-system-super-dynamic-contract.md
- README/hard-facts-to-node-panels.md
- bestaande schemas, node-types, publish, runtime en server codepaden
- bestaande ops/server documentatie

WERKWIJZE
1. Breng core, helpers, plugins, schemas en published builds in kaart.
2. Ontwerp plugin/node package spec met editor metadata, runtime handler en publish validator.
3. Ontwerp schema versioning en migration flow.
4. Voeg compatibiliteitstests toe voor oude graphs/builds.
5. Beschrijf backup, restore, deploy, rollback en observability.
6. Gebruik helpers alleen bovenop een correcte core, niet als pleister.

ACCEPTATIE
- Pluginbaar node-systeem zonder content-hardcoding.
- Migration flow met dry-run/report/rollback plan.
- Published builds reproduceerbaar.
- Runbooks voor deploy, rollback, backup en restore.
```

## Prompt 2 - Server-side verificatie

```text
Je voert server-side verificatie uit voor Fase 21 - MMO builder en lange-termijn platform.

CONTROLEER
- pnpm build
- pnpm typecheck
- pnpm test
- pnpm lint
- plugin/node package registration tests
- schema migration dry-run en apply tests
- backwards compatibility tests voor oude graphs/builds
- published build immutability checks
- backup/restore drill of expliciete blocker
- deploy/rollback runbook uitvoerbaarheid
- observability voor publish, migrations, rooms en economy/combat mutations

NIET DOEN
- Geen plugin gebruiken om ontbrekende core-architectuur te maskeren.
- Geen concrete content in plugin/runtimecode hard-coden.
- Geen fase afronden zonder migration/rollback/restore bewijs of duidelijke blocker.

RAPPORTEER
- compatibiliteitsstatus;
- migration/rollback bewijs;
- restore bewijs of blocker;
- resterende architectuurschuld voor lange termijn.
```
