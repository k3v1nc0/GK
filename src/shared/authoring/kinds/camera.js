// Camera-keuze (Kevin 19-11): in Instellingen > Project kies je hoe de game in beeld komt:
// top-down (van boven, zoals altijd) of third-person (achter de speler, draaien met de muis of een vinger).
// Alle velden staan op de kaart Project; camera-afstand en camera-hoek stonden vroeger op de kaart Wereld
// (de build en de editor nemen een oude waarde van Wereld over zolang Project hem nog niet heeft).
import { help, ui } from "./ui.js";

const TOP_GROUP = "🗺️ Camera: top-down";
const TP_GROUP = "🧍 Camera: third-person";
const TOUCH_GROUP = "📱 Camera: mobiel (third-person)";
const FOLLOW_ON = Object.freeze({ key: "cameraTpFollow", is: [true] });

const num = (label, icon, def, min, max, step, unit, group, helpText, extra = {}) => ({
  type: "number", required: false, min, max, audience: "client", label,
  ui: ui(icon, "slider", "instellingen", Object.assign({ step, unit, group }, extra)), default: def, help: helpText
});
const int = (label, icon, def, min, max, step, unit, group, helpText, extra = {}) => Object.assign(num(label, icon, def, min, max, step, unit, group, helpText, extra), { type: "integer" });
const toggle = (label, icon, def, group, helpText, extra = {}) => ({
  type: "boolean", required: false, audience: "client", label,
  ui: ui(icon, "toggle", "instellingen", Object.assign(group ? { group } : {}, extra)), default: def, help: helpText
});

