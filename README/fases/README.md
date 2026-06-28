# GK Fases

Deze map bevat fasecontracten voor GK. Een fasecontract is geen losse brainstorm, maar een werkafspraak voor Codex-runs: wat mag wel, wat mag niet, wat moet Kevin zelf controleren, en wanneer GK Code Regisseur de fase moet afkeuren.

## Actieve fasecontracten

- [Fase 2 - Editor Paint Tools](./02-fase2-Editor-Paint-Tools.md)
- [Fase 3 - Path en River Rendering](./03-fase3-Path-en-River-Rendering.md)
- [Fase 4 - Collision, Water en Bruggen](./04-fase4-Collision-Water-en-Bruggen.md)
- [Fase 4.1 - Performance HUD Node](./04-1-fase4-1-Performance-HUD-Node.md)

## Regie-regels voor elke fase

1. Werk alleen de afgesproken fase of microfase uit.
2. Houd editor nodes en Game Output/publish leidend.
3. Voeg geen demo-content of hardcoded wereld toe.
4. Houd visuals en gameplay-regels gescheiden.
5. Laat `/game/` alleen published world data lezen.
6. Voeg geen zware runtime systemen toe zonder fase-opdracht.
7. Draai `npm run check` en `npm run smoke` als code of publish/dataflow is aangepast.
8. Lever altijd iets op dat Kevin zelf kan inspecteren, testen of bewust afkeuren.
