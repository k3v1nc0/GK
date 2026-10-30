// Fundament zonder nodes: de basis van de wereld (grond, startplek, speler, camera, licht) staat in één
// kaart "Wereld" onder Instellingen. Zonder die kaart gebruikt de build de standaardwaarden hieronder,
// zodat een lege editor toch een speelbare wereld geeft.
import { HELP_ID, HELP_NAME, help, ui } from "./ui.js";

const num = (label, icon, def, min, max, step, unit, helpText, extra = {}) => ({
  type: "number", required: false, min, max, audience: "client", label,
  ui: ui(icon, "slider", "instellingen", Object.assign({ step, unit }, extra)), default: def, help: helpText
});
// Ronde 2: alles van de grond staat in de editor-tab Terrein (plek "terrein").
const tnum = (label, icon, def, min, max, step, unit, helpText, extra = {}) => num(label, icon, def, min, max, step, unit, helpText, Object.assign({ place: "terrein" }, extra));
const color = (label, icon, def, helpText, extra = {}) => ({
  type: "color", required: false, audience: "client", label,
  ui: ui(icon, "color", "instellingen", extra), default: def, help: helpText
});

export const WORLD_KINDS = {
  world_settings: {
    label: "Wereld",
    icon: "🌍",
    place: "instellingen",
    singleton: true,
    domain: "project",
    fields: {
      groundSize: tnum("Grootte van de wereld", "🗺️", 500, 20, 4000, 10, "m",
        help("Hoe groot de grond is (vierkant, het midden is 0,0).", "200-1000 m. Groter = meer ruimte, maar meer werk voor de laptop.", "Spelers lopen van de rand af → maak hem groter."),
        { range: [20, 2000] }),
      groundColor: color("Kleur van de grond", "🎨", "#3f6b3f",
        help("De kleur van de grond waar nog geen textuur of pad ligt.", "Groen voor gras, bruin voor zand.", "Grond te fel → kies een donkerdere kleur."), { place: "terrein" }),
      groundTextureAssetId: { type: "asset", assetType: "texture", required: false, maxLength: 160, audience: "client", label: "Textuur van de grond",
        ui: ui("🖼️", "asset", "terrein"), default: null,
        help: help("Het plaatje dat over de hele grond ligt.", "Kies een gras- of zandtextuur uit de lijst of sleep die uit Assets op dit vak.", "Grond ziet er wazig uit → kies een scherpere textuur of maak de textuurmaat kleiner.") },
      groundTextureSize: tnum("Textuurmaat (meter)", "📐", 10, 1, 200, 1, "m",
        help("Hoeveel meter één plaatje van de textuur beslaat.", "5 tot 20 meter werkt meestal goed.", "Patroon herhaalt te vaak → groter."),
        { range: [1, 50] }),
      startX: num("Startplek X", "📍", 0, -2000, 2000, 0.5, "m",
        help("Waar nieuwe spelers beginnen (links-rechts).", "0 = midden van de wereld.", "Spelers beginnen in een muur → schuif de startplek naar een open plek."),
        { range: [-250, 250] }),
      startZ: num("Startplek Z", "📍", 0, -2000, 2000, 0.5, "m",
        help("Waar nieuwe spelers beginnen (voor-achter).", "0 = midden van de wereld.", "Spelers beginnen in een muur → schuif de startplek naar een open plek."),
        { range: [-250, 250] }),
      startFacing: num("Kijkrichting bij start", "🧭", 0, 0, 359, 1, "°",
        help("Welke kant spelers op kijken als ze beginnen.", "0 = vooruit.", "Spelers kijken tegen een muur → draai de richting."),
        { more: true }),
      playerModelAssetId: { type: "asset", assetType: "model", required: false, maxLength: 160, audience: "client", label: "Model van de speler",
        ui: ui("🧍", "asset", "instellingen"), default: null,
        help: help("Hoe spelers eruitzien.", "Sleep een personage-model uit Assets op dit vak. Leeg = een simpel poppetje.", "Speler onzichtbaar → kies een ander model of maak het vak leeg.") },
      playerSpeed: num("Loopsnelheid", "🏃", 6, 0.5, 30, 0.5, "m/s",
        help("Hoe snel spelers lopen.", "4-8 m/s.", "Spelers schieten door de wereld → lager."),
        { more: true, range: [1, 15] }),
      playerScale: num("Grootte van de speler", "📏", 1, 0.1, 10, 0.05, "×",
        help("Hoe groot het speler-model getekend wordt.", "1 = zoals het model is gemaakt.", "Speler te groot of te klein → schuif."),
        { more: true, range: [0.2, 3] }),
      cameraDistance: num("Camera-afstand", "🎥", 24, 5, 120, 1, "m",
        help("Hoe ver de camera bij de start van de speler af staat.", "15-30 m.", "Je ziet te weinig → verder weg."),
        { more: true, range: [5, 60] }),
      cameraPitch: num("Camera-hoek", "📐", 55, 10, 89, 1, "°",
        help("Hoe schuin de camera naar beneden kijkt.", "45 tot 65 graden werkt meestal goed.", "Je kijkt te plat → hoger."),
        { more: true }),
      skyColor: color("Kleur van de lucht", "🌤️", "#8fb8de",
        help("De achtergrondkleur boven de wereld.", "Lichtblauw voor overdag, donkerblauw voor de nacht.", "Te fel → kies een zachtere kleur."), { more: true }),
      sunStrength: num("Zon", "☀️", 1.4, 0, 5, 0.05, "",
        help("Hoe fel de zon schijnt (schaduwen).", "1 tot 2 werkt meestal goed.", "Alles te donker → hoger."),
        { more: true, range: [0, 3] }),
      lightStrength: num("Licht overal", "💡", 0.6, 0, 5, 0.05, "",
        help("Licht dat overal even sterk is (ook in de schaduw).", "0.4 tot 1 werkt meestal goed.", "Schaduwen pikzwart → hoger."),
        { more: true, range: [0, 2] }),
      // Terugbouw zonder nodes: muziek voor de hele wereld (een gebied of deelgebied met eigen muziek gaat voor).
      musicAssetId: { type: "asset", assetType: "audio", required: false, maxLength: 160, audience: "client", label: "Muziek",
        ui: ui("🎵", "asset", "instellingen", { more: true }), default: null,
        help: help("De muziek die overal in de wereld speelt.", "Kies een rustig muziekstuk (mp3/ogg). Een gebied met eigen muziek gaat voor.", "Geen muziek → klik één keer in de game (browsers wachten daarop) of kies een ander bestand.") }
    }
  },
  // Wereld tekenen: de hoogte en verf van de grond. De vakken zelf maak je in de editor-tab Terrein
  // (penselen, stempels, verf); bij opslaan komen ze hier als lijst "vak → vingerafdruk".
  terrain_settings: {
    label: "Terrein",
    icon: "⛰️",
    place: "terrein",
    singleton: true,
    domain: "project",
    fields: {
      maxSlopeDeg: tnum("Te steil om te lopen", "🧗", 50, 10, 89, 1, "°",
        help("Vanaf deze helling kunnen spelers en vijanden niet meer omhoog lopen (het is dan een muur). Omlaag mag altijd.", "40-55 graden. 50 is een goede start.", "Spelers lopen tegen bergen op → lager. Spelers blijven hangen op kleine heuvels → hoger."),
        { range: [20, 80] }),
      rockTextureRef: { type: "ref", refKind: "terrain_texture", required: false, audience: "client", label: "Rots op steile hellingen",
        ui: ui("🪨", "ref", "terrein"), default: null,
        help: help("Een terreintextuur die vanzelf op steile hellingen komt, zonder verven.", "Kies je rotstextuur uit de Bibliotheek. Leeg = geen rots.", "Rots ook op kleine heuvels → zet de helling voor rots hoger.") },
      rockSlopeDeg: tnum("Rots vanaf helling", "📐", 40, 10, 80, 1, "°",
        help("Vanaf deze helling komt de rotstextuur over de grond.", "35-45 graden.", "Te veel rots → hoger. Bergen nog groen → lager."),
        { range: [20, 70] }),
      triBudget: tnum("Driehoeken grond (budget)", "🔺", 60000, 5000, 500000, 1000, "",
        help("Hoeveel driehoeken de grond in beeld mag hebben. De teller in Terrein wordt oranje vanaf 80 % en rood erboven.", "30.000-80.000 voor een oude laptop.", "Game hapert op de laptop → lager zetten en bergen gladder maken."),
        { range: [10000, 200000], more: true }),
      chunkTriBudget: tnum("Driehoeken per vak (budget)", "🟥", 4000, 500, 9000, 100, "",
        help("Hoeveel driehoeken één vak van 64 x 64 m dichtbij mag hebben. Te zware vakken kleuren rood in Terrein.", "2.000-5.000. Vlak = bijna niks, ruige bergen = veel.", "Veel rode vakken → gladstrijken of minder kleine hobbels maken."),
        { range: [1000, 8000], more: true }),
      chunks: { type: "terrainChunks", required: false, audience: "client", label: "Hoogte van de grond (vakken)",
        ui: ui("🗺️", "terrain", "viewport"), default: {},
        help: help("De opgeslagen hoogte van de grond, per vak van 64 x 64 meter.", "Maak je in de editor-tab Terrein en dan Opslaan.", "Grond plat na opslaan → open Terrein, teken opnieuw en druk Opslaan.") },
      paint: { type: "terrainPaint", required: false, audience: "client", label: "Verf van de grond (vakken)",
        ui: ui("🖌️", "terrainPaint", "viewport"), default: {},
        help: help("De opgeslagen verf van de grond: per vak 3 eigen texturen bovenop de grondtextuur.", "Maak je in de editor-tab Terrein met het verfpenseel.", "Verf weg na opslaan → open Terrein, verf opnieuw en druk Opslaan.") }
    }
  },
  // Ronde 2: een textuur om mee te verven (Bibliotheek in de tab Terrein).
  terrain_texture: {
    label: "Terreintextuur",
    plural: "Terreintexturen",
    icon: "🖌️",
    place: "terrein",
    domain: "project",
    idField: "textureId",
    fields: {
      textureId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Textuur-ID",
        ui: ui("🔖", "id", "terrein", { more: true }), default: null, help: HELP_ID("deze terreintextuur") },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam",
        ui: ui("🏷️", "text", "terrein"), default: "", help: HELP_NAME("deze terreintextuur") },
      textureAssetId: { type: "asset", assetType: "texture", required: true, maxLength: 160, audience: "client", label: "Plaatje",
        ui: ui("🖼️", "asset", "terrein"), default: null,
        help: help("Het plaatje dat herhaald over de grond komt waar je verft.", "Een naadloze (tegelbare) textuur, bijv. gras, zand of rots.", "Je ziet naden in een raster → kies een naadloze textuur.") },
      tileSize: tnum("Textuurmaat (meter)", "📐", 4, 0.5, 100, 0.5, "m",
        help("Hoeveel meter één plaatje van deze textuur beslaat.", "2-8 m voor gras en zand, groter voor rots.", "Patroon herhaalt te vaak → groter. Te wazig → kleiner."),
        { range: [1, 30] })
    }
  },
  // Ronde 2: een stempel (hoogteplaatje: wit = hoog). Zelf maken in Terrein, PNG importeren of de startset.
  terrain_stamp: {
    label: "Stempel",
    plural: "Stempels",
    icon: "🗻",
    place: "terrein",
    domain: "project",
    idField: "stampId",
    fields: {
      stampId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Stempel-ID",
        ui: ui("🔖", "id", "terrein", { more: true }), default: null, help: HELP_ID("deze stempel") },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam",
        ui: ui("🏷️", "text", "terrein"), default: "", help: HELP_NAME("deze stempel") },
      imageAssetId: { type: "asset", assetType: "image", required: true, maxLength: 160, audience: "client", label: "Hoogteplaatje",
        ui: ui("🖼️", "asset", "terrein"), default: null,
        help: help("Een grijs plaatje: wit is hoog, zwart is laag.", "PNG, liefst 16-bit (uit Blender of een heightmap-site).", "Trapjes in de berg → gebruik een 16-bit PNG of maak hem zelf in Terrein.") },
      size: tnum("Grootte", "↔️", 64, 2, 2000, 1, "m",
        help("Hoe breed de stempel standaard op de grond komt.", "20-200 m.", "Berg te klein → groter. Past niet in de wereld → kleiner."),
        { range: [4, 300] }),
      height: tnum("Hoogte", "↕️", 20, -300, 300, 0.5, "m",
        help("Hoe hoog wit wordt (negatief = een kuil of dal).", "5-40 m voor heuvels en bergen.", "Te steil om op te lopen → lager of groter maken."),
        { range: [-50, 100] })
    }
  }
};
