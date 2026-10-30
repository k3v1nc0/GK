# GK Fases

Deze map bevat fasecontracten voor GK. Een fasecontract is geen losse brainstorm, maar een werkafspraak voor Codex-runs: wat mag wel, wat mag niet, wat moet Kevin zelf controleren, en wanneer GK Code Regisseur de fase moet afkeuren.

## Actieve MMORPG-basis

**Actief plan (sinds 26-10-2026):** [Werkbank-plan](./fases/Werkbank-plan/WERKBANK-PLAN.md). Dit is de enige ingang voor Codex en Claude. Het eerdere v2.3-plan in `fases/MMORPG-basis-v2/` is gesloten en dient alleen als naslag.

Bij een expliciete MMORPG-basis-v2-opdracht gelden het v2-masterplan, de fasekaart en de bijbehorende ADR's boven tegenstrijdige algemene regie-regels hieronder. Dat omvat de tests die de fase als bewijs vereist. Andere fasecontracten worden hierdoor niet gewijzigd.

## Beschikbare fasecontracten / backlog

Deze fasecontracten bestaan als context, backlog of latere richting. Ze zijn niet automatisch actief.

- [AUTHORING VISUAL BUILDER - Fase 1 van 3](./fases/Oude%20basis/AUTHORING-VISUAL-BUILDER-01.md) - Fase 1 implemented, awaiting Kevin acceptance on 2026-10-06.
- [AUTHORING VISUAL BUILDER - Microfase 2](./fases/Oude%20basis/AUTHORING-VISUAL-BUILDER-02.md) - Contextwerkbank, Bouw-overzicht, echte questrelaties en lokale nodepakketten implemented, awaiting Kevin acceptance on 2026-10-07.

- [AUTHORING-04 - Complete visuele authoring voor alle vijf hoofdroutes](./fases/Oude%20basis/AUTHORING-04-Complete-Visual-Authoring.md) - implemented, awaiting Kevin acceptance on 2026-09-11; AUTHORING-04-FIX-01/FIX-02 Zone Canvas packagepoort, FIX-03 authoring-convergence entity/component ownership, and AUTHORING-MIRROR-DEMO microfase 1 Catalog Coverage applied.
- [NODE-02 - Zones, Areas, Entity Composition, Spawns, Travel, Minimap](./fases/Oude%20basis/NODE-02-Zones-Areas-Entity-Composition-Spawns-Travel-Minimap.md) - implemented on 2026-07-19; Kevin acceptance depends on explicit follow-up/microfase. Evidence: [NODE-02 zones composition](./fases/Oude%20basis/evidence/NODE-02-zones-composition/README.md).
- [Fase MMO-01 - Account, Login, WebSocket Live Player Sync en Persisted Player Start](./fases/Oude%20basis/MMO-01-Account-Login-WebSocket-Live-Player-Sync.md)
- [Fase MMO-02 - Real MMO Presence: Andere Players Zien](./fases/Oude%20basis/MMO-02-Real-MMO-Presence-Andere-Players-Zien.md)
- [Fase MMO-03 - Node-Driven Minimap: Bake Image + 2D Live Canvas Markers + Editor Minimap](./fases/Oude%20basis/MMO-03-Node-Driven-Minimap-Bake-Canvas-Overlay.md)
- [Fase 2 - Editor Paint Tools](./fases/Oude%20basis/02-fase2-Editor-Paint-Tools.md)
- [Fase 3 - Path en River Rendering](./fases/Oude%20basis/03-fase3-Path-en-River-Rendering.md)
- [Fase 4 - Collision, Water en Bruggen](./fases/Oude%20basis/04-fase4-Collision-Water-en-Bruggen.md)
- [Fase 4.1 - Performance HUD Node](./fases/Oude%20basis/04-1-fase4-1-Performance-HUD-Node.md)
- [Fase 7 - Dynamic Loading & Unloading van Chunks](./fases/Oude%20basis/07-fase7-Dynamic-Loading-Unloading-Chunks.md)
- [Fase 7.1 - Visible Chunk Loading Proof](./fases/Oude%20basis/07-1-fase7-1-Visible-Chunk-Loading-Proof.md)
- [Fase 8 - Runtime Chunk Culling](./fases/Oude%20basis/08-fase8-Runtime-Chunk-Culling.md)
- [Fase 8.1 - Terrain Visual Chunking](./fases/Oude%20basis/08-1-fase8-1-Terrain-Visual-Chunking.md)
- [Fase 8.2 - Terrain Streaming, Unload en Dispose](./fases/Oude%20basis/08-2-fase8-2-Terrain-Streaming-Unload-Dispose.md)
- [Fase 8.3 - Ground Chunk Streaming Root-Cause Repair](./fases/Oude%20basis/08-3-fase8-3-Ground-Chunk-Streaming-Root-Cause-Repair.md)
- [Fase 8.4 - Laptop Performance Baseline & Runtime Budget Repair](./fases/Oude%20basis/08-4-fase8-4-Laptop-Performance-Baseline.md)
- [Fase 8.5 - Resident Chunk Content Streaming & Chunk Batching Repair](./fases/Oude%20basis/08-5-fase8-5-Resident-Chunk-Content-Streaming.md)
- [Fase 8.6 - Editor/Game World Settings Split, Shadow Repair & Duplicate Chunk Preview Cleanup](./fases/Oude%20basis/08-6-fase8-6-Editor-Game-Settings-Shadow-Repair.md)
- [Fase 8.7 - Editor/Game World Settings Nodes + Shadow/Overlay Repair](./fases/Oude%20basis/08-7-fase8-7-Editor-Game-World-Settings-Nodes.md)
- [Fase 8.8 - Stable Sun Shadows & Debug Overlay Removal](./fases/Oude%20basis/08-8-fase8-8-Stable-Sun-Shadows-Overlay-Removal.md)
- [Fase 8.9 - Kill Ghost Chunk Plane & Shadow Caster Residency Repair](./fases/Oude%20basis/08-9-fase8-9-Ghost-Plane-Shadow-Caster-Repair.md)
- [Fase 9.0 - Shadow System Rebuild & Ghost Chunk Group Removal](./fases/Oude%20basis/09-fase9-Shadow-System-Rebuild.md)

