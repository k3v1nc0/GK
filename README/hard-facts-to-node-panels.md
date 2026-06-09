# Harde code-feiten worden editor panelen en node types

Dit document voorkomt verwarring tussen enginecode en gamecontent.

## Wat code vast mag weten

De code mag vaste engine-feiten hebben, omdat zonder deze feiten het spel niet kan werken:

- welke socket types bestaan
- hoe nodes gevalideerd worden
- hoe GLB geladen wordt
- hoe audio afgespeeld wordt
- hoe WebSocket berichten werken
- hoe MySQL tabellen heten
- hoe publish compileert
- hoe renderer cameras ondersteunt
- welke light primitives bestaan
- welke collision primitives bestaan
- welke packet types bestaan
- welke component types bestaan
- welke node-field types bestaan

## Wat code niet vast mag invullen

Deze waardes mogen niet vast in runtimecode staan:

- camera afstand
- camera mode van de game
- zonkleur
- lichtsterkte
- fog waarde
- minimap zoom
- minimap markers
- startgebied inhoud
- NPC namen
- NPC routes
- NPC taken
- NPC geluiden
- merchant stock
- prijzen
- geldnaam
- player level curve
- enemy level
- quest tekst
- side quest tekst
- boss mechanics
- attack damage
- cooldowns
- loot kansen
- HUD layout

## Hoe harde feiten zichtbaar worden

Elke engine primitive krijgt een schema. De editor maakt hier automatisch panelen van:

- enum wordt dropdown
- number wordt number input of slider
- bool wordt checkbox
- color wordt color picker
- vector wordt x/y/z input
- asset.glb wordt asset picker
- asset.audio wordt audio picker
- asset.ui wordt UI asset picker
- schedule wordt planning editor
- curve wordt curve editor
- list wordt herhaalbaar veld

## Acceptatieregel

Als Kevin vraagt: "kan ik dit later instellen zonder AI?" dan moet het antwoord ja zijn voor alle contentwaardes. Als het antwoord nee is, moet er een node type of node field bij komen.
