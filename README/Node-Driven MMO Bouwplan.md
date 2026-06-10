Node-Driven MMO Bouwplan voor Game GK
Onderzoekskader
Ik heb je vraag benaderd als een volledig nieuw ontwerp- en uitvoeringsvraagstuk: niet als “een beetje opschonen”, maar als het neerzetten van een architectuur die vanaf de bron database- en node-gedreven is, die save en publish van elkaar scheidt, en die uiteindelijk eindigt in een echt speelbare MMO met co-op questing, realtime zichtbaarheid van andere spelers, een begin-quest en een eindbaas. In deze sessie kon ik de geselecteerde GitHub-repository k3v1nc0/GK en de eerder genoemde uploads niet uitlezen via de beschikbare paden, dus de functionele basis hieronder is jouw expliciete eisenpakket uit het gesprek, gevalideerd tegen officiële documentatie van de kernbouwstenen die hiervoor het meest relevant zijn.

Mijn hoofdconclusie is scherp: jouw doel is haalbaar, maar alleen als je een harde grens trekt tussen engine-code en spelinhoud. De engine blijft code. De inhoud wordt volledig node-data. Dat betekent concreet: de editor bewaart de bron-graaf in de database, een preview-laag projecteert die graaf realtime voor de editor, en een publish-stap compileert die bron naar een lichte runtime-projectie voor game-client en MMO-server. Die tussenlaag is geen luxe, maar de voorwaarde om browser en mobiel licht te houden; Three.js leunt daarbij juist op draw-call-reductie via InstancedMesh, shader-voorcompilatie via compileAsync(), assetcompressie via glTF-extensies en runtime-monitoring via renderer.info, terwijl React Flow en Yjs vooral authoring- en synchronisatieblokken bieden en niet bedoeld zijn als per-frame game-runtime. 

De belangrijkste ontwerpregel voor jouw project zou ik daarom zo formuleren: alles wat content is, moet node-driven zijn; alles wat uitvoering is, moet een vaste, herbruikbare engine-service zijn. Dus: wereldopbouw, NPC’s, dialogen, quests, HUD-layouts, loot, boss-fases, spawnregels, variabelen en verhaal horen in nodes. Maar renderen, netcode, authenticatie, opslag, asset-ingest, quest-executie, combat-resolutie en publish-compile horen in code. Zonder die grens krijg je geen onderhoudbaar project, geen stabiele performance, en uiteindelijk juist méér harde code in plaats van minder.

Stackkeuzes die het beste passen
Voor de weblagen is een combinatie van React + Vite + TypeScript de meest logische basis. React documenteert op dit moment versie 19.2 in de officiële documentatie, Vite scaffoldt direct React- en React+TypeScript-projecten, en de huidige Vite-documentatie vereist Node.js 20.19+ of 22.12+. De Node.js releasepagina laat bovendien zien dat op 8 juni 2026 Node 24 en 22 LTS zijn, terwijl Node 20 EOL is; voor productie moet je dus op een LTS-tak pinnen. Mijn praktische advies: pin minimaal op een ondersteunde LTS-tak en leg dat hard vast in tooling, .nvmrc of engines, zodat zowel GK Code Copiloot als Codex exact dezelfde runtime gebruiken. 

Voor het MMO-deel past Colyseus opvallend goed op jouw wensenlijst. De officiële documentatie toont niet alleen examples voor Three.js, maar ook de bouwstenen die jij expliciet nodig hebt: state synchronization, ingebouwde room-authenticatie, reconnect-afhandeling, lobby/room-listing, Presence voor inter-process communicatie, en live room-updates via LobbyRoom. Daarbij is de nuance belangrijk: LocalPresence is voldoende voor een single-process setup, maar zodra je op dezelfde machine naar meerdere processen of clustering gaat, heb je RedisPresence nodig. Dat is precies de schaalpad-logica die jij zoekt: eerst op één server starten, later op diezelfde server naar meerdere processen doorgroeien zonder het hele model om te gooien. Reconnect-ondersteuning via allowReconnection() is bovendien heel waardevol voor mobiele spelers met tijdelijke netwerkdrops. 

Voor jouw aparte editor-login zou ik niet de volledige editor-beveiliging ophangen aan @colyseus/auth. Dat module is volgens de officiële documentatie nog beta, en het levert zelf geen database- of e-mailfunctionaliteit; het geeft callbacks en flow, maar jij moet zelf opslag en berichten afhandelen. Voor game-room-auth is Colyseus prima inzetbaar; voor editor-backoffice en user-management is een eigen API-authlaag met rollen, sessies en JWT’s robuuster en beter voorspelbaar. 

Voor de 3D-runtime is Three.js met een glTF/GLB-only pipeline inhoudelijk de juiste keuze. De Khronos glTF-documentatie beschrijft glTF juist als een transmissieformaat voor runtime-applicaties, met scene-structuur in compacte JSON en 3D-data in een vorm die direct door grafische API’s gebruikt kan worden. Three.js’ GLTFLoader ondersteunt glTF 2.0 én belangrijke extensies voor performance en productiegebruik, waaronder KHR_draco_mesh_compression, KHR_meshopt_compression, KHR_texture_basisu en EXT_mesh_gpu_instancing. InstancedMesh verlaagt draw calls voor herhaalde objecten; TransformControls ondersteunt exact de modi die jij noemt — translate, rotate en scale — plus snapping; Raycaster is bedoeld voor picking/selectie; en WebGLRenderer biedt zowel compileAsync() tegen shader-stotteren als renderer.info voor runtime-statistieken. Dat is precies de combinatie die je nodig hebt als je een lege wereld in de editor wilt opbouwen uit nodes, en herhaalde GLB-objecten zo licht mogelijk wilt renderen op mobiel en browser. 

