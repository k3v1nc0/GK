# Fase 8.1 - Procedural Generation Core

## Status

Fase 8.1 is toegevoegd als nieuwe tussenfase en is nog niet geimplementeerd.

Fase 8 is server-side afgerond en klaar. Fase 8.1 mag pas als implementatiefase starten wanneer Kevin die expliciet opent. Deze fasefile is planning en promptvoorbereiding, geen code- of schematoeslag.

## Waarom

Procedural generation is fundamenteel voor Kevins node-system MMO core.

Het hoort vóór world/camera/lighting/minimap nodes, zodat Fase 9 niet op losse handmatige world-data gebouwd wordt. Fase 9 blijft Fase 9, maar moet world/zone/minimap kunnen bouwen op procedural outputs uit Fase 8.1.

## Vaste regels voor deze fase

- Dit is een 100% nieuw project.
- Alles draait eerst op 1 eigen server onder `/var/www/gk`.
- GK Code Copiloot werkt alleen op `main`.
- GK Code Copiloot maakt geen branches en geen pull requests.
- Codex doet serverwerk buiten Git: OS, MySQL, Redis, Nginx, systemd, secrets, rechten, builds, runtime checks en lokale scans.
- Concrete gamecontent hoort niet in runtimecode.
- Alles wat Kevin maakt, speelt of instelt loopt via Database > Editor/Node-system > Publish > Runtime Game.
- De code mag alleen engine-capabilities bevatten: schemas, node types, validators, renderer/audio/protocol primitives en vaste socket types.
- Waardes zoals camera, licht, geld, prijzen, levels, NPC routes, NPC taken, dialogen, quests, minimap lagen, audio en HUD instellingen moeten node-data zijn.
- 3D wereldobjecten gebruiken bestaande of later door Kevin gemaakte `.glb` assets.
- UI plaatjes en audio mogen in de assetbibliotheek, maar worden ook via nodes gekozen en ingesteld.
- De AI mag geen dummy assets, nepmodellen, tijdelijke vervangers, definitieve namen of definitieve verhaalcontent verzinnen.
- Als verplichte Kevin-input mist, stopt de fase met een duidelijke lijst ontbrekende items.
- Maak geen losse backupbestanden, geen tijdelijke markdown-dumps en geen extra README-bestanden die niet blijvend onderhouden worden.

## Belangrijke grens

- Procedural generation mag als engine-capability in de core.
- Procedural output mag geen hardcoded gamecontent zijn.
- Geen vaste dorpen, NPCs, quests, routes, loot tables, bosses, minimap lagen, camera waardes, lighting presets of world maps hard-coden.
- Generatoren moeten data-driven en deterministic zijn.
- Zelfde seed + zelfde graph + zelfde inputs = zelfde output.
- Server/runtime blijft later authoritative.
- Client mag geen eigen MMO-state verzinnen.
- Fase 8.1 publiceert niets naar Runtime Game.
- Procedural output blijft editor draft/preview/bake data totdat normale publish-flow later expliciet publiceert.

## Fase 8.1 doel

Leg de procedural generation foundation vast in het node-system:

- seeds;
- deterministic random streams;
- generator graphs;
- procedural preview;
- procedural validation;
- draft/bake contract;
- generated entity/component drafts;
- generated groups;
- generated placements;
- generated spawn/resource/path candidates;
- no-runtime-publish gates.

Fase 8.1 moet aansluiten op:

- Fase 6 typed node graph core;
- Fase 7 asset library;
- Fase 8 entity/component core.

## Gewenste node families

- `proc.seed`
- `proc.random`
- `proc.pickWeighted`
- `proc.noise2D`
- `proc.noise3D`
- `proc.scatterAssets`
- `proc.scatterEntities`
- `proc.zoneLayout`
- `proc.pathNetwork`
- `proc.spawnArea`
- `proc.resourceDistribution`
- `proc.validateGeneratedGraph`
- `proc.previewGeneration`
- `proc.bakeGenerationDraft`

Deze nodes zijn engine-capabilities. Ze mogen geen concrete world, NPC, quest, route, loot, boss, minimap, camera of lighting content invullen.

## Gewenste contracts

- procedural graph;
- generator node;
- world seed;
- zone seed;
- local seed;
- deterministic random stream;
- generation input;
- generation output;
- generated draft entity;
- generated draft group;
- generated placement candidate;
- generation validation issue;
- generation preview result;
- generation bake draft result.

## Draft/preview/bake flow

Fase 8.1 gebruikt drie duidelijke staten:

| Staat | Doel | Runtime-effect |
|---|---|---|
| Preview | Laat generated output zien in editorcontext | Geen runtime publish |
| Bake draft | Schrijft editor draft data voor beoordeling en verdere bewerking | Geen runtime publish |
| Publish later | Latere publishfase compileert expliciet gekozen data naar runtime projections | Alleen wanneer publishfase dit opent |

Preview en bake mogen geen live game-state wijzigen. Bake maakt alleen data die daarna door de normale editor/node/publishketen kan worden gevalideerd.

## Generated output contract

Generated output mag alleen verwijzen naar bestaande data-contracten:

- generated entities gebruiken Fase 8 entity/component drafts;
- generated groups gebruiken Fase 8 group/group_transform contracts;
- generated placements zijn candidates totdat editor-data ze accepteert of wijzigt;
- generated assets gebruiken Fase 7 `asset.reference`;
- generated audio mag alleen via `audio.reference` en blijft gated bij audio count 0;
- generated paths, spawn areas en resource distributions zijn candidates voor Fase 9+ nodes.

Geen generated output mag definitieve runtime-content worden zonder normale publish-flow.

## API/editor contract

Fase 8.1 mag editor-only contracten voorbereiden voor:

- procedural graph draft read;
- procedural preview generation;
- procedural validation;
- bake generation draft;
- generated entity/group/placement candidate read;
- generator issue read.

Anonymous en game sessions krijgen geen procedural editor beheer. State-changing procedural routes blijven CSRF/Origin beschermd. Geen route uploadt assets, maakt assets aan, kopieert assets naar Git of publiceert naar runtime.

## Database/schema contract

Als Fase 8.1 schema toevoegt, moet dat schema idempotent zijn waar mogelijk en alleen contractdata bevatten.

Toegestane schemafamilies:

- procedural graph drafts;
- generator node drafts;
- generation run records;
- generated entity draft records;
- generated group draft records;
- generated placement candidate records;
- generation validation issue records;
- bake draft result records.

Niet toegestaan:

- echte gamecontent in migraties;
- inserts met concrete assets;
- vaste dorpen, NPCs, routes, loot, bosses, minimap layers, camera values, lighting presets of world maps;
- runtime publish data als bijproduct van scan/preview/bake.

## Editor UI contract

Fase 8.1 mag editor state voorbereiden voor:

- procedural generation panel;
- seed controls;
- generator graph state;
- preview result state;
- validation issue list;
- bake draft action;
- generated entity/group/placement candidate lists;
- no-runtime-publish status.

De editor mag generated output tonen als draft/candidate, maar niet als definitieve runtimecontent.

## Acceptatiechecklist

- [ ] Procedural generation is opgenomen als core engine-capability.
- [ ] Generator output is draft-only.
- [ ] Preview publiceert niets naar runtime.
- [ ] Bake maakt alleen editor draft data, geen runtime publish.
- [ ] Zelfde seed + graph + inputs geeft dezelfde output.
- [ ] Andere seed kan andere output geven.
- [ ] Generated entities gebruiken Fase 8 entity/component contracts.
- [ ] Generated assets gebruiken Fase 7 asset.reference.
- [ ] Geen concrete gamecontent hard-coded.
- [ ] Geen assets naar Git.
- [ ] Anonymous/game session krijgt geen procedural editor beheer.

## Fase 8.1 Codex/Claude actie

Na Git-basis:

1. `pnpm install`.
2. `pnpm build`.
3. `pnpm typecheck`.
4. `pnpm test`.
5. `pnpm lint`.
6. Migratie toepassen indien Fase 8.1 schema toevoegt.
7. Procedural API/editor smoke.
8. Determinism smoke: zelfde seed geeft zelfde output.
9. Different-seed smoke: andere seed mag andere output geven.
10. Confirm no runtime publish.
11. Confirm no asset copy to Git.

## Prompt voor GK Code Copiloot

Deze prompt is bedoeld voor later, wanneer Kevin Fase 8.1 expliciet opent. Niet uitvoeren tijdens deze docs-only planningstaak.

