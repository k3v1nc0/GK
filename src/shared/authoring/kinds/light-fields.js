// L1 (26-11): licht op een model (lantaarn, fakkel aan de muur, kampvuur). Een gloed die naar de camera kijkt en een
// warme lichtplek op de grond; geen echte lamp (dat is L2). In L3 krijgt een item dezelfde velden ("geeft licht in de
// hand"): één set velden, geen tweede systeem. Ze staan samen in het uitklapblok 💡 Licht.
import { help, ui } from "./ui.js";

export const LIGHT_GROUP = "💡 Licht";
export const LIGHT_DEFAULTS = Object.freeze({ color: "#ffb04a", strength: 1, range: 4, flicker: 0.35, glow: 0.6, height: 1.5, x: 0, z: 0, nightOnly: false });
const ON = Object.freeze({ key: "light", is: [true] });

const num = (label, icon, def, min, max, extra, helpText) => ({ type: "number", required: false, min, max, audience: "client", label,
  ui: ui(icon, "slider", "werkbank", Object.assign({ group: LIGHT_GROUP, when: ON }, extra)), default: def, help: helpText });

export function lightFields(what = "dit model") {
  return {
    light: { type: "boolean", required: false, audience: "client", label: "Geeft licht",
      ui: ui("💡", "toggle", "werkbank", { group: LIGHT_GROUP }), default: false,
      help: help("Geeft " + what + " licht? Een warme gloed en een lichtplek op de grond.",
        "Aan voor een lantaarn, een fakkel aan de muur of een kampvuur. 's Nachts en binnen is het sterk, overdag zwak.",
        "Je ziet niets → zet de klok in de game op nacht, of maak Sterkte hoger.") },
    lightColor: { type: "color", required: false, audience: "client", label: "Kleur",
      ui: ui("🎨", "color", "werkbank", { group: LIGHT_GROUP, when: ON }), default: LIGHT_DEFAULTS.color,
      help: help("De kleur van het licht.", "Oranje-geel voor vuur en kaarsen, wit-blauw voor magie.", "Te fel of te wit → kies een warmere, donkerdere kleur.") },
    lightStrength: num("Sterkte", "🔆", LIGHT_DEFAULTS.strength, 0, 3, { step: 0.05, unit: "×", range: [0, 2] },
      help("Hoe fel de gloed en de lichtplek zijn.", "1 voor een lantaarn, 1,5-2 voor een kampvuur.", "Wordt een witte vlek → lager.")),
    lightRange: num("Reikwijdte", "📡", LIGHT_DEFAULTS.range, 0.5, 20, { step: 0.1, unit: "m", range: [1, 10] },
      help("Hoe groot de lichtplek op de grond is (straal).", "3-4 m voor een lantaarn, 6-8 m voor een kampvuur.", "De plek valt over een muur heen → kleiner.")),
    lightFlicker: num("Flikkeren", "🔥", LIGHT_DEFAULTS.flicker, 0, 1, { step: 0.05, range: [0, 1] },
      help("Hoeveel het licht flikkert, zoals een vlam. 0 = rustig licht.", "0,3 voor een lantaarn, 0,6 voor een fakkel of kampvuur, 0 voor magie.", "Te onrustig → lager.")),
    lightGlow: num("Gloed", "✨", LIGHT_DEFAULTS.glow, 0.05, 4, { step: 0.05, unit: "m", range: [0.1, 2] },
      help("Hoe groot de gloed rond de vlam is.", "0,4-0,8 m voor een lantaarn, 1-2 m voor een kampvuur.", "De gloed ligt over het hele model → kleiner.")),
    lightHeight: num("Hoogte vlam", "↕️", LIGHT_DEFAULTS.height, -5, 30, { step: 0.05, unit: "m", range: [0, 5] },
      help("Hoe hoog de vlam boven de voet van het model zit.", "Zet de gloed precies in het glas van de lantaarn of op de fakkel. Makkelijker: ✋ Vlam verplaatsen hierboven.", "De gloed zweeft naast de vlam → pas de hoogte aan.")),
    // Kevin 26-11: de vlam ook opzij zetten (een fakkel aan een muur), net als het wapen bij 🧍 Passen. Draait mee met het model.
    lightX: num("Vlam X", "↔️", LIGHT_DEFAULTS.x, -30, 30, { step: 0.01, unit: "m", range: [-3, 3] },
      help("Hoe ver de vlam opzij van het midden van het model zit (draait mee met het model).", "Makkelijker: ✋ Vlam verplaatsen hierboven en dan G in de 3D-view.", "De gloed zit naast de fakkel → schuif hem terug.")),
    lightZ: num("Vlam Z", "↕️", LIGHT_DEFAULTS.z, -30, 30, { step: 0.01, unit: "m", range: [-3, 3] },
      help("Hoe ver de vlam voor of achter het midden van het model zit (draait mee met het model).", "Makkelijker: ✋ Vlam verplaatsen hierboven en dan G in de 3D-view.", "De gloed zit in de muur → schuif hem naar voren.")),
    lightNightOnly: { type: "boolean", required: false, audience: "client", label: "Alleen 's nachts",
      ui: ui("🌙", "toggle", "werkbank", { group: LIGHT_GROUP, when: ON }), default: LIGHT_DEFAULTS.nightOnly,
      help: help("Gaat het licht overdag helemaal uit?", "Aan voor straatlantaarns. Uit voor een kampvuur of fakkel (overdag zwak).", "Brandt overdag nog → zet dit aan.") }
  };
}

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Wat de game nodig heeft (null = geeft geen licht). Dezelfde vorm voor een model (L1) en straks een item (L3).
export function lightOf(body) {
  if (!body || body.light !== true) return null;
  const color = typeof body.lightColor === "string" && /^#[0-9a-fA-F]{6}$/.test(body.lightColor) ? body.lightColor.toLowerCase() : LIGHT_DEFAULTS.color;
  return {
    color,
    strength: clamp(body.lightStrength, 0, 3, LIGHT_DEFAULTS.strength),
    range: clamp(body.lightRange, 0.5, 20, LIGHT_DEFAULTS.range),
    flicker: clamp(body.lightFlicker, 0, 1, LIGHT_DEFAULTS.flicker),
    glow: clamp(body.lightGlow, 0.05, 4, LIGHT_DEFAULTS.glow),
    height: clamp(body.lightHeight, -5, 30, LIGHT_DEFAULTS.height),
    x: clamp(body.lightX, -30, 30, LIGHT_DEFAULTS.x),
    z: clamp(body.lightZ, -30, 30, LIGHT_DEFAULTS.z),
    nightOnly: body.lightNightOnly === true
  };
}
