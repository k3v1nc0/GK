# AUTHORING-02 - 3D Object Workflow - geef geselecteerde modellen betekenis

**Documenttype:** uitvoeringscontract voor Codex  
**Status:** accepted/closed on 2026-09-09  
**Repository:** `k3v1nc0/GK`  
**Baseline:** `31d5d21c1e0f2632e39d1af39f912fa1367b4ddc`  
**Afhankelijkheden:** AUTHORING-01B contextfixes, bestaande entity-assembly architectuur, bestaande reference picker en Zone Output plumbing  
**Contractversie:** `authoring-object-workflow-v1.0`

---

## 1. Opdracht

Geef Kevin in de bestaande editor een compacte, deterministische workflow om een echt `model_entity` in de 3D-viewport een gamefunctie te geven:

- Interactable
- NPC
- Enemy
- Quest Target

De editor mag geen tweede owner, tweede meshlaag of tweede transformsysteem introduceren. De workflow moet gebruikmaken van de bestaande node-types en bestaande graphverbindingen.

## 2. Gebruikersflow

1. Kevin selecteert precies één model in de 3D-viewport.
2. De authoringroute `Object of personage` toont de selectie als menselijk label.
3. De sectie `Geef dit object een functie` toont alleen relevante acties.
4. Kevin kiest één functie.
5. De editor toont eerst alleen de minimale invoer die nodig is om de functie te bevestigen.
6. Na bevestiging maakt de editor de noodzakelijke nodes en edges in één graphmutatie.
7. De selectie blijft behouden.
8. De gemaakte functie verschijnt als compacte badge.
9. `Beheren` focust de lokale node of opent de bestaande draft.

## 3. Geldige context

De workflow is alleen actief wanneer:

- precies één geldig `model_entity` geselecteerd is;
- het model in een geldige Zone Canvas Group staat;
- die Zone Canvas een bestaande `Zone Output` heeft.

Bij een rootmodel, een ongeldige selectie of een ontbrekende Zone Output:

- maak niets aan;
- verplaats het object niet automatisch;
- toon duidelijk wat ontbreekt;
- bied een echte navigatieactie naar de juiste Zone Canvas;
- toon geen nepknop of placeholder.

## 4. Recepten

### 4.1 Interactable

Maak of hergebruik:

- `interaction_component.component -> entity_assembly.components`

Velden:

- type
- prompt
- radius
- enabled

Regels:

- maximaal één `interaction_component` per assembly;
- `componentId` blijft intern en wordt niet als verplichte handmatige invoer getoond.

### 4.2 NPC

Maak of hergebruik:

- `npc_component.component -> entity_assembly.components`

Velden:

- NPC Definition picker
- level
- persistence scope

Regels:

- gebruik de bestaande reference picker;
- Kevin typt geen NPC id;
- zonder NPC Definition kan de draft niet bevestigd worden;
- `Open Catalog` moet een echte navigatieactie zijn;
- maak nooit automatisch een npc archetype aan;
- maximaal één `npc_component` per assembly.

### 4.3 Enemy

Maak of hergebruik:

- `enemy_component.component -> entity_assembly.components`

Velden:

- Enemy Definition picker
- level mode
- fixed level wanneer van toepassing
- optionele variant/difficulty references

Regels:

- gebruik de bestaande reference picker;
- Kevin typt geen enemy id;
- zonder Enemy Definition kan de draft niet bevestigd worden;
- `Open Catalog` moet een echte navigatieactie zijn;
- maak nooit automatisch een enemy archetype aan;
- maximaal één `enemy_component` per assembly.

### 4.4 Quest Target

Maak of hergebruik:

- `entity_assembly.entity -> quest_target_binding.entity`
- `quest_target_binding.questTarget -> Zone Output.questTargets`

Velden:

- menselijke naam
- target kind
- action/prompt wanneer relevant
- radius
- visible in game

Regels:

- `targetId` blijft intern en stabiel;
- `zoneRef` en `entityRef` worden waar mogelijk uit de bestaande graph afgeleid;
- maximaal één equivalente quest-target binding per assembly;
- deze fase maakt nog geen questcontent.

## 5. Graphregels

- Hergebruik de bestaande `entity_assembly` voor het gekozen model.
- Maak geen tweede assembly voor hetzelfde model.
- Leg nieuwe ondersteuning compact rond het geselecteerde model.
- Houd de lokale flow leesbaar:
  - `model_entity -> entity_assembly -> Zone Output`
  - componenten compact bij de assembly
  - quest target rechts van de assembly
- De operatie moet idempotent zijn.
- De operatie moet één undo-entry opleveren.
- De operatie moet volledig terugrollen wanneer de graph niet geldig is.

## 6. Handmatige acceptatie voor Kevin

1. Open de editor.
2. Ga naar de authoringroute `Object of personage`.
3. Selecteer precies één model in de 3D-viewport.
4. Controleer dat de selectie als menselijke naam zichtbaar is.
5. Open `Interactable maken` en sla op.
6. Controleer dat de selectie behouden blijft en dat er precies één `interaction_component` verschijnt.
7. Open `NPC maken`, kies een bestaande NPC Definition en sla op.
8. Controleer dat `Open Catalog` echt naar de catalogus kan navigeren wanneer geen reference gekozen is.
9. Open `Enemy maken`, kies een bestaande Enemy Definition en sla op.
10. Controleer dat NPC en Enemy niet samen actief worden als de huidige architectuur dat niet toestaat.
11. Open `Quest Target maken` en sla op.
12. Controleer dat de Zone Output quest-target edge en de entity-assembly edge beide aanwezig zijn.
13. Selecteer een root of ongeldige selectie en controleer dat alleen de uitleg en echte navigatieactie verschijnen.
14. Herhaal dezelfde functieactie en controleer dat er geen duplicaten worden aangemaakt.

## 7. Buiten scope

- geen nieuwe contenttypes;
- geen tweede editor;
- geen runtime questlijn;
- geen nieuwe publishroute;
- geen algemene redesign van de editor;
- geen extra serverchecks of brede testloop.