Voor de node-editor zelf is React Flow inhoudelijk het beste passend. De officiële examples laten zien dat een graph opgeslagen en hersteld kan worden via toObject(), dat er een collaborative graph-voorbeeld is met Yjs en y-websocket, en dat er voorbeelden bestaan voor undo/redo en selection grouping. Maar hier zit een belangrijke zakelijke valkuil: de undo/redo- en selection-grouping-voorbeelden staan expliciet als Pro-voorbeelden met een aparte licentie. Mijn advies is daarom: gebruik React Flow als open core voor je eigen editor, maar implementeer geschiedenis, grouping en multi-select-logica zelf op basis van publieke APIs en je eigen domeinmodel, of neem bewust een betaalde licentie als je dat traject wilt versnellen. Niet “stiekem nadoen” door code uit een Pro-voorbeeld over te nemen. 

Als je later echt samen aan dezelfde graph wilt werken, is Yjs de best passende optionele laag. Yjs documenteert gedeelde types, automatische synchronisatie, awareness/presence, offline support en netwerkagnostische providers. Dat maakt het uitstekend voor multi-user editor-sessies. Maar mijn advies voor jouw project is om Yjs niet in fase één verplicht te maken. Eerst moet de single-user editor, draft/publish, asset-pipeline en MMO-runtime staan. Pas daarna, als de authoring-flow stabiel is, heeft realtime co-authoring echte waarde. Anders bouw je te veel complexiteit voordat de kern van het spel draait. 

Voor de datalaag en publicatiepipeline is MySQL 8.4 prima bruikbaar, mits je niet in de val loopt van “één gigantische JSON-kolom voor alles”. MySQL documenteert dat de native JSON-type automatische validatie en geoptimaliseerde opslag biedt, en dat gegenereerde kolommen zowel virtueel als opgeslagen kunnen zijn en geïndexeerd kunnen worden. Dat is cruciaal voor jouw use case: de bron-graaf kan JSON-achtig zijn, maar hot query fields zoals project_id, node_type, asset_id, published_version_id, quest_slug of npc_slug moeten expliciet indexeerbaar blijven. Voor CPU-zwaardere taken zoals asset-analyse, graph-compile of path-building zijn worker_threads logisch, juist omdat Node ze positioneert voor CPU-intensieve JS-operaties. Voor operatie en deployment op één server passen PM2 en Playwright goed: PM2 kan meerdere apps en clusterprocessen beheren en bij boot herstellen, terwijl Playwright meerdere lokale webservers tegelijk kan starten en device-/viewport-configs ondersteunt. 

Voor je dockbare editor- en HUD-panelen heb je ten slotte een serialiseerbaar dockingmodel nodig, niet een verzameling losse React-componenten zonder layoutcontract. De GoldenLayout-documentatie laat precies de primitieve bouwstenen zien die hier relevant zijn: layout-configuraties, item-configs voor componenten/rows/columns/stacks, tabs, headers en zelfs popup windows. Mijn advies is wel om dit achter een eigen adapterlaag te zetten, zodat je HUD-layout-data niet direct gelockt raakt aan één externe library. 

Doelarchitectuur voor een volledig node-driven MMO
De architectuur die ik je aanraad is deze:

text
Kopiëren
Database
  ├─ draft graph
  ├─ draft variables
  ├─ asset library
  ├─ editor users
  ├─ player users
  └─ published releases

Editor
  ├─ node graph canvas
  ├─ realtime draft preview
  ├─ 3D world viewport
  ├─ HUD builder
  ├─ asset library
  └─ publish action

Publish compiler
  ├─ symbol table for @variables
  ├─ world projection
  ├─ npc projection
  ├─ quest projection
  ├─ dialogue projection
  ├─ hud projection
  └─ runtime manifests

Game
  ├─ game-web client
  ├─ realm server
  ├─ persistent player state
  ├─ zone/room state
  └─ co-op quest and combat systems
Het centrale principe is dat draft en published twee verschillende waarheden zijn. “Save” schrijft alleen de draft-bron weg: nodes, edges, node-data, variabelen, layout, assetreferenties, editorhistorie. “Publish” draait daar een compiler overheen en maakt een immutable published release met lichte runtime-projecties. De game-client en de MMO-server lezen nooit direct de rauwe editor-graaf. Daardoor kun jij in de editor realtime zien wat je bouwt, terwijl spelers pas na publish een consistente release zien. Dat patroon sluit direct aan op React Flow’s serialiseerbaarheid en op Three.js’ behoefte aan lichte runtime-data in plaats van een zware authoring-graaf die per frame geïnterpreteerd wordt. 

De 3D-wereld moet in jouw geval GLB-only zijn voor wereldinhoud, NPC’s, props, gebouwen en interactieve objecten. De nuance is wel belangrijk: je “geen 2D”-regel is technisch logisch voor de world asset pipeline, maar niet voor de HUD zelf. De HUD blijft het beste een React/DOM-laag, omdat docken, slepen, tabs, loskoppelen, device-responsiveness en accessibility daarmee veel stabieler en goedkoper zijn. De gamewereld blijft dus GLB-only; de HUD is node-driven qua inhoud en layout, maar blijft UI-technisch geen 3D-mesh. Voor NPC’s is GLB geen beperking, omdat glTF ook skinning, joints, weights en animatie bevat; dat is precies hoe je geanimeerde characters netjes door je pipeline laat lopen. 

