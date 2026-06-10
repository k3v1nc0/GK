# Content Gates

## Definitie

Een content gate is een expliciete poort die bepaalt of een fase, feature, fix, refactor of content-uitwerking mag doorgaan. De gate voorkomt dat ontbrekende Kevin-input wordt vervangen door aannames, dummy content of runtime-hardcoding.

## Fail-fast regels

Stop direct wanneer:

- verplichte Kevin-input ontbreekt;
- een asset verplicht is maar niet bestaat of niet gecontroleerd is;
- server/database/build/runtime context nodig is maar niet gecontroleerd kan worden;
- bestaande repo-documentatie botst met de nieuwe-game instructies en niet veilig als verouderd of te verifieren kan worden gemarkeerd;
- een oplossing concrete gamecontent in runtimecode zou plaatsen;
- een helper ontbrekende core-architectuur zou maskeren;
- checks niet kunnen draaien en het risico voor direct op `main` te hoog is.

Stoppen is correct gedrag. Niet improviseren.

## AI-regels

De AI mag niet:

- improviseren bij ontbrekende contentinput;
- placeholders of dummy content toevoegen;
- dummy assets, nepmodellen of tijdelijke vervangers gebruiken;
- definitieve contentnamen verzinnen;
- runtime hard-coding gebruiken om content of waardes te laten werken;
- oude of onbevestigde GameBible-content als nieuwe-game contract overnemen.

## Blokkerende input

Deze input blokkeert wanneer de fase of feature haar concreet nodig heeft:

| Input | Wanneer blokkerend |
|---|---|
| Game naam | Zodra branding, title, UI, docs of content seed een definitieve naam nodig heeft |
| Startgebied | Zodra world, camera, lighting, minimap, ambience of beginquest een concrete locatie nodig heeft |
| Assetpad | Zodra asset-worker, asset library of publish assets moet scannen |
| GLB assets | Zodra player/NPC/enemy/boss/object visuals verplicht zijn |
| UI assets | Zodra HUD, inventory, merchant, quest tracker, scrolls of boss UI verplicht zijn |
| Audio assets | Zodra ambience, music, SFX, UI audio, NPC audio of boss audio verplicht zijn |
| Namen | Zodra NPCs, bosses, quests, zones, items, abilities of currency definitief worden |
| Story/lore | Zodra quest/dialogue/story seed wordt gemaakt |
| Quests | Zodra quest system concrete content nodig heeft |
| Side quests | Zodra side quest content nodig is |
| Boss | Zodra combat/boss phase/loot/content seed nodig is |
| Currency/economywaarden | Zodra money, prices, rewards, merchants, XP of loot nodig zijn |
| Camera/lighting/minimap waarden | Zodra runtime publish concrete world presentation nodig heeft |
| Server/database/runtime status | Zodra een fase migraties, services of runtimechecks vereist |

## Open ontwerpbeslissingen

Deze input mag als open worden geregistreerd zonder Fase 1-documentopzet te blokkeren:

- game naam;
- startgebied;
- sfeer;
- MMO-stijl;
- namen;
- quests;
- side quests;
- boss;
- currency;
- camera stijl;
- lighting richting;
- minimap vorm;
- economy/balancing richting;
- audio-richting.

Voorwaarde: het document mag geen definitieve waarde invullen en de fase mag niet als volledig klaar worden gemarkeerd.

## Gate-checks per domein

### Assets

- Zijn repo-assets en server-assets apart benoemd?
- Is `/var/www/gk/assets` door Codex gecontroleerd?
- Is `GK_ASSET_SOURCE_DIR` ingesteld?
- Zijn GLB/UI/audio aantallen bekend?
- Zijn assetrollen door Kevin gekozen?

### UI

- Bestaan de benodigde UI assets?
- Zijn ze via asset library gekozen?
- Zijn HUD/panel/dock instellingen node-data?

### Audio

- Bestaan de benodigde audio assets?
- Zijn music, ambience, SFX, UI audio en eventuele voice/dialogue via nodes gekoppeld?
- Zijn loopgedrag en mixcategorie editor-data?

### Story/lore

- Is lore door Kevin aangeleverd of goedgekeurd?
- Is oude/onbevestigde repo-story niet stilzwijgend overgenomen?

### Names

- Zijn namen definitief gekozen?
- Zijn namen data, niet code?

### Quests

- Zijn questnaam, stappen, objectives, dialogue, rewards en sharing-regels gekozen?
- Zijn quest nodes en publish-validatie aanwezig?

### Side quests

- Is side quest idee en scope gekozen?
- Zijn side quest rewards en UI/audio assets beschikbaar indien verplicht?

### Boss

