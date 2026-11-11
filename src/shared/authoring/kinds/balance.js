// Werkbank Fase 7: balans en maker-controle. Drie kaarten in Instellingen:
// - Balans: de knoppen XP-tempo en Terugkomen (de server past ze toe) en de grens voor "te ruime farmbron".
// - Terugkomtijden: de vier keuzes van een pickup ("Terugkomen"), eerst vast in de code.
// - Uitrustingsvakken: welke vakken een character heeft en hoe ze heten, eerst vast in de code.
// De ID's blijven vast: kaarten en characters verwijzen ernaar.
import { help, ui } from "./ui.js";

const slider = (label, icon, def, min, max, step, unit, range, helpText, extra = {}) => ({ type: "integer", required: false, min, max, audience: "client", label,
  ui: ui(icon, "slider", "instellingen", Object.assign({ step, range }, unit ? { unit } : {}, extra)), default: def, help: helpText });

// Vaste keuzes voor "Terugkomen" van een pickup. De tijd staat in Instellingen > Terugkomtijden.
export const RESPAWN_POLICY_DEFS = Object.freeze([
  { id: "respawn_policy.fast", field: "fastS", name: "Snel", icon: "🐇", seconds: 45 },
  { id: "respawn_policy.standard", field: "standardS", name: "Gewoon", icon: "⏳", seconds: 90 },
  { id: "respawn_policy.slow", field: "slowS", name: "Langzaam", icon: "🐢", seconds: 450 },
  { id: "respawn_policy.rare", field: "rareS", name: "Zeldzaam", icon: "💎", seconds: 2700 }
]);

// Vaste uitrustingsvakken. Aan/uit en de naam staan in Instellingen > Uitrustingsvakken.
export const EQUIPMENT_SLOT_DEFS = Object.freeze([
  { id: "equipment_slot.head", key: "head", name: "Hoofd", icon: "🪖" },
  { id: "equipment_slot.chest", key: "chest", name: "Borst", icon: "🥋" },
  { id: "equipment_slot.hands", key: "hands", name: "Handen", icon: "🧤" },
  { id: "equipment_slot.legs", key: "legs", name: "Benen", icon: "👖" },
  { id: "equipment_slot.feet", key: "feet", name: "Voeten", icon: "🥾" },
  { id: "equipment_slot.main_hand", key: "main_hand", name: "Wapenhand", icon: "🗡️" },
  { id: "equipment_slot.off_hand", key: "off_hand", name: "Andere hand", icon: "🛡️" },
  { id: "equipment_slot.neck", key: "neck", name: "Ketting", icon: "📿" },
  { id: "equipment_slot.ring", key: "ring", name: "Ring", icon: "💍" }
]);

const SLOT_ON_GROUP = "✅ Welke vakken zijn er";
const SLOT_NAME_GROUP = "🏷️ Hoe de vakken heten";
const onField = (slot) => "on_" + slot.key;
const nameField = (slot) => "name_" + slot.key;

export function secondsText(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return s + " s";
  if (s < 3600) return (s % 60 ? (s / 60).toFixed(1).replace(".", ",") : String(s / 60)) + " min";
  return (s % 3600 ? (s / 3600).toFixed(1).replace(".", ",") : String(s / 3600)) + " uur";
}