Voor je MMO zou ik de wereld niet als één onbeperkte room modelleren. Op één server is de beste route: zones of wereldsegmenten als eigen room/realm, eventueel plus aparte encounter-rooms voor boss-fights of instanced gebeurtenissen. Begin met single-process en LocalPresence; zodra je meerdere Node-processen op dezelfde machine nodig hebt, zet je lokaal Redis aan en stap je over op RedisPresence, terwijl PM2 cluster en ecosystem files de processen beheren. Je blijft dan nog steeds binnen jouw wens “alles op één server in /var/www/gk”, maar zonder jezelf op te sluiten in een fragiele single-process runtime. 

Voor selecting, verplaatsen, roteren en schalen in de editor zou ik de 3D-view als een volwaardige authoring-surface behandelen. Raycaster geeft picking; TransformControls ondersteunt translate/rotate/scale en snapping; en voor herhaalde wereldobjecten kun je al in preview en runtime voordeel halen door repeated statics via InstancedMesh te bundelen. Dat is precies de lijn die past bij jouw eisen “alles moet verplaatsbaar zijn”, “ook in groep”, en “60 FPS ook op mobiel”. 

Een tweede harde scheidslijn die ik zou aanbrengen is tussen editor-identiteit en speler-identiteit. De editor-login krijgt eigen rollen en rechten, eigen schermen voor userbeheer en delete-acties, en een eigen admin-UI. De game-login krijgt character-, party- en roomrechten. Laat de roomserver nooit rechtstreeks vertrouwen op editorcookies; laat hem roomtokens of sessieclaims controleren. Colyseus ondersteunt room-authenticatie, maar de volledige editor-backoffice moet in je eigen API- en sessielaag zitten. 

Datamodel en publicatiemodel dat bij jouw wens past
De kern van je datamodel moet niet “één graaf voor alles” zijn, maar één bronmodel plus meerdere projecties. Ik zou de volgende objecten als ruggengraat nemen: Project, ProjectVersion, NodeGraph, Node, Edge, VariableSymbol, AssetLibraryItem, AssetUsage, DraftProjection, PublishedRelease, PublishedZone, PublishedNpcSpec, PublishedQuestSpec, PublishedDialogueSpec, PublishedHudLayout, EditorUser, PlayerUser, Character, Party, QuestInstance, LootSpec en EncounterSpec. Het gaat er niet om dat elk van die objecten een aparte tabel móét zijn; het gaat erom dat dit de bounded contexts zijn waarmee je voorkomt dat alles in één bestand of één blob eindigt.

Voor jouw @-referenties zou ik geen vrije teksttrucs bouwen, maar een symbol table. Dus niet “zoek in strings naar @naam en hoop dat het goed gaat”, maar: elke node die iets publiceert als bruikbare waarde registreert een symbol-key, bijvoorbeeld @game.name, @npc.blacksmith.name, @quest.begin.title, @hud.party.panelTitle. Bij save sla je brondata op. Bij publish maakt de compiler een symbol table, valideert ontbrekende verwijzingen, detecteert cirkels waar nodig, en schrijft daarna de runtime-projecties weg. Daardoor kunnen dialogen, quests en HUD’s veilig naar elkaar verwijzen zonder fragile stringhackery.

Je undo/redo-systeem moet configurabele diepte krijgen en op snapshots of patches draaien, maar niet simpelweg “de hele editor-state opslaan in één enorme JSON-kolom bij elke muisklik”. React Flow laat zien dat flows goed serialiseerbaar zijn via toObject(), en het undo/redo-voorbeeld gebruikt een snapshot-based history met toetsenbordshortcuts zoals Ctrl+Z en Ctrl+Shift+Z. Dat patroon is bruikbaar, maar in jouw project moet de history worden begrensd, gecomprimeerd en per project/version opgeslagen, zodat de editor vlot blijft en de database niet explodeert. 

Voor de asset library zou ik een ingest-pipeline bouwen die alleen .glb accepteert, metadata extraheert, en een gebruiksregistratie bijhoudt. Three.js’ GLTFLoader ondersteunt compressie- en instancingextensies, en worker_threads zijn juist bedoeld voor CPU-zwaardere JS-taken. Gebruik dus een ingest-worker die het GLB-bestand inspecteert, mesh- en animation-stats leest, fingerprints maakt, thumbnails rendert waar nodig, en alvast bepaalt of instancing/compressie toepasbaar zijn. Op de library-pagina kun je dan precies tonen wat jij wilt: naam, type, aantal keer gebruikt, door hoeveel NPC-archetypes gebruikt, en in welke gepubliceerde release het zit. 

Voor MySQL betekent dit concreet: gebruik JSON waar het helpt, maar haal performancegevoelige velden via generated columns of expliciete indexvelden naar voren. MySQL documenteert expliciet dat JSON-documenten gevalideerd en efficiënt opgeslagen worden, en dat gegenereerde kolommen virtueel of opgeslagen kunnen zijn en indexeerbaar zijn. Voor jouw project zou ik dus hybride modelleren: bron-node-data in JSON, maar project-/type-/slug-/publish-velden expliciet en indexeerbaar. Zo houd je authoring flexibel zonder query-prestaties op te offeren. 

