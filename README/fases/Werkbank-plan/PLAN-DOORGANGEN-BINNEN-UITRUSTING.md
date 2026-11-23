# Plan: doorgangen, binnenruimtes en uitrusting (voorstel 22-11)

Voorstel, nog geen code. Kevin kiest de volgorde. Per stap: 1 commit + 1 handtest, zoals het masterplan.
Altijd: oude laptop (Pentium 4417U) moet het trekken, de server beslist, geen vaste inhoud in code, alles in de 3D-editor, geen tweede systeem.

## 0. Wat er nu is (gelezen in de code)

- **🌀 Portals (8-11)** zijn een netwerk: vrijspelen, reizen via de kaart, respawn. De server (`portal-runtime.js`) checkt afstand en vlag en zet je op het aankomstpunt; de game bouwt de nieuwe plek op met de bestaande snelle teleport (dichtbij eerst laden).
- **Characters:** archer, smid en tovenaar zijn elk **één mesh** (Tripo) met **hetzelfde Mixamo-skelet van 22 botten** (Hips, Spine, Head, LeftHand, RightHand, ...). De animaties worden al gedeeld. Er zijn geen losse lichaamsdelen, en alleen idle, walk en run.
- **Items:** een uitrusting-item heeft een vak (hoofd, borst, handen, benen, voeten, wapenhand, andere hand, ketting, ring) en een model voor op de grond. Wat je aantrekt, zie je nu **niet** op je character.
- **Dag/nacht:** de game stuurt 10 keer per seconde licht, luchtkleur en nachtmix naar de wereld. Daar kunnen lichtstralen aan meedoen.
- **Licht:** alleen zon en omgevingslicht, geen fakkels of lampen.
- **Wereld:** terrein in vakken van 64 m; spelers zien elkaar per cel van 64 m (AOI).
- **🔷 Deelgebied** (Area tool) heeft al naam, muziek, veilig en voorrang.

## 1. Eerlijk oordeel: stencil- of non-Euclidean portals?

**Niet nodig, en te zwaar.** Een stencil-portal tekent de wereld achter de deur nog een keer, elk beeld, zolang de deur in beeld is. Op de Intel HD 610 van de laptop is dat bijna dubbel werk. En van bovenaf kijk je bijna nooit door een deuropening, dus je ziet het effect nauwelijks.

Wat je er eigenlijk van wilt (huisje 5x5 m buiten, 30x30 m binnen) krijg je gratis met een **doorgang naar een andere plek**: beeld 0,2 s zwart, en je staat direct binnen (jouw portal-regel: niet sliden, dichtbij eerst laden).

De binnenruimtes staan in een eigen hoek van **dezelfde wereld** (de **Binnen-strook**), ver van alles. Frustum culling slaat alleen over wat buiten beeld is, maar het staat dan nog wel in het geheugen. In de Binnen-strook laadt de game een binnenruimte niet eens zolang je buiten bent, en spelers binnen en buiten krijgen elkaars verkeer niet. Geen nieuw zonesysteem nodig.

Later kan er een **doorkijkje** bij: de editor bakt één plaatje van de binnenkant (zoals de minimap-bake) en zet dat in de deuropening. Bijna gratis, maar stilstaand.

## 2. Doorgangen en binnenruimtes (D-stappen)

### D1 — 🚪 Doorgang: een portal van precies twee kanten (gebouwd 22-11)
**Bouw:** een nieuwe kaart **🚪 Doorgang** in de Bibliotheek (los van 🌀 Portal: geen netwerk, geen vrijspelen, niet op de kaart als reisdoel). Eén kaart heeft precies twee kanten, **A** en **B**.
- Per kant: plek, draaien, model (deur, grotingang of onzichtbaar), "erin lopen" of "klik/E", afstand.
- Voor de hele doorgang: naam, beide kanten of eenrichting, alleen als vlag, sleutel-item nodig, vanaf level, niet tijdens een gevecht, wachttijd.
- **Editor:** slepen = kant A onder de muis en kant B 10 m ernaast. G/R per kant. Knop **"Ga naar de andere kant"**, en een lijn tussen A en B als ze dicht bij elkaar staan.
- **Server:** de game vraagt alleen "gebruik doorgang X". De server checkt afstand, vlag, sleutel, level, gevecht en wachttijd, en zet je op de andere kant. De code voor teleporteren en opbouwen deelt hij met de portals (delen, niet kopiëren).