- Is boss GLB gekozen?
- Zijn bossnaam, phases, UI, music/audio, loot en mechanics gekozen?

### Currency

- Zijn currency naam, icoon en basisregels gekozen?

### Camera

- Zijn camera mode, afstand, hoogte, zoom, smoothing en bounds data?

### Lighting

- Zijn sun, ambient, fog, sky en day/night data?

### Minimap

- Zijn editor/game views, layers, markers, zoom en visibility rules data?

### Economy

- Zijn money, prices, merchants, rewards, item values, XP en loot data?

### Levels

- Zijn levels/zones en unlocks via node/database-data beheerd?

### Merchants

- Zijn merchant NPC, stock, prices, buy/sell regels, UI en audio assets gekozen?

### Node-data

- Is alle concrete content beheerbaar via editor/node-system?
- Bestaan validators voor verplichte velden?
- Zijn defaults alleen generiek en niet concrete gamecontent?

### Publish/runtime

- Consumeert runtime alleen gepubliceerde data?
- Blokkeert publish ontbrekende verplichte data?
- Geeft publish waarschuwingen voor optionele of kwaliteitsproblemen?

## Te verifieren fase-input voor latere fases

Nieuwe agents moeten altijd eerst `README/current-phase.md`, `docs/design/phase-plan/current-phase.md`, het relevante fasebestand, deze gates, de registers en het node-contract openen.

### Fase 7

Bronnen eerst openen:

- `README/fase7.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `README/node-system-super-dynamic-contract.md`

Input vooraf:

- assetpad bevestigd;
- `/var/www/gk/assets` door Codex gecontroleerd;
- `GK_ASSET_SOURCE_DIR` gezet;
- GLB/UI/audio telling beschikbaar;
- minimaal benodigde assets door Kevin gekozen voor de fase;
- geen assets in Git toevoegen als server-assetflow leidend is.

### Fase 9

Bronnen eerst openen:

- `README/fase9.md`
- `docs/design/world-settings-plan.md`
- `docs/design/asset-register.md`

Input vooraf:

- startgebied gekozen;
- camera stijl en waarden gekozen;
- startlicht, ambient, fog en sky gekozen;
- minimap vorm/zoom en editor/game verschil gekozen;
- eerste level/zone naam gekozen;
- alle waarden als node-data, niet runtimecode.

### Fase 13

Bronnen eerst openen:

- `README/fase13.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/design/game-bible.md`

Input vooraf:

- questgiver, friendly NPC en merchant GLB gekozen;
- NPC namen of testzinnen door Kevin goedgekeurd;
- NPC taakgeluiden en ambience beschikbaar;
- routes, werkplekken, spawngebieden en respawn timings gekozen;
- NPC state server-owned en node-driven.

### Fase 15

Bronnen eerst openen:

- `README/fase15.md`
- `docs/design/economy-plan.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`

Input vooraf:

- currency naam en icoon gekozen;
- startgeld gekozen;
- item icons en prijzen gekozen;
- merchant stock gekozen;
- inventory UI gekozen;
- scroll background en scroll tekst gekozen;
- level curve of basisregels gekozen;
- geen economywaarden hard-coded.

### Fase 16

Bronnen eerst openen:

- `README/fase16.md`
- `docs/design/economy-plan.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/design/game-bible.md`

Input vooraf:

- enemy minion GLB gekozen;
- boss GLB gekozen;
- loot drop GLB gekozen;
- attack icons/audio gekozen;
- boss health UI/music/audio gekozen;
- attack namen, boss naam, loot item en mechanics gekozen;
- damage, cooldowns, loot en phases als node-data.

### Fase 17

Bronnen eerst openen:

- `README/fase17.md`
- `docs/design/game-bible.md`
- `docs/design/asset-register.md`
- `docs/design/audio-register.md`
- `docs/design/world-settings-plan.md`
- `docs/design/economy-plan.md`
- `docs/design/content-gates.md`

Input vooraf:

- Game Bible compleet genoeg voor eerste speelbare content;
- alle namen definitief;
- dialogen definitief;
- beginquest en side quest definitief;
- currency, merchant en levels ingevuld;
- alle required GLB/UI/audio roles gemapt;
- Codex asset scan en serverchecks uitgevoerd;
- content seed alleen via node-data en publish.

## Fase 14 tussenpoort

Fase 14 is niet in de gevraagde kernlijst genoemd, maar ligt functioneel tussen Fase 13 en 15 en beheert quests, story, side quests en party sharing. Nieuwe agents moeten `README/fase14.md` openen voordat questcontent wordt gebouwd.

Input vooraf:

- eerste questnaam;
- minimaal 1 side quest idee;
- queststappen;
- party sharing gedrag;
- quest tracker UI/audio.