## Afgesloten fasecontracten

- [AUTHORING-01 - Duidelijk beginpunt en contextuele authoringroutes](./fases/Oude%20basis/AUTHORING-01-Intent-Entry.md) - accepted/closed on 2026-09-09.
- [AUTHORING-02 - 3D Object Workflow - geef geselecteerde modellen betekenis](./fases/Oude%20basis/AUTHORING-02-3D-Object-Workflow.md) - accepted/closed on 2026-09-09.
- [AUTHORING-02B - Object Recipe Layout](./fases/Oude%20basis/AUTHORING-02B-Object-Recipe-Layout.md) - accepted/closed on 2026-09-09.
- [AUTHORING-03 - Visuele Quest- en Dialoogtimeline](./fases/Oude%20basis/AUTHORING-03-Quest-Dialogue-Timeline.md) - accepted/closed on 2026-09-10. Bouwblok 3 (branches/parallel/join) blijft buiten scope zolang de vereiste node-types/ports niet bestaan.
- [NODE-01 - Fundering: Referenties, Tokens, Registries, World Assembly](./fases/Oude%20basis/NODE-01-Fundering-Referenties-Tokens-Registries-World-Assembly.md) - accepted/closed on 2026-07-18. Normal publish route is `World Assembly.gameProject -> Game Output.gameProject`; legacy authoring remains hidden/internal/migration-only.

## Regie-regels voor elke fase

1. Werk alleen de fase of microfase uit die Kevin expliciet in het opdrachtblok noemt.
2. Houd editor nodes en Game Output/publish leidend.
3. Voeg geen demo-content of hardcoded wereld toe.
4. Houd visuals en gameplay-regels gescheiden.
5. Laat `/game/` alleen published world data lezen.
6. Voeg geen zware runtime systemen toe zonder fase-opdracht.
7. Volg de testafspraak in [TESTEN.md](./TESTEN.md): werk smoke- en browsertest bij bij elke gedragswijziging en draai ze geïsoleerd bij grote wijzigingen en vóór een fase-oplevering. Kevin test en accepteert zelf.
8. Lever altijd een duidelijke Kevin-testlijst op: wat Kevin moet openen, wijzigen, publiceren en controleren.
9. Voor NODE-01 en later geldt: geen legacy-plus-new authoring workflow. Legacycompatibiliteit mag alleen intern, hidden en migration-only bestaan.

## Opdrachtblok vereist

Elke Codex-run die code moet aanpassen, moet starten vanuit dit blok:

```text
## Concrete taak

Maak:
...

## Bedoelde fase

...

## Wat ik zelf wil kunnen zien/testen

1. ...
2. ...
3. ...

## Wat expliciet niet onder scope valt

- ...

## Extra context

...
```

Zonder ingevuld opdrachtblok mag Codex geen implementatie starten.