De laatste ontwerpkeuze hier is misschien de belangrijkste: niet elke node hoeft runtime-logica te zijn. Sommige nodes zijn puur declaratief. Een GameNameNode levert een symbool. Een SpawnNpcNode levert een entity-spec. Een QuestNode levert een quest-definitie. Een HudPanelNode levert layout- en databindingsinformatie. De engine-kern vertaalt die data vervolgens naar echte systemen. Dat is precies hoe je “alles moet via de node-system” verenigt met “de game moet licht zijn”.

Faseplan met Codex-acties en volledige GK-prompts
De volgorde hieronder is de veiligste route als je wilt dat er aan het einde geen half systeem staat, maar een testbaar spel. Hij volgt ook logisch uit de tooling: eerst de contracts en werkruimte, dan identiteit en opslag, daarna de editor, dan 3D authoring, dan realtime MMO, dan content en boss-fight, en pas daarna performance en exploitatie. Dat sluit aan op de manier waarop Playwright meerdere services kan opstarten tijdens tests, PM2 meerdere processen kan beheren, Colyseus van single-process naar RedisPresence kan opschalen, en Three.js/GLTF pas echt renderperformance wint als je het publishmodel klaar hebt. 

Werkruimte en contracts

Doel van de fase: een schone, startbare en testbare monorepo neerzetten waarin editor-web, game-web, API en realm-server apart bestaan, maar al wel dezelfde gedeelde types, scripts en kwaliteitsgrenzen gebruiken.

Actie voor Codex: maak op de code-server een schone werkruimte in /var/www/gk, zorg dat alleen deze werkruimte actief is voor de agents, installeer een ondersteunde Node LTS-tak, pnpm, MySQL, Nginx en PM2, maak gitignored env-bestanden aan, en zorg dat editor, game, API en realm-server lokaal apart gestart kunnen worden. Als er al draaiende inhoud in /var/www/gk staat, verplaats die dan eenmalig naar een aparte quarantaine-map binnen /var/www/gk en laat daarna alleen de nieuwe werkruimte actief zijn.

De prompt voor GK Code Copiloot:

text
Kopiëren
Je bent GK Code Copiloot.

Werkregels:
- Werk uitsluitend op branch main.
- Gebruik zo weinig mogelijk commits per taak; bundel logisch werk in maximaal 1 of 2 commits.
- Werk uitsluitend vanuit deze prompt en de huidige repository-inhoud.
- Gebruik geen eerdere sessiecontext, geen oude aannames en geen buiten-repo context.
- Bouw geen harde spelinhoud in code; bouw systemen waarmee spelinhoud later uit database + nodes komt.
- Maak geen losse notitiebestanden of wegwerpdocumentatie. Alleen docs/architecture.md, docs/node-catalog.md en docs/runbook.md mogen bestaan en moeten blijvend nuttig zijn.

Opdracht:
Zet een nieuw TypeScript monorepo op voor een node-driven MMO project in /var/www/gk met pnpm workspaces.

Vereiste structuur:
- apps/editor-web
- apps/game-web
- apps/api
- apps/realm-server
- packages/shared
- packages/node-schema
- packages/content-compiler
- packages/editor-core
- packages/game-runtime
- packages/test-utils
- ops/pm2
- ops/nginx
- tests/e2e

Technische eisen:
- editor-web en game-web op React + Vite + TypeScript
- api en realm-server op Node + TypeScript
- gedeelde tsconfig basis
- lint, typecheck, unit test en e2e scripts
- Playwright configuratie die meerdere lokale services kan starten
- health endpoints voor api en realm-server
- environment validatie
- duidelijke npm/pnpm scripts voor dev/build/test/typecheck
- editor-web en game-web moeten apart startbaar zijn
- editor-web moet al een lege login-shell en lege dashboard-shell tonen
- game-web moet al een lege landing tonen met melding dat er nog geen published release is
- geen echte gamecontent in deze fase

Kwaliteitseisen:
- kleine bestanden, duidelijk per domein gesplitst
- geen catch-all bestand waar alles in wordt gezet
- geen TODO-rijke placeholders zonder werkende basis
- voeg uitsluitend dependencies toe die direct gebruikt worden
- docs/architecture.md moet kort uitleggen wat apps en packages doen
- docs/runbook.md moet alleen de echte start/build/test stappen bevatten

Definition of done:
- workspace installeert zonder errors
- editor-web, game-web, api en realm-server starten lokaal
- health endpoints werken
- lint/typecheck/tests zijn configureerbaar vanuit root
- basis e2e configuratie staat
- gewijzigde bestanden en run-commando’s zijn teruggekoppeld
Datalaag en identiteiten

Doel van de fase: editor-users, player-users, projects, draft-versies, publish-versies en de basis van node-opslag neerzetten, inclusief het harde onderscheid tussen “save draft” en “publish release”.

Actie voor Codex: maak de MySQL-database en database-user aan, voer migraties uit, maak editor-admin credentials aan in een gitignored env- of seedpad, en zet reverse proxy-routes klaar voor editor, game, api en websockets.

De prompt voor GK Code Copiloot:

text
Kopiëren
Je bent GK Code Copiloot.

Werkregels:
- Alleen main branch.
- Zo weinig mogelijk commits; bundel logisch werk.
- Werk alleen vanuit deze prompt en de huidige repository-inhoud.
- Geen harde spelinhoud in engine-code.
- Geen wegwerpdocs; alleen docs/architecture.md, docs/node-catalog.md en docs/runbook.md onderhouden als ze echt veranderen.

Opdracht:
Implementeer de eerste echte back-end laag voor identiteiten, projecten en draft/publish-contracten.

