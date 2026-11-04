// MMO (3-11): samen spelen in een groep. Instellingen > Groep (MMO).
// De wereldbouwer zet de waarden in gameProject.playerRules.byType.party_rules; server en game lezen die.
// Zonder kaart gelden de standaarden hieronder (partyValues(null)).
import { help, ui } from "./ui.js";

const int = (label, icon, def, min, max, step, unit, helpText, extra = {}) => ({ type: "integer", required: false, min, max, audience: "client", label,
  ui: ui(icon, "slider", "instellingen", Object.assign({ step }, unit ? { unit } : {}, extra)), default: def, help: helpText });

export const PARTY_INVITE_RULES = Object.freeze(["all", "leader"]);

export const PARTY_KINDS = {
  party_settings: {
    label: "Groep (MMO)",
    icon: "🤝",
    place: "instellingen",
    singleton: true,
    domain: "project",
    fields: {
      maxMembers: int("Spelers in een groep", "👥", 5, 2, 40, 1, "",
        help("Hoeveel spelers samen in één groep mogen (jijzelf telt mee).",
          "5 voor een gewone groep. 10 tot 40 voor een grote raid.",
          "Vrienden passen niet in één groep → hoger. Teamleden-lijst linksboven te vol → lager."), { range: [2, 20] }),
      whoCanInvite: { type: "select", required: false, options: PARTY_INVITE_RULES.slice(), optionIcons: { all: "👥", leader: "👑" },
        optionLabels: { all: "Iedereen in de groep", leader: "Alleen de leider" }, audience: "client", label: "Wie mag uitnodigen (standaard)",
        ui: ui("✉️", "select", "instellingen"), default: "all",
        help: help("Wie er in een nieuwe groep spelers mag uitnodigen. De leider kan dit in de groep zelf aan of uit zetten (tik op Groep). Wie niet in een groep zit, mag altijd uitnodigen.",
          "Iedereen in de groep: makkelijk met vrienden. Alleen de leider: rustiger in grote groepen.",
          "Er worden te veel vreemden uitgenodigd → Alleen de leider. De leider is vaak weg → Iedereen in de groep.") },
      inviteTimeoutS: int("Uitnodiging geldig", "⏳", 60, 10, 600, 5, "s",
        help("Hoe lang een uitnodiging blijft staan voordat hij vanzelf verdwijnt.",
          "30 tot 90 seconden.",
          "Spelers missen de uitnodiging → langer. Oude uitnodigingen blijven te lang in beeld → korter."), { range: [10, 180] }),
      holdMs: int("Lang drukken voor menu", "👆", 500, 250, 1500, 50, "ms",
        help("Hoe lang je met je vinger op een speler moet drukken voor het menu (uitnodigen, doel kiezen). Met de muis: rechtsklik.",
          "400 tot 700 ms. Kort tikken blijft gewoon lopen.",
          "Het menu gaat open terwijl je wilt lopen → langer. Wachten op het menu duurt te lang → korter.")),
      farMeters: int("Teamlid ver weg vanaf", "📏", 60, 10, 500, 5, "m",
        help("Vanaf deze afstand wordt een teamlid linksboven grijs (te ver om te helpen of te genezen).",
          "40 tot 80 m.",
          "Teamleden zijn al grijs terwijl ze vlakbij staan → hoger. Je ziet niet dat iemand ver weg is → lager."), { range: [10, 200] })
    }
  }
};

// De waarden voor de wereld (alleen bekende velden, binnen min/max).
export function partyValues(body = null) {
  const fields = PARTY_KINDS.party_settings.fields;
  const values = {};
  for (const [key, field] of Object.entries(fields)) {
    const raw = body ? body[key] : undefined;
    if (field.type === "select") { values[key] = field.options.includes(raw) ? raw : field.default; continue; }
    const value = Math.round(Number(raw));
    values[key] = raw !== undefined && raw !== null && raw !== "" && Number.isFinite(value) ? Math.min(field.max, Math.max(field.min, value)) : field.default;
  }
  return values;
}
