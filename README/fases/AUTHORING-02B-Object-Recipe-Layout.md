# AUTHORING-02B - Object Recipe Layout

**Status:** accepted/closed on 2026-09-09  
**Scope:** layout van object-recipe nodes en nieuw geplaatste asset-modellen binnen bestaande Zone Canvas graph

## Doel

Wanneer een model uit Assets in de viewport wordt geplaatst of via `Geef dit object een functie` een functie krijgt, moet de nodeflow direct leesbaar staan:

- model/componenten links;
- `entity_assembly` in het midden;
- `quest_target_binding` tussen assembly en output;
- `Zone Output` rechts als eindpunt.

## Regels

- Geen algemene graph auto-layout.
- Geen nieuwe node-types.
- Geen automatische frames of groepen in deze stap.
- Geen runtime-, database- of publish-herbouw.
- De recipe-mutatie blijft een bestaande graph restore met dezelfde undo-entry.
- Verwijderen houdt het model zichtbaar en plaatst het niet achter `Zone Output`.

## Kevin acceptatie

1. Sleep een model uit Assets in de viewport.
2. Controleer dat de model-node links van `Zone Output` staat.
3. Maak `Interactable`.
4. Controleer: `model_entity` en `interaction_component` links, `entity_assembly` midden, `Zone Output` rechts.
5. Klik opnieuw `Interactable beheren` en sla zonder duplicaten op.
6. Verwijder `Interactable`.
7. Controleer dat het model links van `Zone Output` blijft en dat `Undo`/`Redo` de layout terugzet.
8. Herhaal met hetzelfde object en met een nieuw asset-drop model.