Bouw:
- editor-auth met rollen (minimaal owner, designer, support)
- player-auth met minimaal anonieme speler of simpele accountflow
- aparte sessie/logica voor editor en speler
- user-management scherm in editor voor game users bekijken en verwijderen
- projectbeheer: project aanmaken, openen, opslaan
- draft-versies en published releases als aparte concepten
- basis node graph opslag in database
- auditvelden: created_at, updated_at, created_by, updated_by
- API endpoints voor:
  - editor login/logout/me
  - player session/me
  - projects list/detail/create
  - draft save
  - publish release
  - published release ophalen
  - game users list/delete

Datamodel richting:
- editor_users
- player_users
- projects
- project_versions
- graphs
- graph_nodes
- graph_edges
- published_releases
- asset_library_items (mag nu nog minimale basis zijn)
Gebruik SQL migrations en een duidelijke repository/service laag. Gebruik geen zware magic-ORM die generated columns of JSON-contracten lastig maakt.

Belangrijke functionele regels:
- “save” mag alleen draft opslaan
- “publish” maakt een immutable published release
- game-web leest alleen published data
- editor-web werkt alleen op draft data
- als er nog geen published release is, moet game-web dat tonen zonder fouten

Kwaliteit:
- voeg integratie-tests toe voor auth, draft save en publish scheiding
- update docs/architecture.md met het identity- en publish-model
- houd api-modules per domein gesplitst: auth, users, projects, publish
- geen grote god-service

Definition of done:
- aparte editor en player auth werken
- project kan worden gemaakt
- leeg draft graph kan worden opgeslagen
- publish maakt een release-record
- game-web kan published release ophalen of netjes “geen release” tonen
- user-management voor game users bestaat en delete werkt
Node editor en realtime draft-preview

Doel van de fase: de editor maken zoals jij hem conceptueel wilt: node-canvas als kern, een lege wereld aan het begin, rechter node-palette, variabelen via @, autosave, history en realtime preview — maar nog steeds zonder dat publish direct de game wijzigt.

Actie voor Codex: geen grote serveractie nodig behalve zorgen dat websocket- of realtime kanalen beschikbaar zijn als je preview-events live wilt streamen; de hoofdtaak ligt hier in de repository.

De prompt voor GK Code Copiloot:

text
Kopiëren
Je bent GK Code Copiloot.

Werkregels:
- Alleen main.
- Zo weinig mogelijk commits.
- Werk alleen vanuit deze prompt en de huidige repo.
- Geen harde spelinhoud in code; alle content moet data-driven worden.
- Neem geen code over uit voorbeelden onder aparte betaalde licentie. Gebruik alleen publieke APIs en eigen implementatie.

Opdracht:
Bouw de echte node-editor in editor-web.

UI-indeling:
- linker zone: project/context/inspectie
- midden: node-raster/canvas als primaire werkruimte
- rechter zone: node-palette + node toevoegen + properties van selectie
- wereld/view begint leeg
- niets mag automatisch in de wereld verschijnen zonder node-data

Node-functioneel:
- node registry met categorieën
- custom nodes voor minimaal:
  - GameName
  - StringValue
  - NumberValue
  - BooleanValue
  - VariableReference
  - SceneRoot
  - DialogueText
  - QuestStub
  - HudStub
  - Comment/Group
- elk node-type krijgt eigen schema/validator
- alle nodevelden die tekst/waarde accepteren moeten @-referenties kunnen ondersteunen
- implementeer symbol-voorstellen/autocomplete voor @referenties vanuit bestaande nodes
- laat validatiefouten zichtbaar zien op nodes en in inspector

State en opslag:
- autosave draft graph
- handmatige save knop
- geen game publish-effect bij save
- configureerbare history depth per project of editor user
- Ctrl+Z en Ctrl+Shift+Z moeten werken
- history mag snapshot- of patch-based zijn, maar moet begrensd zijn
- graph moet serialiseerbaar en herstelbaar zijn vanuit database

Realtime draft-preview:
- bouw een draft preview compiler die bij elke wijziging een afgeleide preview-state maakt
- deze preview-state is editor-only
- nog geen echte gameruntime interpretatie; alleen afgeleide preview-data

Belangrijke grenzen:
- gebruik een eigen implementatie voor undo/redo en grouping bovenop publieke React Flow APIs
- kopieer geen betaalde voorbeeldcode
- houd editor-core en node-schema in packages, niet in editor-web zelf

Definition of done:
- node canvas werkt
- nodes toevoegen/verplaatsen/verbinden werkt
- @referenties werken basisniveau
- autosave en restore werken
- Ctrl+Z / Ctrl+Shift+Z werken met begrensde historie
- preview-state wordt live afgeleid
- editor blijft leeg tot nodes inhoud creëren
3D world editor en asset library

Doel van de fase: een echte 3D world-view bouwen waarin alleen jouw eigen .glb-assets gebruikt worden, met selectie, verplaatsen, roteren, schalen, groups, library-statistieken en realtime draft-preview in 3D.

Actie voor Codex: maak lokale directories aan onder /var/www/gk/data/assets en /var/www/gk/data/uploads, zet de juiste rechten, en zorg dat grote assetbestanden niet in Git terechtkomen. Als nodig: maak een lokale worker/service-config voor asset-verwerking.

De prompt voor GK Code Copiloot:

text
Kopiëren
Je bent GK Code Copiloot.

