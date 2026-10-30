// Fundament zonder nodes: de basis van de wereld (grond, startplek, speler, camera, licht) staat in één
// kaart "Wereld" onder Instellingen. Zonder die kaart gebruikt de build de standaardwaarden hieronder,
// zodat een lege editor toch een speelbare wereld geeft.
import { help, ui } from "./ui.js";

const num = (label, icon, def, min, max, step, unit, helpText, extra = {}) => ({
  type: "number", required: false, min, max, audience: "client", label,
  ui: ui(icon, "slider", "instellingen", Object.assign({ step, unit }, extra)), default: def, help: helpText
});
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
      groundSize: num("Grootte van de wereld", "🗺️", 500, 20, 4000, 10, "m",
        help("Hoe groot de grond is (vierkant, het midden is 0,0).", "200-1000 m. Groter = meer ruimte, maar meer werk voor de laptop.", "Spelers lopen van de rand af → maak hem groter."),
        { range: [20, 2000] }),
      groundColor: color("Kleur van de grond", "🎨", "#3f6b3f",
        help("De kleur van de grond waar nog geen textuur of pad ligt.", "Groen voor gras, bruin voor zand.", "Grond te fel → kies een donkerdere kleur.")),
      groundTextureAssetId: { type: "asset", assetType: "texture", required: false, maxLength: 160, audience: "client", label: "Textuur van de grond",
        ui: ui("🖼️", "asset", "instellingen"), default: null,
        help: help("Het plaatje dat over de hele grond ligt.", "Kies een gras- of zandtextuur uit de lijst of sleep die uit Assets op dit vak.", "Grond ziet er wazig uit → kies een scherpere textuur of maak de textuurmaat kleiner.") },
      groundTextureSize: num("Textuurmaat (meter)", "📐", 10, 1, 200, 1, "m",
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
  }
};
