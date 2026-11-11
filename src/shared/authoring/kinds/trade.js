// Werkbank Fase 8b: ruilen, markt en post. Eén kaart in Instellingen > 🤝 Handel.
// Dit vervangt de oude Trade/Market/Mail Policy-nodes: de server leest alleen deze kaart nog.
// - Ruilen: twee spelers leggen iets neer, zien precies wat ze geven en krijgen, en bevestigen beiden.
//   De ruil zelf gebeurt in één keer op de server (alles of niets), dus niets kan dubbel of kwijt.
// - Markt: je zet iets voor een vaste prijs neer; de koper betaalt, de verkoper krijgt het geld min de
//   marktbelasting uit Instellingen > 💰 Geld.
// - Post: waar het geld of het item heen gaat als de speler niet in de buurt is.
import { help, ui } from "./ui.js";

const TRADE_GROUP = "🤝 Ruilen met een speler";
const MARKET_GROUP = "🏪 Markt";
const MAIL_GROUP = "📬 Post";
const SPAM_GROUP = "🛡️ Tegen spammen";

const toggle = (label, icon, def, group, helpText) => ({ type: "boolean", required: false, audience: "client", label,
  ui: ui(icon, "toggle", "instellingen", { group }), default: def, help: helpText });
const int = (label, icon, def, min, max, step, unit, range, group, helpText) => ({ type: "integer", required: false, min, max, audience: "client", label,
  ui: ui(icon, "slider", "instellingen", Object.assign({ step, range, group }, unit ? { unit } : {})), default: def, help: helpText });

export const TRADE_KINDS = {
  trade_settings: {
    label: "Handel",
    icon: "🤝",
    place: "instellingen",
    singleton: true,
    domain: "project",
    fields: {
      tradeOn: toggle("Spelers mogen ruilen", "🤝", true, TRADE_GROUP,
        help("Of twee spelers rechtstreeks met elkaar kunnen ruilen (items en geld).",
          "Aan. Ruilen gaat altijd met een bevestiging van beide kanten.",
          "Je wilt dat alles via de markt gaat → uit.")),
      tradeDistance: int("Hoe dicht bij elkaar", "📏", 20, 1, 200, 1, "m", [1, 50], TRADE_GROUP,
        help("Hoe ver twee spelers maximaal van elkaar mogen staan om te ruilen.",
          "20 m: je moet elkaar kunnen zien.",
          "Spelers ruilen door een muur heen → lager.")),
      tradeSlots: int("Hoeveel dingen per kant", "🎒", 8, 1, 20, 1, "stuks", [1, 12], TRADE_GROUP,
        help("Hoeveel verschillende items of valuta's iemand in één ruil mag neerleggen.",
          "8 is ruim genoeg.",
          "Een ruil wordt onoverzichtelijk → lager.")),
      tradeHoldSeconds: int("Hoe lang een ruil open blijft", "⏳", 120, 20, 1800, 10, "s", [20, 600], TRADE_GROUP,
        help("Hoe lang een ruil blijft staan als niemand bevestigt. Daarna gaat alles terug naar de eigenaar.",
          "120 s is genoeg om even te overleggen.",
          "Spelers blijven in een open ruil hangen → lager.")),
      tradeInCombat: toggle("Ruilen tijdens een gevecht", "⚔️", false, TRADE_GROUP,
        help("Of je mag ruilen terwijl je in gevecht bent.",
          "Uit: eerst het gevecht af, dan ruilen.",
          "Spelers ontsnappen uit een gevecht via een ruil → uit laten.")),
      marketOn: toggle("Markt open", "🏪", true, MARKET_GROUP,
        help("Of spelers dingen op de markt mogen zetten en kopen. De belasting staat bij Instellingen > 💰 Geld.",
          "Aan, zodra er meerdere spelers zijn.",
          "Je bent nog aan het testen met één speler → uit.")),
      marketDays: int("Hoe lang iets op de markt staat", "📅", 1, 1, 30, 1, "dagen", [1, 14], MARKET_GROUP,
        help("Hoe lang een aanbod op de markt blijft staan. Daarna gaat het via de post terug naar de verkoper.",
          "1 dag houdt de markt actueel.",
          "De markt staat vol met oude dingen → lager.")),
      marketMaxPerPlayer: int("Hoeveel een speler tegelijk mag aanbieden", "🧾", 20, 1, 200, 1, "stuks", [1, 50], MARKET_GROUP,
        help("Hoeveel aanbiedingen één speler tegelijk op de markt mag hebben staan.",
          "20 is genoeg voor een gewone speler.",
          "Eén speler vult de hele markt → lager.")),
      mailKeepDays: int("Hoe lang post blijft liggen", "📬", 30, 1, 365, 1, "dagen", [1, 90], MAIL_GROUP,
        help("Hoe lang een bericht met geld of items in de postbus blijft staan voordat het verdwijnt.",
          "30 dagen: ruim genoeg om terug te komen.",
          "Spelers verliezen hun opbrengst → hoger.")),
      mailMax: int("Hoeveel berichten in de postbus", "📮", 100, 1, 1000, 1, "stuks", [10, 300], MAIL_GROUP,
        help("Hoeveel berichten er maximaal in de postbus van een speler passen.",
          "100 is ruim.",
          "De postbus loopt vol → hoger, of de bewaartijd lager.")),
      actionsPerHour: int("Hoeveel handelsacties per uur", "🛡️", 60, 1, 1000, 1, "per uur", [10, 300], SPAM_GROUP,
        help("Hoeveel keer één speler per uur mag ruilen, iets op de markt zetten of op de markt kopen. Zo kan niemand de server volgooien.",
          "60 = één keer per minuut; dat merkt een normale speler niet.",
          "Een bot spamt de markt → lager. Een drukke handelaar klaagt → hoger."))
    }
  }
};

// De waarden voor de wereld (alleen bekende velden, binnen min/max).
export function tradeValues(body = null) {
  const fields = TRADE_KINDS.trade_settings.fields;
  const values = {};
  for (const [key, field] of Object.entries(fields)) {
    const raw = body ? body[key] : undefined;
    if (field.type === "boolean") { values[key] = typeof raw === "boolean" ? raw : field.default; continue; }
    const value = Math.round(Number(raw));
    values[key] = raw !== undefined && raw !== null && raw !== "" && Number.isFinite(value) ? Math.min(field.max, Math.max(field.min, value)) : field.default;
  }
  return values;
}