export const CAMERA_FIELDS = {
  cameraMode: { type: "select", required: false, options: ["top_down", "third_person"], optionIcons: { top_down: "🗺️", third_person: "🧍" },
    optionLabels: { top_down: "Top-down (van boven)", third_person: "Third-person (achter de speler)" }, audience: "client", label: "Camerastand",
    ui: ui("🎥", "select", "instellingen"), default: "top_down",
    help: help("Hoe spelers de wereld zien. Top-down: van boven, klik of tik om te lopen. Third-person: achter je poppetje, draaien met de rechtermuisknop (pc) of door te slepen (mobiel), lopen met WASD of de joystick.",
      "Top-down is het makkelijkst op een telefoon en het lichtst voor een oude laptop. Third-person voelt meer als een avontuur.",
      "De game hapert in third-person → zet Zichtafstand en Objecten laden tot lager, of kies top-down.") },
  cameraPlayerChoice: toggle("Speler mag zelf wisselen", "🔀", false, null,
    help("Laat spelers in de game (Instellingen > Camera) zelf kiezen tussen van boven en achter je. Uit = iedereen speelt met de Camerastand hierboven.",
      "Aan als beide standen goed werken in je wereld.", "Spelers zien een stand die nog niet af is → zet uit.")),

  // Top-down (zoals de game altijd was).
  cameraPitch: num("Hoek", "📐", 55, 10, 89, 1, "°", TOP_GROUP,
    help("Hoe schuin de camera van boven naar beneden kijkt.", "45 tot 65 graden werkt meestal goed.", "Je kijkt te plat → hoger.")),
  cameraDistance: num("Startafstand", "🎥", 24, 5, 120, 1, "m", TOP_GROUP,
    help("Hoe ver de camera bij de start van de speler af staat.", "15-30 m.", "Je ziet te weinig → verder weg."), { range: [5, 60] }),
  cameraMinDistance: num("Inzoomen tot", "🔍", 10, 2, 120, 1, "m", TOP_GROUP,
    help("Hoe dichtbij de speler met het muiswiel (of knijpen) kan inzoomen.", "8-12 m werkt meestal goed.", "Spelers zitten met de camera in hun poppetje → hoger."), { range: [2, 40] }),
  cameraMaxDistance: num("Uitzoomen tot", "🔭", 48, 5, 300, 1, "m", TOP_GROUP,
    help("Hoe ver de speler kan uitzoomen. Verder kost meer van de laptop (meer wereld in beeld).", "40-60 m.", "De game hapert bij ver uitzoomen → lager."), { range: [10, 150] }),
  cameraFov: num("Kijkhoek", "👁️", 50, 20, 100, 1, "°", TOP_GROUP,
    help("Hoe breed de camera kijkt (FOV). Geldt voor de korte kant van het scherm.", "45-55° van boven.", "Alles lijkt vervormd aan de randen → lager."), { range: [30, 80] }),
  cameraTopDownRotate: toggle("Draaien met rechtermuisknop", "🔄", false, TOP_GROUP,
    help("Op de pc: houd de rechtermuisknop ingedrukt en sleep om de camera rond de speler te draaien. Uit = de camera kijkt altijd dezelfde kant op.",
      "Uit voor een vaste kaart-blik, aan als huizen en bomen het zicht wegnemen.", "Spelers raken de weg kwijt → zet uit (noorden blijft dan boven).")),
  // Kevin 23-11 (9): zichtveld. Van boven zie je niet over een muur heen: wat je poppetje niet kan zien, is donker.
  cameraTopDownVision: toggle("Zichtveld (niet over muren kijken)", "🔦", true, TOP_GROUP,
    help("Van boven kun je niet over een muur heen kijken: alles wat je poppetje niet kan zien (achter een muur of dichte deur) is donker. Door een open deur, een gat of een raam zie je wel.",
      "Aan voor huizen, kastelen en kerkers.", "Te veel donker buiten → zet uit, of maak het minder donker.")),
  cameraTopDownVisionDark: int("Zichtveld: hoe donker", "🌑", 92, 0, 100, 1, "%", TOP_GROUP,
    help("Hoe donker het stuk is dat je niet kunt zien. 100 = helemaal zwart.", "85-95%.", "Je ziet nog te veel achter de muur → hoger."), { range: [40, 100] }),

  // Third-person: achter de speler.
  cameraTpDistance: num("Afstand achter je", "🎥", 6, 1, 40, 0.5, "m", TP_GROUP,
    help("Hoe ver de camera achter je poppetje staat bij de start.", "4-8 m werkt meestal goed.", "Je ziet te weinig om je heen → verder. Je poppetje is te klein → dichterbij."), { range: [1, 20] }),
  cameraTpMinDistance: num("Inzoomen tot", "🔍", 2, 1, 40, 0.5, "m", TP_GROUP,
    help("Hoe dichtbij de speler met het muiswiel (of knijpen) kan komen.", "1,5-3 m.", "De camera zit in het hoofd van je poppetje → hoger."), { range: [1, 10] }),
  cameraTpMaxDistance: num("Uitzoomen tot", "🔭", 14, 2, 80, 0.5, "m", TP_GROUP,
    help("Hoe ver de speler kan uitzoomen.", "10-20 m.", "De game hapert bij ver uitzoomen → lager."), { range: [4, 40] }),
  cameraTpHeight: num("Hoogte", "↕️", 1.7, 0.3, 5, 0.1, "m", TP_GROUP,
    help("Op welke hoogte boven de voeten de camera kijkt (het punt waar hij omheen draait).", "1,5-1,8 m: ongeveer de schouders.", "Je kijkt tegen de rug aan → hoger. Je ziet de grond niet → lager.")),
  cameraTpShoulder: num("Schouder links of rechts", "↔️", 0.5, -3, 3, 0.1, "m", TP_GROUP,
    help("Schuift de camera opzij, zodat je poppetje niet precies in het midden staat. Min = links, plus = rechts, 0 = midden.", "0,3-0,8 m (rechterschouder).", "Je poppetje staat in de weg → meer opzij."), { range: [-2, 2] }),
  cameraTpPitch: num("Starthoek", "📐", 15, -40, 80, 1, "°", TP_GROUP,
    help("Hoe schuin de camera bij de start naar beneden kijkt. 0 = recht vooruit, hoger = meer van boven.", "10-25° werkt meestal goed.", "Je ziet te veel lucht → hoger. Je ziet niet ver vooruit → lager.")),
  cameraTpMinPitch: num("Omhoog kijken tot", "⬆️", -30, -80, 30, 1, "°", TP_GROUP,
    help("Hoe ver de speler omhoog mag kijken (de camera zakt dan achter je naar beneden). Min = omhoog.", "-20 tot -40°.", "De camera gaat door de grond → minder ver (dichter bij 0)."), { range: [-80, 20] }),
  cameraTpMaxPitch: num("Omlaag kijken tot", "⬇️", 70, 10, 89, 1, "°", TP_GROUP,
    help("Hoe ver de speler van boven op zichzelf mag kijken.", "60-80° werkt meestal goed.", "Spelers verliezen het overzicht → hoger."), { range: [20, 89] }),
  cameraTpFov: num("Kijkhoek", "👁️", 60, 30, 110, 1, "°", TP_GROUP,
    help("Hoe breed de camera kijkt (FOV). Breder = meer zien, maar meer werk voor de laptop.", "55-70° werkt meestal goed.", "Alles lijkt vervormd of de game hapert → lager."), { range: [40, 90] }),
  cameraTpMouseSpeed: int("Muisgevoeligheid", "🖱️", 100, 10, 400, 5, "%", TP_GROUP,
    help("Hoe snel de camera draait als je met de rechtermuisknop sleept.", "80-120 %.", "De camera schiet te ver door → lager. Je moet ver slepen → hoger."), { range: [20, 300] }),
  cameraTpInvertY: toggle("Omhoog/omlaag omdraaien", "🙃", false, TP_GROUP,
    help("Muis (of vinger) omhoog = camera omlaag, zoals in een vliegtuig.", "Uit, tenzij spelers het zo gewend zijn.", "Spelers kijken steeds de verkeerde kant op → wissel dit.")),
  cameraTpFollow: toggle("Camera draait vanzelf achter je", "🧲", true, TP_GROUP,
    help("Als je loopt met klikken, tikken of de joystick, draait de camera rustig mee tot hij weer achter je staat. Met WASD stuur je zelf met de muis.",
      "Aan, vooral op een telefoon.", "De camera draait als je dat niet wilt → zet uit of maak Wachten langer.")),
  cameraTpFollowDelay: num("Wachten na zelf draaien", "⏳", 1.5, 0, 10, 0.1, "s", TP_GROUP,
    help("Hoe lang de camera stil blijft nadat je hem zelf hebt gedraaid, voordat hij weer achter je gaat staan.", "1-2 seconden werkt meestal goed.", "De camera draait terug terwijl je nog rondkijkt → langer."), { when: FOLLOW_ON }),
  cameraTpFollowSpeed: num("Snelheid meedraaien", "🌀", 120, 10, 720, 10, "°/s", TP_GROUP,
    help("Hoe snel de camera weer achter je gaat staan.", "90-180 °/s.", "Je wordt misselijk van het draaien → lager."), { range: [20, 360], when: FOLLOW_ON }),
  cameraTpCollision: toggle("Camera botst met muren en grond", "🧱", true, TP_GROUP,
    help("Komt er een heuvel of een object met botsing tussen jou en de camera, dan schuift de camera naar voren zodat je je poppetje blijft zien.",
      "Aan (aangeraden).", "De camera springt heen en weer bij bomen → zet bij die bomen Botsing uit, of zet dit uit.")),
  cameraTpClickToMove: toggle("Klik of tik om te lopen", "👆", true, TP_GROUP,
    help("Ook in third-person met de linkermuisknop (of een tik op mobiel) ergens heen lopen. Uit = alleen WASD of de joystick; klikken kiest dan alleen nog vijanden, NPC's en spullen.",
      "Aan, dan werken beide manieren.", "Spelers lopen per ongeluk weg als ze iets aanklikken → zet uit.")),
  // Kevin 20-11: de mist mag ook uit (dan zie je de lucht tot de rand van de zichtafstand).
  cameraTpFog: toggle("Mist in de verte", "🌫️", true, TP_GROUP,
    help("Verre dingen lopen weg in de mist, in de kleur van de horizon. Uit = geen mist; dan houdt de wereld op de zichtafstand gewoon op.",
      "Aan, dan zie je geen harde rand waar de wereld ophoudt.", "Je wilt de lucht en de verte helder zien → zet dit uit en maak de zichtafstand groter.")),
  cameraTpViewDistance: num("Zichtafstand", "🔭", 220, 40, 1000, 10, "m", TP_GROUP,
    help("Tot hoe ver je in third-person kijkt; met de mist aan loopt de wereld daar weg in de mist (in de kleur van de horizon). Korter = sneller op een oude laptop.",
      "150-300 m.", "De game hapert als je naar de horizon kijkt → korter. Je ziet de rand van de wereld → korter (mist verbergt hem)."), { range: [60, 500] }),
  cameraTpObjectDistance: num("Objecten laden tot", "🌲", 56, 20, 200, 2, "m", TP_GROUP,
    help("Tot hoe ver om je heen bomen, huizen en andere modellen geladen worden. Verder = mooier, maar zwaarder.", "40-70 m op een oude laptop.", "Bomen en huizen floepen vlak voor je in beeld → verder. De game hapert → dichterbij."), { range: [28, 140] }),

  // Mobiel: joystick en slepen (alleen in third-person op een telefoon of tablet).
  cameraTouchStickSide: { type: "select", required: false, options: ["left", "right"], optionIcons: { left: "⬅️", right: "➡️" },
    optionLabels: { left: "Links", right: "Rechts" }, audience: "client", label: "Joystick: kant",
    ui: ui("🕹️", "select", "instellingen", { group: TOUCH_GROUP }), default: "left",
    help: help("Aan welke kant van het scherm de joystick staat. Aan de andere kant sleep je om de camera te draaien.", "Links: de actieknoppen staan rechts.", "De joystick zit over de actieknoppen → kies de andere kant of schuif hem op.") },
  cameraTouchStickSize: int("Joystick: grootte", "⭕", 120, 60, 260, 5, "px", TOUCH_GROUP,
    help("Hoe groot de joystick op het scherm is.", "100-140 px.", "Je duim valt eraf → groter. Hij bedekt te veel → kleiner.")),
  cameraTouchStickX: int("Joystick: van de rand", "↔️", 28, 0, 400, 2, "px", TOUCH_GROUP,
    help("Hoe ver de joystick van de zijkant van het scherm staat.", "20-40 px.", "Moeilijk te bereiken met je duim → meer naar binnen."), { range: [0, 200] }),
  cameraTouchStickY: int("Joystick: van onder", "↕️", 40, 0, 600, 2, "px", TOUCH_GROUP,
    help("Hoe ver de joystick van de onderkant van het scherm staat.", "30-80 px.", "Hij zit over de chat of meldingen → hoger."), { range: [0, 300] }),
  cameraTouchTurnSpeed: int("Slepen: draaisnelheid", "👉", 100, 10, 400, 5, "%", TOUCH_GROUP,
    help("Hoe snel de camera draait als je met je vinger over het scherm sleept.", "80-150 %.", "De camera draait te ver door → lager. Je moet ver slepen → hoger."), { range: [20, 300] }),
  cameraTouchRunAtEdge: toggle("Rennen: joystick helemaal duwen", "🏃", true, TOUCH_GROUP,
    help("Duw je de joystick tot de rand, dan ren je. Een klein stukje = lopen.", "Aan (aangeraden).", "Spelers rennen per ongeluk → zet uit (dan alleen lopen, of Altijd rennen op de kaart Wereld)."))
};

// Velden die vroeger op de kaart Wereld stonden (oude projecten): de build en de editor nemen ze over.
export const LEGACY_WORLD_CAMERA_KEYS = Object.freeze(["cameraDistance", "cameraPitch"]);