Werkregels:
- Alleen main.
- Zo weinig mogelijk commits.
- Werk alleen vanuit deze prompt en de huidige repo.
- Spelinhoud blijft data-driven.
- Geen 2D wereld-assets pipeline bouwen; world assets zijn GLB-only.
- Houd assets buiten Git; gebruik runtime storage paden onder /var/www/gk/data.

Opdracht:
Implementeer de 3D world editor en asset library.

Asset pipeline:
- accepteer alleen .glb uploads/imports
- valideer bestandstype en basisstructuur
- sla bronbestand op in lokale storage onder /var/www/gk/data/assets/source
- maak processed storage onder /var/www/gk/data/assets/processed
- extraheer metadata:
  - bestandsnaam
  - grootte
  - mesh count
  - material count
  - animation count
  - skin/skeleton aanwezigheid
  - hash/fingerprint
- registreer library item in database
- houd usage counters bij:
  - totaal aantal placements
  - aantal NPC archetypes dat dit asset gebruikt
  - aantal world placements dat dit asset gebruikt

3D editor:
- bouw een Three.js viewport in editor
- wereld start leeg
- nodes creëren de zichtbare world preview
- gebruik picking/selectie met raycasting
- gebruik transform gizmos voor translate/rotate/scale
- voeg snapping toe voor translate/rotate/scale
- ondersteun multi-select
- ondersteun groepselection en groepstransforms
- voeg node-types toe voor minimaal:
  - AssetInstance
  - Transform
  - Group
  - NpcArchetype
  - PatrolPath
  - StaticInstanceSet
- repeated statics moeten in preview renderekeuze kunnen profiteren van instancing

Architectuur:
- asset ingest en metadata extractie mag in worker threads
- editor viewport leest draft projection, niet direct rauwe node-data per frame
- node wijzigingen moeten preview live updaten

Belangrijke regels:
- geen object verschijnt zonder node
- geen gemengde sprite/tile/2D wereldpipeline toevoegen
- library krijgt eigen module, niet in viewport-component gepropt

Definition of done:
- GLB upload werkt
- asset library toont items en usage stats
- nodes kunnen GLB objecten in de wereld plaatsen
- objecten zijn selecteerbaar
- translate/rotate/scale werkt
- multi-select en group basis werkt
- preview update live vanuit draft nodes
MMO runtime en partijlaag

Doel van de fase: de game van “single-user world preview” naar “echte realtime multiplayer MMO-basis” brengen, met authoritative room state, meerdere spelers die elkaar direct zien, party-vorming, quest sharing-contracten en reconnect-veiligheid.

Actie voor Codex: configureer websocket proxying in Nginx, zet PM2 ecosystem files actief voor API en realm-server, en installeer lokaal Redis op dezelfde server als optionele volgende stap. Start desnoods nog single-process, maar maak Redis al beschikbaar.

De prompt voor GK Code Copiloot:

text
Kopiëren
Je bent GK Code Copiloot.

Werkregels:
- Alleen main.
- Zo weinig mogelijk commits.
- Werk alleen vanuit deze prompt en de huidige repo.
- Geen harde spelinhoud in rooms of clients; lees published runtime data.
- Bouw server-authoritative multiplayer.

Opdracht:
Implementeer de eerste echte MMO runtime laag met Colyseus of een gelijkwaardige roomserver-architectuur, maar houd het API-contract schoon en data-driven.

Vereisten:
- authoritative spelerstate op server
- meerdere spelers moeten realtime elkaars positie en acties kunnen zien
- client-side interpolatie/predictie waar nodig, maar server blijft autoriteit
- reconnect-flow zodat tijdelijke disconnects spelers niet meteen slopen
- world zones of realms als room-concept
- lobby of world-entry flow voor actieve ruimtes
- party-systeem
- quest-share basiscontract tussen party members
- NPC’s met autonome patrol/walk routes vanuit published node-data
- interactie met NPC’s vanuit published runtime projecties
- published world wordt door game-web geladen, niet draft data

Authenticatie:
- gebruik bestaande player-auth uit api
- realm-server valideert sessie/token bij room join
- gebruik room auth, maar maak editor-auth hier niet van afhankelijk

Structuur:
- packages/mmo-protocol voor gedeelde messages en snapshots
- apps/realm-server voor rooms en realtime logica
- apps/game-web voor client integratie
- packages/game-runtime voor systems die published data interpreteren

Belangrijke functionele details:
- spelers zien elkaar direct bewegen
- party kan worden aangemaakt
- quest-share contract bestaat op datamodelniveau
- NPC patrol routes komen uit nodes, niet uit harde arrays in code
- game-web verbindt alleen met published release en realm-server

Testen:
- voeg integratie- of simulatie-tests toe met minimaal twee clients
- test reconnect
- test party aanmaken
- test dat twee clients elkaar zien in dezelfde zone

Definition of done:
- twee spelers kunnen tegelijk in dezelfde zone
- ze zien elkaars beweging realtime
- reconnect werkt
- party basis werkt
- NPC patrol basis werkt
- runtime leest published projecties
Verhaal, quests, HUD en eindbaas

Doel van de fase: je eerste echt speelbare spel-lus afmaken, volledig data-driven: NPC’s, dialogen, queststatus, questdelen, co-op voortgang, HUD-layout, boss-fases, loot en afronding.

Actie voor Codex: maak testaccounts en seed een eerste owner/designer user; voer migraties uit voor quest-, dialogue-, encounter- en loot-tabellen of projecties; zorg dat de game via één domein of duidelijke routes bereikbaar is, met editor apart afgeschermd.

