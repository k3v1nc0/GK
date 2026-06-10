# World Settings Plan

## Status

Dit plan bewaakt world, camera, lighting, minimap en HUD/world presentation als editor- en node-data. Er worden in Fase 1 geen concrete waarden gekozen.

Fase-status: documentbasis opgezet, world-input gates open.

## Hoofdregel

World settings lopen via:

`Database > Editor/Node-system > Publish > Runtime Game`

Runtime mag alleen gepubliceerde data consumeren. Runtimecode mag geen concrete camera-, lighting-, minimap-, startgebied- of HUD-waarden invullen.

## Startgebied

Status: Kevin-input vereist.

Het startgebied moet later gekozen of samen uitgewerkt worden voordat:

- world zones definitief worden aangemaakt;
- spawnpoints definitief worden geplaatst;
- camera en lighting contextwaarden worden gekozen;
- minimap view/layers worden ingesteld;
- ambience of music aan de zone gekoppeld wordt.

## Camera

Camera-keuzes zijn node/editor-data.

Geen Fase 1-waarde voor:

- camera stijl;
- afstand;
- hoogte;
- zoom limits;
- smoothing;
- bounds;
- camera collision;
- cinematic behavior;
- shake.

Toekomstige node/schema-structuur:

| Node/schema | Doel |
|---|---|
| `camera.mode` | Moduskeuze via editor |
| `camera.follow` | Follow-target en followgedrag |
| `camera.zoomLimits` | Zoom- en afstandsgrenzen |
| `camera.bounds` | Camera bounds per zone |
| `camera.shake` | Effect capability, waarden uit data |
| `camera.cinematic` | Cutscene/camera moments als data |

Gate: Fase 9 mag camera-capabilities bouwen, maar mag geen definitieve gamecamera hard-coden.

## Lighting

Lighting-keuzes zijn node/editor-data.

Geen Fase 1-waarde voor:

- zonkleur;
- intensity;
- ambient;
- fog;
- sky kleur;
- day/night;
- zone-specific lighting;
- boss/quest lighting.

Toekomstige node/schema-structuur:

| Node/schema | Doel |
|---|---|
| `world.lighting.sun` | Zon/light primitive als data |
| `world.lighting.ambient` | Ambient instellingen als data |
| `world.fog` | Fog settings als data |
| `world.sky` | Sky settings als data |
| `world.dayNightCycle` | Optionele cycle als data |

Gate: lighting mag pas definitief worden wanneer Kevin sfeer, startgebied en visuele richting bevestigt.

## Minimap

Minimap-keuzes zijn node/editor-data.

Geen Fase 1-waarde voor:

- vorm;
- zoom;
- editor layers;
- game layers;
- markers;
- fog of war;
- ontdekte gebieden;
- quest/party marker gedrag.

Toekomstige node/schema-structuur:

| Node/schema | Doel |
|---|---|
| `minimap.definition` | Basismodel voor minimap |
| `minimap.layer` | Layerdefinitie als data |
| `minimap.marker` | Marker capabilities |
| `minimap.editorView` | Editor-only view/layers |
| `minimap.gameView` | Runtime player view/layers |
| `minimap.visibilityRule` | Wanneer iets zichtbaar is |
| `minimap.zoom` | Zoom als data |
| `minimap.fogOfWar` | Fog/discovery als data |
| `minimap.questMarker` | Quest markers via quest data |
| `minimap.partyMarker` | Party markers via party/presence data |

Gate: editor minimap en game minimap mogen verschillen, maar beide moeten uit dezelfde gepubliceerde node-data of afgeleide projections komen.

## HUD en world presentation

HUD/world presentation instellingen zijn node/editor-data.

Geen Fase 1-waarde voor:

- HUD layout;
- panel docks;
- quest tracker placement;
- minimap frame;
- boss health frame;
- merchant/inventory panels;
- audio/HUD feedback.

Toekomstige node/schema-structuur:

| Node/schema | Doel |
|---|---|
| `hud.panel` | Generieke panels |
| `hud.dock` | Dock/placement als data |
| `hud.inventory` | Inventory view |
| `hud.questTracker` | Quest tracker view |
| `hud.abilityBar` | Ability bar |
| `hud.bossHealth` | Boss health UI |
| `hud.minimap` | Minimap HUD host |
| `hud.merchant` | Merchant UI |

Gate: UI assets worden via asset library gekozen. HUD instellingen mogen niet in runtimecode worden vastgezet.

## Validatieregels

Publish/runtime validatie moet later minimaal controleren:

- alle verplichte nodevelden zijn ingevuld voordat content wordt gepubliceerd;
- gekozen assets bestaan in asset library;
- editor-only layers niet in game-only runtime view lekken;
- ontbrekende optionele audio of animaties geven waarschuwingen;
- ontbrekende verplichte world/camera/light/minimap data blokkeert de fase of publish.

## Latere fase-input

Fase 9 moet dit document openen voordat world/camera/lighting/minimap nodes worden gebouwd. Fase 10 moet dit document openen voordat runtime camera, audio, minimap en HUD host gepubliceerde data consumeren.