**Kevin ziet:** een deur bij de smid. Klik, het beeld is kort zwart, en je staat bij kant B. Terug werkt ook. Met de vlag uit is de deur weg. Zonder sleutel staat er "Je hebt de Keldersleutel nodig".
**Risico's:** twee handvatten in één kaart is nieuw in de editor (het weg- en routegereedschap heeft al meerdere punten per kaart; die techniek hergebruiken). Respawn en kaart rekenen met afstand, zie D2.

### D2 — 🏠 Binnenruimte: een deelgebied met het vinkje Binnen (gebouwd 22-11, zonder minimap-deel)
**Bouw:** een binnenruimte is gewoon een stuk wereld in de Binnen-strook met een 🔷 Deelgebied waar **🏠 Binnen** aan staat. Binnen dat gebied:
- de camera is altijd top-down, met een eigen afstand en hoek (ook als de speler third-person koos). Buiten krijg je je eigen keuze terug. Het wisselen gebeurt tijdens de zwarte fade, dus zonder schok.
- lucht, wolken en mist van buiten staan uit, met een eigen achtergrondkleur.
- de zon is zwakker of uit, en het omgevingslicht heeft een eigen kleur en sterkte.
- de minimap toont alleen de binnenruimte. De grote kaart zegt "Binnen: Huis van Bram", met jouw stip bij de deur buiten.
- **Buiten-plek:** de server weet bij welke deur het gebied hoort. Respawn, unstuck, portalkosten, reizen naar een teamgenoot en de groepsstip rekenen vanaf die deur, niet vanaf de Binnen-strook.

**Kevin ziet:** in het Huis van Bram springt de camera naar bovenaanzicht, geen wolken, warm licht. Buiten is alles weer normaal. Doodgaan binnen = terug bij de portal die het dichtst bij de deur staat.
**Risico's:** de minimap-bake mag de Binnen-strook niet meebakken. Lucht en mist aan/uit zonder dat de shader opnieuw gebouwd wordt (anders hapert het). De Binnen-strook ligt minstens 300 m van de speelwereld, met binnenruimtes 200 m uit elkaar (AOI).

### D3 — Licht binnen: lichtstralen bij ramen en fakkels (met dag en nacht)
**Bouw:**
- **☀️ Lichtstraal** (fake god rays): een paar doorzichtige vlakken met een verloop, plus een lichtvlek op de vloer. Kleur en sterkte volgen dag en nacht: overdag fel, bij schemer oranje, 's nachts zwak blauw of uit (schuifjes op de kaart). Optioneel een paar stofjes.
- **🔥 Fakkel/kaars:** een gloeiend materiaal (gratis), plus een **vaste pool van 4 lampjes zonder schaduw** die naar de dichtstbijzijnde fakkels springen. Een vast aantal betekent dat de shaders niet opnieuw gebouwd worden. Flakkeren = de sterkte laten schommelen.
- Schuifje "Max lichtstralen in beeld"; op de software-renderer staan ze uit.

**Kevin ziet:** overdag een felle baan licht door het raam op de vloer, 's avonds oranje, 's nachts weg. Een fakkel flakkert.
**Risico's:** de spookvlak-opruimer gooit vlakken zonder diepte weg (les van de lucht), dus vrijstellen. Doorzichtige vlakken kosten de HD 610 veel als ze groot zijn, dus klein houden. Elk lampje maakt alle materialen iets zwaarder, dus max 4, en buiten uit.