De prompt voor GK Code Copiloot:

text
Kopiëren
Je bent GK Code Copiloot.

Werkregels:
- Alleen main.
- Zo weinig mogelijk commits.
- Werk alleen vanuit deze prompt en de huidige repo.
- Geen verhaallogica of questtekst hard in engine-code zetten.
- Alle content moet via nodes, projecties en published data het spel in komen.

Opdracht:
Maak de game voor het eerst volledig speelbaar van begin tot eind met een begin-quest en eindbaas.

Bouw deze systemen:
- node-driven dialogue systeem
- node-driven quest systeem
- quest statuses: beschikbaar, actief, voortgang, gedeeld, voltooid, mislukt
- quest delen met party members
- node-driven triggers en objective evaluatie
- node-driven rewards en loot tables
- node-driven encounter/boss systeem
- node-driven HUD layout en HUD panels
- dockbare HUD panel basis in de editor
- game runtime die HUD uit published layout-data opbouwt

Inhoud die moet bestaan aan het einde:
- een startzone
- meerdere NPC’s met eigen namen, patrol of idle gedrag en dialogen
- een coherent beginverhaal van start tot einde
- een quest chain die spelers samen kunnen doen
- een eindbaas met echte mechanics:
  - minimaal één telegraph/waarschuwingsmechaniek
  - minimaal één fase-overgang
  - minimaal één add/spawn of area event
  - duidelijke afronding + loot/reward
- quest completion moet persistent zijn
- party share moet in de praktijk werken

HUD eisen:
- HUD panels moeten als eigen entiteiten bestaan in data
- layout moet serialiseerbaar zijn
- editor moet een basis HUD builder hebben
- panelen moeten dockbaar zijn en los gebruikt kunnen worden
- runtime gebruikt published HUD layout, niet losse harde React-schermen per quest

Node-types uitbreiden met minimaal:
- DialogueNode
- DialogueChoiceNode
- QuestDefinitionNode
- QuestObjectiveNode
- QuestSharePolicyNode
- TriggerVolumeNode
- RewardNode
- LootTableNode
- HudLayoutNode
- HudPanelNode
- BossEncounterNode
- BossPhaseNode
- SpawnWaveNode

Testen:
- e2e flow van start -> quest accepteren -> co-op voortgang -> eindbaas -> loot -> quest completion
- test met één speler en met twee spelers in party

Definition of done:
- het spel is van begin tot eind speelbaar
- de quest chain werkt
- party share werkt
- HUD komt uit node/publication data
- boss fight werkt echt
- afronding en beloning werken
Prestatie, exploitatie en release

Doel van de fase: zorgen dat wat nu speelbaar is ook echt inzetbaar voelt op desktop, mobiel en browser, met performance-budgets, procesbeheer, lokale server-operatie en definitieve testdekking.

Actie voor Codex: activeer PM2 ecosystem/startup, richt logrotate en process restart in, zet RedisPresence klaar als je boven single-process gaat, maak SSL/proxy-config definitief, en voer herhaalbare deploy- en rollback-procedures uit vanuit /var/www/gk zonder extra cloud-opslag.

De prompt voor GK Code Copiloot:

text
Kopiëren
Je bent GK Code Copiloot.

Werkregels:
- Alleen main.
- Zo weinig mogelijk commits.
- Werk alleen vanuit deze prompt en de huidige repo.
- Laat geen open TODO’s, nepfeatures of dode routes achter in de eindstatus.
- Houd het project volledig bruikbaar op één server in /var/www/gk.

Opdracht:
Hard de volledige build af voor mobiel, desktop en browser en zorg dat het project operationeel klaar is.

Prestatie:
- introduceer quality tiers voor mobiel/desktop
- gebruik instancing waar herhaling mogelijk is
- voeg asset-optimalisatiepad toe voor Draco / meshopt / texture compression waar toepasbaar
- voeg shader precompile of warmup pad toe bij scene load
- voeg runtime metrics toe voor renderer info, draw calls en geheugen
- minimaliseer onnodige post-processing
- zorg voor touch controls / mobile input
- voorkom dat draft authoring-data in gameruntime terechtkomt

Exploitatie:
- maak pm2 ecosystem config bruikbaar
- voeg healthchecks toe voor api en realm-server
- zorg voor nette foutafhandeling en reconnect messaging
- update docs/runbook.md met echte start, deploy, migrate, rollback en health-check instructies
- houd docs klein en blijvend nuttig

Testen:
- maak Playwright flows voor editor login, publish, game start en boss afronding
- voeg multi-client rooktest toe
- voeg basis load/smoke script toe voor realm-server
- test mobiele viewport en inputflow

Opschonen:
- verwijder dode code
- verwijder tijdelijke seed- of testhaken die niet nodig zijn
- geen overbodige markdownbestanden toevoegen
- houd packagegrenzen strak

Definition of done:
- editor -> save -> publish -> game flow werkt end-to-end
- game is speelbaar op mobiel en desktop
- ops scripts en pm2 config zijn bruikbaar
- tests dekken de hoofdflow
- geen half afgebouwde subsystemen meer
De reden dat deze volgorde werkt, is dat je eerst de publicatiegrenzen vastzet en pas daarna de gameplaycontent invult. Als je eerder begint met harde quest- of bosslogica, krijg je precies het soort project dat jij níet wilt: functionaliteit die toevallig werkt, maar niet via de editor beheersbaar is.

