# GK Fases

Deze map bevat fasecontracten voor GK. Een fasecontract is geen losse brainstorm, maar een werkafspraak voor Codex-runs: wat mag wel, wat mag niet, wat moet Kevin zelf controleren, en wanneer GK Code Regisseur de fase moet afkeuren.

## Actieve fasecontracten

- [Fase 2 - Editor Paint Tools](./02-fase2-Editor-Paint-Tools.md)
- [Fase 3 - Path en River Rendering](./03-fase3-Path-en-River-Rendering.md)
- [Fase 4 - Collision, Water en Bruggen](./04-fase4-Collision-Water-en-Bruggen.md)
- [Fase 4.1 - Performance HUD Node](./04-1-fase4-1-Performance-HUD-Node.md)
- [Fase 7 - Dynamic Loading & Unloading van Chunks](./07-fase7-Dynamic-Loading-Unloading-Chunks.md)
- [Fase 7.1 - Visible Chunk Loading Proof](./07-1-fase7-1-Visible-Chunk-Loading-Proof.md)
- [Fase 8 - Runtime Chunk Culling](./08-fase8-Runtime-Chunk-Culling.md)
- [Fase 8.1 - Terrain Visual Chunking](./08-1-fase8-1-Terrain-Visual-Chunking.md)
- [Fase 8.2 - Terrain Streaming, Unload en Dispose](./08-2-fase8-2-Terrain-Streaming-Unload-Dispose.md)
- [Fase 8.3 - Ground Chunk Streaming Root-Cause Repair](./08-3-fase8-3-Ground-Chunk-Streaming-Root-Cause-Repair.md)
- [Fase 8.4 - Laptop Performance Baseline & Runtime Budget Repair](./08-4-fase8-4-Laptop-Performance-Baseline.md)
- [Fase 8.5 - Resident Chunk Content Streaming & Chunk Batching Repair](./08-5-fase8-5-Resident-Chunk-Content-Streaming.md)
- [Fase 8.6 - Editor/Game World Settings Split, Shadow Repair & Duplicate Chunk Preview Cleanup](./08-6-fase8-6-Editor-Game-Settings-Shadow-Repair.md)
- [Fase 8.7 - Editor/Game World Settings Nodes + Shadow/Overlay Repair](./08-7-fase8-7-Editor-Game-World-Settings-Nodes.md)
- [Fase 8.8 - Stable Sun Shadows & Debug Overlay Removal](./08-8-fase8-8-Stable-Sun-Shadows-Overlay-Removal.md)
- [Fase 8.9 - Kill Ghost Chunk Plane & Shadow Caster Residency Repair](./08-9-fase8-9-Ghost-Plane-Shadow-Caster-Repair.md)
- [Fase 9.0 - Shadow System Rebuild & Ghost Chunk Group Removal](./09-fase9-Shadow-System-Rebuild.md)

## Regie-regels voor elke fase

1. Werk alleen de afgesproken fase of microfase uit.
2. Houd editor nodes en Game Output/publish leidend.
3. Voeg geen demo-content of hardcoded wereld toe.
4. Houd visuals en gameplay-regels gescheiden.
5. Laat `/game/` alleen published world data lezen.
6. Voeg geen zware runtime systemen toe zonder fase-opdracht.
7. Draai `npm run check` en `npm run smoke` als code of publish/dataflow is aangepast.
8. Lever altijd iets op dat Kevin zelf kan inspecteren, testen of bewust afkeuren.