export const BALANCE_KINDS = {
  balance_settings: {
    label: "Balans",
    icon: "⚖️",
    place: "instellingen",
    singleton: true,
    domain: "project",
    fields: {
      xpRatePct: slider("XP-tempo", "⭐", 100, 10, 1000, 10, "%", [10, 400],
        help("Hoe snel spelers XP krijgen. 100 % = wat op de kaarten staat. 200 % = alles geeft dubbel XP (vijanden en quests).",
          "100 % gewoon. 200 % voor een XP-weekend of om snel te testen.",
          "Spelers stijgen te snel → lager. Het duurt te lang → hoger.")),
      respawnRatePct: slider("Terugkomen", "⏳", 100, 10, 1000, 10, "%", [10, 400],
        help("Hoe snel vijanden, grondstoffen en pickups terugkomen. 100 % = de tijd op de kaart. 200 % = twee keer zo snel terug; 50 % = twee keer zo langzaam.",
          "100 % gewoon. Hoger als er veel spelers tegelijk zijn.",
          "Spelers staan te wachten op vijanden → hoger. De wereld loopt te vol of farmen gaat te hard → lager.")),
      farmLevelsPerHour: slider("Waarschuw bij farmen sneller dan", "🚜", 20, 1, 500, 1, "levels per uur", [1, 60],
        help("Vanaf welk tempo een gebied een oranje melding 'te ruime farmbron' krijgt: zoveel levels per uur door steeds dezelfde vijanden of herhaalbare quests te doen.",
          "20 = een level per 3 minuten. Lager is strenger.",
          "Te veel oranje meldingen over farmen → hoger. Je wilt dat levelen langer duurt → lager, en pas de vijanden aan."))
    }
  },
  respawn_settings: {
    label: "Terugkomtijden",
    icon: "⏳",
    place: "instellingen",
    singleton: true,
    domain: "project",
    fields: Object.fromEntries(RESPAWN_POLICY_DEFS.map((policy) => [policy.field,
      slider(policy.name, policy.icon, policy.seconds, 5, 86400, 5, "s", [5, policy.seconds * 4],
        help("Hoe lang een pickup met Terugkomen '" + policy.name + "' wegblijft nadat iemand hem pakte.",
          secondsText(policy.seconds) + " is de standaard.",
          "Pickups komen te snel terug → hoger. Spelers wachten te lang → lager."))]))
  },
  equipment_settings: {
    label: "Uitrustingsvakken",
    icon: "⛑️",
    place: "instellingen",
    singleton: true,
    domain: "project",
    fields: Object.assign({},
      Object.fromEntries(EQUIPMENT_SLOT_DEFS.map((slot) => [onField(slot), { type: "boolean", required: false, audience: "client", label: slot.name,
        ui: ui(slot.icon, "toggle", "instellingen", { group: SLOT_ON_GROUP }), default: true,
        help: help("Of een character het vak " + slot.name + " heeft. Uit = het vak staat niet in het uitrustingsscherm en items voor dit vak kun je niet dragen.",
          "Aan voor vakken waar je items voor maakt.",
          "Een leeg vak dat je nooit gebruikt → uit. Item kun je niet dragen → zet het vak aan.") }])),
      Object.fromEntries(EQUIPMENT_SLOT_DEFS.map((slot) => [nameField(slot), { type: "text", required: false, maxLength: 24, audience: "client", label: slot.name,
        ui: ui(slot.icon, "text", "instellingen", { group: SLOT_NAME_GROUP }), default: slot.name,
        help: help("De naam van dit vak in de game en bij een item (Uitrusting).",
          "Kort, bijv. \"" + slot.name + "\".",
          "Naam past niet in het vak → korter.") }])))
  }
};

const clampInt = (raw, field) => {
  const value = Math.round(Number(raw));
  return raw !== undefined && raw !== null && raw !== "" && Number.isFinite(value) ? Math.min(field.max, Math.max(field.min, value)) : field.default;
};

// De knoppen van Balans (zonder kaart: alles 100 %).
export function balanceValues(body = null) {
  const fields = BALANCE_KINDS.balance_settings.fields;
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, clampInt(body ? body[key] : undefined, field)]));
}

// De vier terugkomtijden voor de wereld: [{ id, displayName, seconds }]. De naam zegt meteen hoe lang.
export function respawnPoliciesFrom(body = null) {
  const fields = BALANCE_KINDS.respawn_settings.fields;
  return RESPAWN_POLICY_DEFS.map((policy) => {
    const seconds = clampInt(body ? body[policy.field] : undefined, fields[policy.field]);
    return { id: policy.id, displayName: policy.name + " (" + secondsText(seconds) + ")", seconds };
  });
}

// De vakken die aan staan, in vaste volgorde: [{ id, displayName }].
export function equipmentSlotsFrom(body = null) {
  return EQUIPMENT_SLOT_DEFS.filter((slot) => !body || body[onField(slot)] !== false).map((slot) => {
    const name = body && typeof body[nameField(slot)] === "string" ? body[nameField(slot)].trim().slice(0, 24) : "";
    return { id: slot.id, displayName: name || slot.name };
  });
}
