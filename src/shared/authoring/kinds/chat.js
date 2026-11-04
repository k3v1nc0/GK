// MMO stap 2 (3-11): praten met elkaar. Instellingen > Chat (MMO).
// De wereldbouwer zet de waarden in gameProject.playerRules.byType.chat_rules; server en game lezen die.
// Zonder kaart gelden de standaarden hieronder (chatValues(null)).
import { help, ui } from "./ui.js";

const int = (label, icon, def, min, max, step, unit, helpText, extra = {}) => ({ type: "integer", required: false, min, max, audience: "client", label,
  ui: ui(icon, "slider", "instellingen", Object.assign({ step }, unit ? { unit } : {}, extra)), default: def, help: helpText });
const text = (label, icon, def, maxLength, helpText) => ({ type: "text", required: false, maxLength, audience: "client", label,
  ui: ui(icon, "text", "instellingen"), default: def, help: helpText });

export const CHAT_KINDS = {
  chat_settings: {
    label: "Chat (MMO)",
    icon: "💬",
    place: "instellingen",
    singleton: true,
    domain: "project",
    fields: {
      nearMeters: int("In de buurt: zo ver", "📏", 40, 5, 300, 5, "m",
        help("Tot welke afstand spelers je berichten in het tabje Buurt zien (en de tekstballon boven je hoofd).",
          "30 tot 60 m: wie je op je scherm ziet.",
          "Spelers lezen elkaar niet terwijl ze dichtbij staan → hoger. Te veel berichten van ver weg → lager."), { range: [5, 150] }),
      maxLength: int("Langste bericht", "✏️", 160, 20, 500, 10, "tekens",
        help("Hoeveel letters één bericht mag hebben.",
          "100 tot 200. Kort houdt de chat leesbaar op de telefoon.",
          "Spelers komen letters tekort → hoger. Lange lappen tekst in beeld → lager."), { range: [20, 300] }),
      perTenSeconds: int("Berichten per 10 seconden", "🐢", 5, 1, 30, 1, "",
        help("Hoeveel berichten één speler mag sturen in 10 seconden (spam-rem op de server). Hetzelfde bericht direct nog eens mag niet.",
          "4 tot 6.",
          "Gewone spelers krijgen 'Rustig aan' → hoger. Iemand spamt de chat vol → lager."), { range: [1, 15] }),
      bubbleSeconds: int("Tekstballon boven het hoofd", "💭", 6, 0, 30, 1, "s",
        help("Hoe lang een bericht uit Buurt als ballon boven het hoofd van de speler blijft. 0 = geen ballon.",
          "4 tot 8 s.",
          "Je kunt de ballon niet uitlezen → langer. Ballonnen staan te lang in beeld → korter.")),
      quickMessages: text("Snelle berichten", "⚡", "👋 Hoi! | Help! | Bedankt! | Kom hier! | Volg mij!", 400,
        help("Knopjes in de chat: één tik = dit bericht sturen (fijn op de telefoon). Zet een | tussen de berichten.",
          "4 tot 6 korte berichten, bijvoorbeeld: 👋 Hoi! | Help! | Bedankt!",
          "Een knopje ontbreekt → controleer of er een | tussen staat. Te veel knopjes → haal er een paar weg.")),
      badWords: text("Woorden wegsterren", "🚫", "", 2000,
        help("Woorden die in de chat als *** verschijnen. Zet een komma tussen de woorden. Hoofdletters maken niet uit.",
          "Een korte lijst met scheldwoorden.",
          "Een gewoon woord wordt weggesterd → haal het uit de lijst. Een scheldwoord komt erdoor → voeg het toe."))
    }
  }
};

// De waarden voor de wereld (alleen bekende velden, getallen binnen min/max).
export function chatValues(body = null) {
  const fields = CHAT_KINDS.chat_settings.fields;
  const values = {};
  for (const [key, field] of Object.entries(fields)) {
    const raw = body ? body[key] : undefined;
    if (field.type === "text") { values[key] = typeof raw === "string" ? raw.slice(0, field.maxLength) : field.default; continue; }
    const value = Math.round(Number(raw));
    values[key] = raw !== undefined && raw !== null && raw !== "" && Number.isFinite(value) ? Math.min(field.max, Math.max(field.min, value)) : field.default;
  }
  return values;
}

// "👋 Hoi! | Help!" -> ["👋 Hoi!", "Help!"] (hooguit 8, elk hooguit 40 tekens).
export function chatQuickList(values) {
  return String(values?.quickMessages || "").split("|").map((entry) => entry.trim().slice(0, 40)).filter(Boolean).slice(0, 8);
}

// "Woord, ander woord" -> ["woord", "ander woord"] (kleine letters, hooguit 300).
export function chatBadWords(values) {
  return Array.from(new Set(String(values?.badWords || "").split(/[,;\n]/).map((entry) => entry.trim().toLowerCase()).filter((entry) => entry.length >= 2))).slice(0, 300);
}