### D4 — Zicht binnen: muren en dak wegfaden
**Bouw:** de top-down camera kijkt schuin, dus muren aan de camerakant en het dak staan in de weg.
- Per model twee vinkjes: **🫥 Wegfaden als hij het zicht blokkeert** en **Dak** (weg zodra je binnen dit deelgebied bent).
- Ongeveer 10 keer per seconde een straal van de camera naar de speler, alleen tegen gemarkeerde modellen. Geraakt = 25% zichtbaar.
- Werkt buiten ook: een boog, brug of boomkruin waar je onder loopt (third-person).

**Kevin ziet:** loop achter een kast of muur, en hij wordt doorzichtig.
**Risico's:** per object een eigen kopie van het materiaal (nooit het gedeelde materiaal veranderen). Alleen gemarkeerde modellen testen, anders kost het CPU.

### D5 — Lopen, route en bots door deuren
**Bouw:** de doorgang wordt een schakel, zoals wegen al één netwerk vormen. Een quest "ga naar" binnen wijst met de route en de minimap naar de deur buiten. Klik-om-te-lopen, NPC-routes en bots gaan door de deur. Vijanden volgen je niet door een deur (vinkje).
**Kevin ziet:** een bot loopt naar de deur, gaat naar binnen en doet daar zijn quest.
**Risico's:** het ingewikkeldste stuk (de padzoeker kent nu één doorlopend vlak). Zonder D5 werkt alles, behalve vanzelf naar binnen lopen.

### D6 — Grote gebouwen en samen naar binnen (citadel)
**Bouw:** elke etage is een eigen binnenruimte (100x100 m) in de Binnen-strook, en een trap is een doorgang. Etages liggen niet op elkaar, dus geen gedoe met vloeren en daken. Vinkje **"Groep mee"**: als de leider erdoor gaat, krijgen groepsleden in de buurt de vraag "Meegaan?".
**Kevin ziet:** met een groep de citadel in, etage 1 naar etage 2 via de trap.
**Risico's:** binnenruimtes zijn gedeeld voor iedereen (MMO). Een eigen kopie per groep (instance) is veel zwaarder, en niet nu.

## 3. Uitrusting op het character (U-stappen, aangepast na Kevin 22-11)

**Kevin 22-11:** geen echte ESO-kleding, wel: je ziet aan iemand wie het is ("dat is Kevin"), veel soorten en levels harnassen die bij beroepen en materialen horen (zoals ESO, maar simpeler), en alles maakt hij zelf in Blender. Twee poppetjes (jongen en meisje), en elk harnasstuk één los item.

**Zo werkt het:** jongen en meisje hebben hetzelfde skelet (Mixamo-botnamen en dezelfde rust-pose, zodat de huidige animaties blijven werken). Het lichaam is in Blender in stukken geknipt (hoofd, torso, armen, handen, benen, voeten), allemaal aan dat skelet. Elk harnasstuk is 1 glb met het skelet erin. De game hangt het in het spel aan het skelet van jouw character (`SkinnedMesh.bind`, botten op naam) en zet de huid eronder uit. Combinaties maakt de game zelf. Jongen/meisje: per stuk 2 versies, of 1 stuk met een shape key "meisje" die de game aanzet.

### U1 — Wapen en schild in de hand (werkt met je huidige modellen)
Bevestigpunten per uiterlijk (rechterhand, linkerhand, rug, heup), één keer afgesteld met G/R/S in een 3D-voorbeeld. Een item krijgt het blok **👕 Aan het lichaam** (model, punt, kleine verschuiving). De server stuurt alleen item-id's mee als een speler in beeld komt of iets wisselt.
**Kevin ziet:** de bijl in je rechterhand; een andere speler ziet hem ook.