Eindstructuur van /var/www/gk
Als je jouw wens “alles op één server, in /var/www/gk, en niet alles in één bestand duwen” serieus neemt, dan is de beste eindvorm geen platte rootmap maar een duidelijke scheiding tussen git-tracked code en lokale runtime-data binnen diezelfde hoofdmap. Zo houd je overzicht, voorkom je vervuiling van de repository met assets en logs, en blijf je toch volledig binnen jouw grens “alles onder /var/www/gk”.

text
Kopiëren
/var/www/gk
  apps/
    api/
    editor-web/
    game-web/
    realm-server/

  packages/
    content-compiler/
    editor-core/
    game-runtime/
    mmo-protocol/
    node-schema/
    shared/
    ui-docking/

  ops/
    mysql/
    nginx/
    pm2/
    scripts/

  tests/
    e2e/
    integration/
    load/

  docs/
    architecture.md
    node-catalog.md
    runbook.md

  data/
    assets/
      source/
      processed/
      library/
    projects/
      drafts/
      published/
    uploads/

  runtime/
    logs/
    tmp/

  .env
  .env.editor
  .env.game
  .env.api
  .env.realm
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
De gedachte achter deze structuur is eenvoudig. apps/ blijven dunne compositielagen: ze orkestreren, maar bevatten niet de domeinlogica zelf. Daardoor groeien ze niet onbeheerst. packages/ zijn bounded contexts: als editor-core te groot wordt, splits je later op in editor-graph, editor-preview en editor-inspector; als game-runtime te breed wordt, splits je op in systems, entities, combat, quests en hud. docs/ bevat bewust maar drie blijvende markdownbestanden: architectuur, node-catalogus en runbook. Alles daarbuiten aan incidentele notities moet je actief vermijden, anders krijg je precies de documentatieruis waar jij af wilt.

data/ is de lokale opslaglaag voor jouw ene server. Hier horen de GLB-bronnen, verwerkte assets, projectdrafts, published manifests en uploads. Deze map is nodig omdat jouw spel zonder S3 of externe object storage moet draaien, maar hij hoeft niet “groot in Git” te worden, omdat hij buiten versiebeheer blijft. runtime/ blijft klein zolang je hem beperkt tot logs en tijdelijke bestanden. Ik zou nadrukkelijk geen vaste backups/-map aanmaken zolang je geen echte backupjob of restoreprocedure hebt; anders ontstaat weer hetzelfde patroon van nutteloze bijvangst in de root.

De meest toekomstvaste afspraak is daarom: code in Git, data lokaal naast de code, maar wel onder dezelfde hoofdmap. Daarmee voldoe je aan je servereis én houd je de deur open om later alleen de storage-adapter te vervangen als je ooit toch naar externe objectopslag wilt.

Kritieke valkuilen en harde keuzes
De eerste valkuil is denken dat “geen harde code in de game” hetzelfde is als “geen vaste systems meer”. Dat is niet zo. Als je de runtime elk frame de hele node-graaf laat interpreteren, ga je mobiel en browser verliezen. Druk je authoring in nodes uit, maar compileer die bij publish naar lichte runtime-projecties. Gebruik daarnaast Three.js’ echte performance-hefbomen: instancing voor herhaling, GLTF-compressie/extensies voor assetgewicht, shader-precompile om eerste-render stalls te beperken, en renderer-metrics om regressies zichtbaar te maken. 

De tweede valkuil is je editor-auth of volledige user-laag te veel laten afhangen van de Colyseus Auth Module. Die module is officieel nog beta en verzorgt zelf geen database of e-mail. Gebruik hem hooguit gericht waar hij helpt, maar bouw editor-identiteit, rollen, sessies en user-management in je eigen API. Voor rooms en realtime-validatie blijft Colyseus dan uitstekend bruikbaar. 

De derde valkuil is de verleiding om bekende React Flow voorbeelden direct over te nemen. Save/restore en collaboration zitten netjes in de publieke flow, maar undo/redo en selection-grouping worden expliciet als Pro-voorbeelden aangeboden met een aparte licentie. Gebruik het productdenken als referentie voor gedrag, niet als broncode om ongezien te kopiëren. 

De vierde valkuil is een “één-server” wens verwarren met “één-process” of “geen echte game-server”. Een MMO heeft een autoritatieve realtime serverlaag nodig. Het goede nieuws is dat je die nog steeds volledig op jouw ene machine kunt draaien: API, game-web, editor-web, realm-server en desnoods later lokale Redis naast elkaar onder PM2. Colyseus Presence en PM2 cluster geven daar juist een logisch groeipad voor, zonder dat je nu al S3, AWS of meerdere hosts hoeft te gebruiken. 

De vijfde valkuil is te snel een “slimme” algemene AI/NPC-wereld te willen voordat je eerste quest-lus staat. Voor jouw eerste speelbare MMO is een hand-authored nodepad sterker: NPC-patrols via route/spline/path nodes, queststatus via duidelijke objective nodes, boss-mechanics via expliciete phase nodes. Eerst betrouwbaar. Daarna pas generieker. Dat sluit ook beter aan op jouw wens dat alles beheersbaar en realtime in de editor zichtbaar blijft.

Als je dit plan strak volgt, dan eindig je niet met “een editor naast een spel”, maar met precies wat je eigenlijk zoekt: één databasegedreven bron, één nodegedreven authoringlaag, één publish-compiler, en één lichte MMO-runtime die daar consequent uit voortkomt. Dat is de denk-richting die het meeste toekomstbewijs heeft voor jouw project.