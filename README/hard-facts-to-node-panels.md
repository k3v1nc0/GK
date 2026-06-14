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
- hoe deterministic random streams en procedural generator graphs als engine-capability werken
- hoe procedural preview en bake draft contracts werken

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
- world maps
- zone layout als concrete content
- spawnpoints als concrete content
- path networks als concrete content
- resource distributions als concrete content
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

## Voorproefjes horen in het node-system

Een voorproefje van spelinhoud mag worden voorbereid, maar alleen als node-system werk:

- voeg een node type toe;
- voeg node fields of sockets toe;
- voeg schema's en validators toe;
- voeg een editorpaneel of schema-gegenereerd paneel toe;
- voeg een publish/read-model contract toe;
- voeg echte editor/node-data toe wanneer Kevin die inhoud expliciet bevestigt;
- gebruik neutrale testfixtures alleen in tests.

Niet doen:

- spelinhoud in runtimecode zetten;
- runtime fallback content maken;
- dummy data gebruiken om gameplay te laten lijken alsof het al bestaat;
- testfixtures door de game runtime laten lezen;
- concrete contentwaarden hardcoden omdat het nodeveld nog ontbreekt.

Acceptatieregel: als een concrete waarde nog niet via het node-system instelbaar is, is de juiste oplossing een node type, node field, validator, editorpaneel of publishcontract toevoegen. Pas daarna mag runtime die waarde consumeren via published read-model data.

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
- seed wordt seed input
- procedural graph wordt generator graph editor
- generated output wordt preview/bake draft state

## Procedural generation grens

Procedural generation mag als engine-capability bestaan, maar niet als verborgen contentmaker.

Regels:

- zelfde seed + graph + inputs geeft dezelfde output;
- preview publiceert niets naar runtime;
- bake maakt alleen editor draft data;
- generated entities gebruiken entity/component contracts;
- generated assets gebruiken `asset.reference`;
- generated output blijft candidate totdat editor/publish die expliciet accepteert;
- geen vaste dorpen, NPCs, quests, routes, loot tables, bosses, minimap lagen, camera waardes, lighting presets of world maps hard-coden.

## Acceptatieregel

Als Kevin vraagt: "kan ik dit later instellen zonder AI?" dan moet het antwoord ja zijn voor alle contentwaardes. Als het antwoord nee is, moet er een node type of node field bij komen.

Als Kevin vraagt: "kan ik dezelfde generator opnieuw draaien en dezelfde output krijgen?" dan moet Fase 8.1 dat met seed + graph + inputs aantoonbaar kunnen valideren.