### U2 — Twee lichamen en een character maken ("dat is Kevin")
Jongen en meisje als basis, met losse stukken voor gezicht, haar en baard (zelfde systeem als een harnasstuk), plus huidskleur, haarkleur en lengte. Kiezen bij een nieuw character; de server bewaart het en stuurt het mee.
**Kevin ziet:** twee characters naast elkaar die duidelijk anders zijn.

### U3 — Harnasstukken (1 glb per stuk)
Item-veld "model aan het lichaam" (per lichaam, of 1 stuk met shape key) en "verbergt: torso, armen". Helm verbergt haar; vinkje "helm verbergen".
**Kevin ziet:** losse borst, benen en laarzen aantrekken in elke mix; niets prikt erdoorheen.

### U4 — Levels, materialen en verven (met beroepen)
Een paar vormen per soort (stof, leer, metaal); elk level of materiaal is een andere kleur of texture op dezelfde vorm (bijv. 3 soorten × 6 stukken × 2 lichamen = 36 modellen voor honderden items). Kleermaker = stof, leerbewerker = leer, smid = metaal; het materiaal in het recept (Fase 9) bepaalt kleur en level. Zelf verven in 3 kleuren.
**Kevin ziet:** een ijzeren en een stalen borst met dezelfde vorm maar een andere kleur, allebei gemaakt bij de smid.

### U5 — Zuinig op de laptop
Bij aantrekken alle stukken van één speler samenvoegen tot 1 mesh (1 keer tekenen in plaats van 8); spelers ver weg alleen het basismodel; schaduw alleen van het samengevoegde.
**Kevin ziet:** 20 spelers in volle uitrusting en de FPS blijft gelijk.

## 4. Wat je nog mist (en waar het in het plan zit)

1. **Buiten-plek van een binnenruimte** voor respawn, unstuck, kaart en reizen naar een teamgenoot: D2.
2. **Gedeeld of eigen kopie per groep** (instance): keuze, zie §5. Advies: eerst gedeeld.
3. **Vijanden en de deur:** volgen ze je, of gaan ze terug? D5.
4. **Laden:** binnen 30 m van een deur zet de game de modellen van de binnenkant alvast klaar, zodat de deur direct voelt. D1/D2.
5. **Botsen binnen:** muren met blokkade of model-botsing, vloer en trap met loopvlak. Bestaat al, wel testen bij de eerste binnenruimte.
6. **Bouwen in de editor:** een **bouwset** (muur, vloer, deur, raam, trap) die vastklikt op een raster van 1 of 2 m, en een knop **"Nieuwe binnenruimte"** die op een vrije plek in de Binnen-strook een vloer, een deelgebied en een doorgang neerzet. Hoort bij D2.
7. **Geluid:** muziek per deelgebied bestaat al. Buitengeluid (wind, vogels) zachter binnen: D2.
8. **Server beslist:** de game stuurt alleen "gebruik doorgang X", nooit een nieuwe positie. Teleporteren via een looppunt wordt geweigerd. D1.
9. **Deuren met voorwaarden:** op slot met sleutel, alleen met een vlag, alleen 's nachts open (dag/nacht). Leuk voor kerkers. Sleutel en vlag in D1, nacht als extra.
10. **Animaties:** zonder aanval-, oogst- en sterf-animatie ziet uitrusting er stil uit. Los te regelen (Mixamo), geen code.
11. **Meten:** na elke stap één FPS-meting op de laptop met 20 spelers in beeld (CLI of bots). Zakt het meer dan 10%, dan eerst repareren.

## 5. Keuzes die alleen Kevin maakt

1. **Volgorde.** Kevin 22-11: eerst D1 en D2 (gebouwd 22-11, wacht op handtest). Daarna advies: U1, D3, D4, U2, U3, D5, D6, U4, U5.
2. **Binnenruimtes gedeeld voor iedereen**, of later ook een eigen kopie per groep?
3. **Waar de Binnen-strook ligt** (welke hoek van de kaart).
4. **U2/U3:** Kevin maakt de lichamen en harnassen zelf in Blender (22-11).