```text
Start Fase 8.1.

Werkmodus:
- Gebruik GitHub-only repo mode.
- Repo: k3v1nc0/GK
- Gebruik GitHub als bron van waarheid.
- Lees bestanden rechtstreeks uit GitHub.
- Schrijf wijzigingen rechtstreeks naar GitHub main via de beschikbare GitHub write/commit mogelijkheid.
- Niet zoeken naar een lokale git checkout.
- Niet verwachten dat /workspace een git repo is.
- Niet zoeken naar /var/www/gk.
- Niet clonen.
- Geen lokale git commands als vereiste gebruiken.
- Geen branch.
- Geen pull request.
- Werk alleen op main.

Commit-regels:
- Maak bij voorkeur 1 commit.
- Als de GitHub-connector geen single multi-file commit ondersteunt, gebruik dan losse GitHub file-updates.
- Meerdere commits zijn toegestaan als connectorbeperking.
- Houd commits logisch gegroepeerd.
- Rapporteer alle commit hashes.
- Niet blokkeren alleen omdat 1 commit niet mogelijk is.
- Als helemaal geen GitHub write mogelijk is: stop direct.
- Maak geen archive/export als eindresultaat.

Fase:
Fase 8.1 - Procedural Generation Core.

Status:
- Fase 8 is server-side afgerond en klaar.
- Fase 8.1 mag nu starten.
- Fase 8.1 moet alleen Git/code/docs/tests voorbereiden.
- Server-side migratie, build, runtime/API smoke en procedural checks worden daarna door Codex/Claude gedaan.

Belangrijke grenzen:
- Geen assets toevoegen aan Git.
- Geen dummy assets toevoegen.
- Geen fake GLB/UI/audio toevoegen.
- Geen concrete gamecontent verzinnen.
- Geen vaste dorpen, NPCs, quests, routes, loot tables, bosses, minimap lagen, camera waardes, lighting presets of world maps hard-coden.
- Concrete waarden moeten uit asset register, database, editor/node-data, Game Bible of expliciete Kevin-input komen.
- Runtimecode mag alleen engine-capabilities bevatten.
- Alles blijft lopen via Database > Editor/Node-system > Publish > Runtime Game.
- Procedural generation mag alleen engine-capability en editor draft/preview/bake data maken.
- Fase 8.1 publiceert niets naar Runtime Game.
- Client mag geen eigen MMO-state verzinnen.

Doel:
Bouw de procedural generation foundation in het node-system:
- seeds
- deterministic random streams
- generator graphs
- procedural preview
- procedural validation
- draft/bake contract
- generated entity/component drafts
- generated groups
- generated placements
- generated spawn/resource/path candidates
- no-runtime-publish gates

Werk uit:
1. Procedural schema/contracts
- procedural graph
- generator node
- world seed
- zone seed
- local seed
- deterministic random stream
- generation input
- generation output
- generated draft entity
- generated draft group
- generated placement candidate
- generation validation issue
- generation preview result
- generation bake draft result

2. Node families
Voeg generieke node types toe:
- proc.seed
- proc.random
- proc.pickWeighted
- proc.noise2D
- proc.noise3D
- proc.scatterAssets
- proc.scatterEntities
- proc.zoneLayout
- proc.pathNetwork
- proc.spawnArea
- proc.resourceDistribution
- proc.validateGeneratedGraph
- proc.previewGeneration
- proc.bakeGenerationDraft

3. Determinism
- Zelfde seed + zelfde graph + zelfde inputs geeft dezelfde output.
- Andere seed mag andere output geven.
- Gebruik gescheiden deterministic random streams voor world/zone/local scopes.
- Geen runtime-afhankelijke klok, Math.random of niet-deterministische input in generatoroutput.

4. Fase 7/8 integratie
- Generated assets gebruiken Fase 7 asset.reference.
- Generated entities gebruiken Fase 8 entity/component contracts.
- Generated groups gebruiken Fase 8 group/group_transform contracts.
- Audio blijft gated bij audio count 0.
- Geen definitive GLB role mapping automatisch toewijzen.

5. API/editor contracts
- Editor-only procedural graph read.
- Editor-only procedural preview trigger.
- Editor-only procedural validation.
- Editor-only bake draft action.
- Generated candidate read state.
- Anonymous/game session krijgt geen procedural editor beheer.
- State-changing routes blijven CSRF/Origin beschermd.
- Preview/bake publiceert niets naar Runtime Game.

6. Database/migratie
- Voeg idempotente schema's toe indien nodig.
- Geen echte gamecontent in migratie.
- Geen concrete assets of generated worldcontent inserten.
- Geen runtime publish records aanmaken.

7. Editor UI
- Procedural Generation panel state voorbereiden.
- Seed controls voorbereiden.
- Preview result state tonen als draft/candidate.
- Validation issues tonen.
- Bake action maakt alleen editor draft data.
- No-runtime-publish status zichtbaar maken.

8. Tests
Maak tests voor:
- zelfde seed + graph + inputs geeft dezelfde output;
- andere seed mag andere output geven;
- generated entities gebruiken Fase 8 entity/component contracts;
- generated assets gebruiken Fase 7 asset.reference;
- preview publiceert niets naar runtime;
- bake maakt alleen editor draft data;
- geen assets naar Git;
- geen concrete gamecontent/secrets;
- anonymous/game session geen procedural editor beheer.

9. Docs
Update:
- README/current-phase.md
- docs/design/phase-plan/current-phase.md
- README/fase8.1.md
- README/fase9.md indien nodig
- README/node-system-super-dynamic-contract.md indien nodig
- docs/design/content-gates.md indien nodig
- docs/architecture/editor-shell.md indien nodig
- docs/ops/server-layout.md indien nodig

Checks:
- Gebruik beschikbare GitHub/workspace checks.
- Geen lokale git checkout eisen.
- Geen /var/www/gk checks uitvoeren.
- Als server/database/runtime checks nodig zijn, noteer exact wat Codex/Claude daarna moet doen.
- Als build/typecheck/test/lint niet in deze omgeving kan, rapporteer dat als Codex-taak, maar blokkeer GitHub-write niet alleen daarop.

Commit message voorkeur:
feat: add phase 8.1 procedural generation core

Rapport kort:
- gewijzigde bestanden
- alle commit hashes
- procedural schema/contract
- node types
- determinism rules
- editor/API updates
- tests/checks
- open Codex/Claude-taken
- fase-status
```

## Open aandachtspunten

- Fase 8.1 is nog niet geimplementeerd.
- Fase 9 mag niet starten als losse world/camera/minimap hardcodingfase.
- Fase 9 mag procedural generation gebruiken, maar mag de procedural core niet opnieuw definieren.
- Kevin moet Fase 8.1 expliciet openen voordat code/schema/tests voor procedural generation worden toegevoegd.
