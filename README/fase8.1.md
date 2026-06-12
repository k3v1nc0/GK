# Fase 8.1 - Procedural Generation Core

## Status

Fase 8.1 server-side is afgerond en klaar.

Codex heeft install/build/typecheck/test/lint, migratie `0005_procedural_generation_core.sql`, procedural API/editor smoke, determinism smoke en no-runtime-publish/no-asset-copy checks uitgevoerd en bevestigd.

Fase 8 is server-side afgerond en klaar. Fase 9 blijft Fase 9, maar mag pas als implementatiefase starten wanneer Kevin die later opent.

## Waarom

Procedural generation is fundamenteel voor Kevins node-system MMO core.

Het hoort voor world/camera/lighting/minimap nodes, zodat Fase 9 niet op losse handmatige world-data gebouwd wordt. Fase 9 blijft Fase 9, maar moet world/zone/minimap kunnen bouwen op procedural outputs uit Fase 8.1.

## Belangrijke grens

- Procedural generation is een engine-capability in de core.
- Procedural output mag geen hardcoded gamecontent zijn.
- Geen vaste dorpen, NPCs, quests, routes, loot tables, bosses, minimap lagen, camera waardes, lighting presets of world maps hard-coden.
- Generatoren moeten data-driven en deterministic zijn.
- Zelfde seed + zelfde graph + zelfde inputs = zelfde output.
- Server/runtime blijft later authoritative.
- Client mag geen eigen MMO-state verzinnen.
- Fase 8.1 publiceert niets naar Runtime Game.
- Procedural output blijft editor draft/preview/bake data totdat normale publish-flow later expliciet publiceert.
- Geen assets toevoegen aan Git.
- Geen dummy assets.
- Geen concrete gamecontent.
- Geen secrets.

## Git-basis toegevoegd

Fase 8.1 voegt de procedural generation foundation toe aan het node-system:

- procedural graph, generator node en seed contracts;
- world/zone/local seed contracts;
- deterministic random stream contract;
- generation input/output contracts;
- generated draft entity/group contracts;
- generated placement, spawn area, path network, resource distribution en audio candidate contracts;
- generation validation issue contracts;
- procedural preview result en bake draft result contracts;
- deterministic random utility zonder `Math.random` of impliciete tijdbron;
- procedural node families als engine-capabilities;
- editor-only procedural API contracts;
- Procedural Generation Panel state;
- idempotente migratie `0005_procedural_generation_core.sql`;
- Fase 8.1 tests voor determinism, gates, editor-only access en no-runtime-publish.

Fase 8.1 sluit aan op:

- Fase 6 typed node graph core;
- Fase 7 asset library;
- Fase 8 entity/component core.

## Node families

De Git-basis registreert deze procedural node types als engine-capabilities:

- `gk.proc.seed`
- `gk.proc.random`
- `gk.proc.pickWeighted`
- `gk.proc.noise2D`
- `gk.proc.noise3D`
- `gk.proc.scatterAssets`
- `gk.proc.scatterEntities`
- `gk.proc.zoneLayout`
- `gk.proc.pathNetwork`
- `gk.proc.spawnArea`
- `gk.proc.resourceDistribution`
- `gk.proc.validateGeneratedGraph`
- `gk.proc.previewGeneration`
- `gk.proc.bakeGenerationDraft`

Deze nodes maken alleen draft/preview/bake output. Ze publiceren niets naar runtime en vullen geen concrete world, NPC, quest, route, loot, boss, minimap, camera of lighting content in.

## Draft/preview/bake flow

Fase 8.1 gebruikt drie duidelijke staten:

| Staat | Doel | Runtime-effect |
|---|---|---|
| Preview | Laat deterministic generated output zien in editorcontext | Geen runtime publish |
| Bake draft | Maakt editor draft data of een bake draft result | Geen runtime publish |
| Publish later | Latere publishfase compileert expliciet gekozen data naar runtime projections | Alleen wanneer publishfase dit opent |

Preview en bake mogen geen live game-state wijzigen. Bake maakt alleen data die daarna door de normale editor/node/publishketen kan worden gevalideerd.

## Validation gates

Validators bewaken:

- procedural graph vereist seed;
- generator output is draft-only;
- generated entities volgen Fase 8 entity/component schema;
- generated assets gebruiken Fase 7 `asset.reference`;
- generated audio gebruikt `audio.reference` en blijft gated als audio count 0 is;
- generated NPC/combat/player behavior blijft candidate zonder explicit animation mapping;
- generator mag geen runtime publish doen;
- generator mag geen assets naar Git kopieren;
- random output moet deterministic/reproducible zijn met seed;
- missing asset geeft validation issue;
- generated output blijft editor-readable.

## API/editor contract

Fase 8.1 bereidt editor-only routes voor:

- `GET /editor/procedural/graph`
- `POST /editor/procedural/validate`
- `POST /editor/procedural/preview`
- `POST /editor/procedural/bake-draft`
- `GET /editor/procedural/generated`
- `GET /editor/procedural/issues`

State-changing routes blijven CSRF/Origin beschermd. Anonymous en game sessions krijgen geen procedural editor beheer. Geen route uploadt assets, maakt assets aan, kopieert assets naar Git of publiceert naar runtime.

## Database/schema contract

Migratie `0005_procedural_generation_core.sql` is schema-only en voegt toe:

- `editor_procedural_graph_drafts`
- `editor_procedural_generator_node_drafts`
- `editor_procedural_generation_runs`
- `editor_generated_entity_drafts`
- `editor_generated_group_drafts`
- `editor_generated_placement_candidates`
- `editor_generation_validation_issues`
- `editor_generation_bake_draft_results`

De migratie bevat geen inserts, geen concrete assets, geen generated world data en geen runtime publish records. CHECK constraints blokkeren runtime publish en asset-copy waar passend.

## Editor UI contract

Het Procedural Generation Panel heeft state voor:

- seed controls;
- generator graph state;
- preview result state;
- validation issue list;
- bake draft action;
- generated entity/group/placement/spawn/path/resource candidate lists;
- no-runtime-publish badge.

De editor mag generated output tonen als draft/candidate, maar niet als definitieve runtimecontent.

## Acceptatiechecklist

- [x] Procedural generation is opgenomen als core engine-capability in Git.
- [x] Generator output is draft-only in contracts.
- [x] Preview publiceert niets naar runtime in contracts/routes.
- [x] Bake maakt alleen editor draft data of bake draft result in contracts/routes.
- [x] Zelfde seed + graph + inputs geeft dezelfde deterministic signature in tests.
- [x] Andere seed kan andere output geven in tests.
- [x] Generated entities gebruiken Fase 8 entity/component contracts.
- [x] Generated assets gebruiken Fase 7 `asset.reference`.
- [x] Geen concrete gamecontent hard-coded in Fase 8.1 source/tests.
- [x] Geen assets naar Git in Fase 8.1 source/tests.
- [x] Anonymous/game session krijgt geen procedural editor beheer in route contracts/tests.
- [x] Server-side `pnpm install/build/typecheck/test/lint` uitgevoerd.
- [x] Migratie `0005_procedural_generation_core.sql` toegepast.
- [x] Procedural API/editor smoke uitgevoerd.
- [x] Server-side determinism smoke uitgevoerd.
- [x] Server-side no-runtime-publish/no-asset-copy checks bevestigd.

## Fase 8.1 Codex/Claude actie

Afgerond door Codex/Claude:

1. `pnpm install`.
2. `pnpm build`.
3. `pnpm typecheck`.
4. `pnpm test`.
5. `pnpm lint`.
6. Migratie `db/migrations/0005_procedural_generation_core.sql` toepassen.
7. Procedural API/editor smoke uitvoeren.
8. Determinism smoke: zelfde seed + graph + inputs geeft dezelfde output.
9. Different-seed smoke: andere seed mag andere output geven.
10. Confirm no runtime publish.
11. Confirm no asset copy to Git.
12. Bevestigen dat anonymous/game sessions geen procedural editor beheer krijgen.

## Open aandachtspunten

- Fase 9 mag niet starten als losse world/camera/minimap hardcodingfase.
- Fase 9 mag procedural generation gebruiken, maar mag de procedural core niet opnieuw definieren.
- Runtime publish blijft een aparte latere publish-flow.
