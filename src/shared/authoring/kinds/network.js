// MMO-verbinding (3-11): hoe de game en de server de eigen speler en andere spelers soepel houden.
// Instellingen > Verbinding. Eén keuzelijst "Standaard" (Custom + 7) zet alle schuiven tegelijk; zelf schuiven
// maakt het weer Custom. De wereldbouwer zet de waarden in world.mmo.network (game én server lezen die).
import { help, ui } from "./ui.js";

const GROUP_OTHERS = "🧍 Andere spelers";
const GROUP_STEER = "🔧 Bijsturen tijdens lopen";
const GROUP_HEALTH = "📊 Serverstatus onderin";

const num = (label, icon, def, min, max, step, unit, helpText, extra = {}) => ({ type: "number", required: false, min, max, audience: "client", label,
  ui: ui(icon, "slider", "instellingen", Object.assign({ step, unit }, extra)), default: def, help: helpText });
const toggle = (label, icon, def, helpText, extra = {}) => ({ type: "boolean", required: false, audience: "client", label,
  ui: ui(icon, "toggle", "instellingen", extra), default: def, help: helpText });

// De 7 standaarden. Elke standaard zet precies deze schuiven.
export const NETWORK_PRESETS = Object.freeze({
  smooth_mmo: Object.freeze({ serverTickRateHz: 30, snapshotRateHz: 20, inputSendRateHz: 30, ownPredictionDeadzone: 0.7, ownCorrectionBlendMs: 650,
    ownPostInputHoldMs: 1200, remoteInterpolationBaseDelayMs: 220, remoteMaxExtrapolationMs: 80, ownSmallCorrectionThreshold: 1.7,
    ownActiveCorrectionMaxUnits: 0.02, ownCorrectionMergeFactor: 0.2 }),
  balanced: Object.freeze({ serverTickRateHz: 30, snapshotRateHz: 20, inputSendRateHz: 30, ownPredictionDeadzone: 0.5, ownCorrectionBlendMs: 450,
    ownPostInputHoldMs: 700, remoteInterpolationBaseDelayMs: 200, remoteMaxExtrapolationMs: 80, ownSmallCorrectionThreshold: 1.3,
    ownActiveCorrectionMaxUnits: 0.05, ownCorrectionMergeFactor: 0.35 }),
  stable: Object.freeze({ serverTickRateHz: 30, snapshotRateHz: 15, inputSendRateHz: 30, ownPredictionDeadzone: 0.55, ownCorrectionBlendMs: 500,
    ownPostInputHoldMs: 850, remoteInterpolationBaseDelayMs: 230, remoteMaxExtrapolationMs: 100, ownSmallCorrectionThreshold: 1.4,
    ownActiveCorrectionMaxUnits: 0.04, ownCorrectionMergeFactor: 0.3 }),
  responsive: Object.freeze({ serverTickRateHz: 40, snapshotRateHz: 20, inputSendRateHz: 40, ownPredictionDeadzone: 0.4, ownCorrectionBlendMs: 375,
    ownPostInputHoldMs: 550, remoteInterpolationBaseDelayMs: 160, remoteMaxExtrapolationMs: 70, ownSmallCorrectionThreshold: 1.1,
    ownActiveCorrectionMaxUnits: 0.07, ownCorrectionMergeFactor: 0.45 }),
  fast: Object.freeze({ serverTickRateHz: 50, snapshotRateHz: 25, inputSendRateHz: 50, ownPredictionDeadzone: 0.35, ownCorrectionBlendMs: 325,
    ownPostInputHoldMs: 450, remoteInterpolationBaseDelayMs: 130, remoteMaxExtrapolationMs: 60, ownSmallCorrectionThreshold: 1,
    ownActiveCorrectionMaxUnits: 0.1, ownCorrectionMergeFactor: 0.6 }),
  low_bandwidth: Object.freeze({ serverTickRateHz: 20, snapshotRateHz: 10, inputSendRateHz: 20, ownPredictionDeadzone: 0.65, ownCorrectionBlendMs: 600,
    ownPostInputHoldMs: 1000, remoteInterpolationBaseDelayMs: 260, remoteMaxExtrapolationMs: 120, ownSmallCorrectionThreshold: 1.6,
    ownActiveCorrectionMaxUnits: 0.03, ownCorrectionMergeFactor: 0.25 }),
  lan_debug: Object.freeze({ serverTickRateHz: 60, snapshotRateHz: 30, inputSendRateHz: 60, ownPredictionDeadzone: 0.25, ownCorrectionBlendMs: 250,
    ownPostInputHoldMs: 300, remoteInterpolationBaseDelayMs: 90, remoteMaxExtrapolationMs: 40, ownSmallCorrectionThreshold: 0.85,
    ownActiveCorrectionMaxUnits: 0.14, ownCorrectionMergeFactor: 0.75 })
});

export const NETWORK_PRESET_LABELS = Object.freeze({
  custom: "Custom (eigen schuiven)",
  smooth_mmo: "1 Rustig MMO (aanrader)",
  balanced: "2 Gebalanceerd",
  stable: "3 Stabiel (wisselende wifi)",
  responsive: "4 Strak",
  fast: "5 Snel (competitief)",
  low_bandwidth: "6 Zwakke verbinding",
  lan_debug: "7 Lokaal testen (LAN)"
});

// Waarom elke standaard bestaat en wat er anders aan is (staat onder de keuzelijst).
export const NETWORK_PRESET_REASONS = Object.freeze({
  custom: "Jouw eigen waarden. Schuif je aan één schuif, dan wordt het vanzelf Custom.",
  smooth_mmo: "Voor een gewone MMO op gewoon internet. Kleine verschillen met de server worden genegeerd en rustig weggewerkt: bijna nooit trekken. Anders: grootste speling (0,7 m), langzaam bijschuiven, lang wachten na loslaten.",
  balanced: "Het midden: 30 server-ticks, 20 updates per seconde. Goed startpunt. Anders: gemiddelde speling (0,5 m) en gemiddeld bijschuiven.",
  stable: "Voor wifi die soms hapert. Iets minder updates (15/s) en een grotere buffer voor andere spelers, zodat haperingen niet opvallen.",
  responsive: "Strakker: meer ticks (40/s), kleinere speling (0,4 m). Je ziet sneller waar de server je ziet. Vraagt meer van server en internet.",
  fast: "Voor snelle actie of PvP op een sterke server: 50 ticks, 25 updates per seconde, kleine speling. Zwaarder voor de server (oude laptop: liever niet).",
  low_bandwidth: "Voor 4G, een oude laptop of veel spelers tegelijk: weinig berichten (20 ticks, 10 updates/s). Andere spelers lopen iets meer achter, jij merkt weinig.",
  lan_debug: "Alleen om te testen als de server in hetzelfde netwerk staat: alles op maximaal en bijna geen speling. Elke afwijking is meteen te zien."
});

export const NETWORK_PRESET_ORDER = Object.freeze(["custom", "smooth_mmo", "balanced", "stable", "responsive", "fast", "low_bandwidth", "lan_debug"]);

export const NETWORK_KINDS = {
  network_settings: {
    label: "Verbinding (MMO)",
    icon: "📡",
    place: "instellingen",
    singleton: true,
    domain: "project",
    presetField: "networkPreset",
    fields: {
      networkPreset: { type: "select", required: false, options: NETWORK_PRESET_ORDER.slice(), optionLabels: NETWORK_PRESET_LABELS,
        presets: NETWORK_PRESETS, optionHelp: NETWORK_PRESET_REASONS, audience: "client", label: "Standaard",
        ui: ui("🎚️", "select", "instellingen"), default: "custom",
        help: help("Kies een van de 7 standaarden: alle schuiven hieronder springen dan tegelijk goed. Onder de keuze staat waarom die standaard bestaat.",
          "Begin met 1 Rustig MMO. Trekt het nog? Probeer 3 Stabiel. Wil je het strakker? 4 Strak.",
          "Je wordt teruggetrokken → kies 1 Rustig MMO en kijk naar het lampje in de game (oranje = de server ziet je ergens anders).") },
      showHealthPing: toggle("Ping tonen", "📶", true,
        help("Toont onderin hoe lang een bericht heen en terug naar de server duurt.",
          "Aan voor een snelle controle van je verbinding.", "Hoge ping betekent meestal een trage of drukke netwerkverbinding."), { group: GROUP_HEALTH }),
      showHealthTps: toggle("TPS tonen", "⏱️", true,
        help("Toont hoeveel wereld-ticks de server werkelijk per seconde uitvoert.",
          "Dicht bij het ingestelde aantal server-ticks is gezond.", "Een lage TPS betekent dat de server de simulatie niet op tijd bijhoudt."), { group: GROUP_HEALTH }),
      showHealthMspt: toggle("MSPT tonen", "⌛", true,
        help("Toont hoeveel milliseconden de server gemiddeld nodig heeft voor één wereld-tick.",
          "Lager dan de tijd die voor één tick beschikbaar is.", "Hoge MSPT betekent dat één server-tick te veel werk kost."), { group: GROUP_HEALTH }),
      showHealthCpu: toggle("Server-CPU tonen", "🖥️", true,
        help("Toont hoeveel CPU het game-serverproces gebruikt.",
          "Onder 70% is normaal.", "Een hoge CPU samen met hoge MSPT wijst op een zwaar belaste server."), { group: GROUP_HEALTH }),
      showHealthGpu: toggle("GPU tonen", "🎮", true,
        help("Toont hoeveel van elke beeldtijd de grafische kaart van jouw apparaat bezig is.",
          "Onder 70% is normaal; dan is er nog ruimte.", "Rond 100% is de grafische kaart de rem: zet Beeld of Scherpte lager. Een streepje betekent dat de browser dit niet kan meten."), { group: GROUP_HEALTH }),
      showHealthPacketLoss: toggle("Packet loss tonen", "📦", true,
        help("Toont welk deel van de recente ping-metingen geen antwoord kreeg.",
          "0% is goed.", "Dit is een praktische verbindingsmeting; bij WebSockets is rauw TCP-pakketverlies niet rechtstreeks zichtbaar."), { group: GROUP_HEALTH }),
      ownPredictionDeadzone: num("Speling eigen plek", "🎯", 0.35, 0, 2, 0.05, "m",
        help("Hoe ver de server je ergens anders mag zien voordat de game je bijschuift. Kleiner verschil wordt genegeerd.",
          "0,35 tot 0,7 m.", "Je schokt steeds een klein stukje → hoger. Je loopt ver van waar de server je ziet → lager."), { range: [0, 1.5] }),
      ownCorrectionBlendMs: num("Bijschuiven duurt", "🧈", 300, 50, 1000, 10, "ms",
        help("Hoe lang het duurt om je naar de plek van de server te schuiven (in plaats van te springen).",
          "300 tot 650 ms.", "Je springt zichtbaar → hoger. Je glijdt lang na → lager.")),
      ownPostInputHoldMs: num("Wachten na loslaten", "✋", 650, 0, 2000, 10, "ms",
        help("Na het loslaten van de toetsen wacht de game zo lang tot de server ook stilstaat, voordat hij je plek vergelijkt.",
          "500 tot 1200 ms (hoger bij hogere ping).", "Na stoppen schuif je even terug → hoger. Na stoppen duurt het lang voor je goed staat → lager.")),
      snapshotRateHz: num("Updates naar spelers", "📨", 20, 5, 30, 1, "/s",
        help("Hoe vaak per seconde de server iedereen vertelt waar spelers staan.",
          "15 tot 20 per seconde.", "Andere spelers haperen → hoger. Server of internet te zwaar → lager.")),
      serverTickRateHz: num("Server-ticks", "⏱️", 50, 10, 60, 1, "/s",
        help("Hoe vaak per seconde de server de wereld uitrekent (lopen, botsen, vechten).",
          "30 per seconde. Hoger alleen op een sterke server.", "Server traag of de oude laptop loopt vast → lager. Bewegen voelt hoekig → hoger.")),
      inputSendRateHz: num("Jouw toetsen per seconde", "⌨️", 30, 10, 60, 1, "/s",
        help("Hoe vaak per seconde de game jouw toetsen en plek naar de server stuurt. Niet hoger dan de server-ticks.",
          "Gelijk aan de server-ticks (meestal 30).", "Server volgt je slecht → hoger. Te veel berichten → lager."),
        { range: [10, 60] }),
      remoteInterpolationBaseDelayMs: num("Buffer andere spelers", "🧍", 200, 0, 300, 10, "ms",
        help("Andere spelers worden zo veel later getoond, zodat ze vloeiend lopen ook als een bericht laat is.",
          "Ongeveer 4 updates: 200 ms bij 20 updates per seconde.", "Andere spelers springen → hoger. Andere spelers lopen te ver achter → lager."),
        { group: GROUP_OTHERS }),
      remoteMaxExtrapolationMs: num("Doorlopen bij laat bericht", "⏩", 80, 0, 250, 10, "ms",
        help("Hoe lang een andere speler mag doorlopen als het volgende bericht te laat is.",
          "60 tot 120 ms.", "Andere spelers staan even stil en springen → hoger. Ze lopen door muren en springen terug → lager."),
        { group: GROUP_OTHERS }),
      ownSmallCorrectionThreshold: num("Grens springen of schuiven", "📏", 1, 0, 5, 0.05, "m",
        help("Als je stilstaat: een verschil met de server tot deze afstand wordt meteen goed gezet, groter wordt rustig geschoven.",
          "1 tot 1,7 m.", "Je springt bij stilstaan → lager. Kleine schokjes bij stilstaan → hoger."),
        { group: GROUP_STEER }),
      ownActiveCorrectionMaxUnits: num("Bijsturen per update", "🧭", 0.08, 0, 2, 0.01, "m",
        help("Hoeveel de game je tijdens het lopen per serverbericht mag bijsturen. 0 = tijdens lopen niet bijsturen.",
          "0,02 tot 0,1 m.", "Je voelt getrokken tijdens lopen → lager. Na lang lopen een grote sprong terug → hoger."),
        { group: GROUP_STEER, range: [0, 0.5] }),
      ownCorrectionMergeFactor: num("Nieuwe correctie telt", "🔀", 0.35, 0, 1, 0.05, "",
        help("Hoe zwaar een nieuwe correctie van de server telt tegenover de vorige (0 = rustig, 1 = meteen de nieuwe).",
          "0,2 tot 0,5.", "Bijsturen voelt onrustig → lager. De game volgt de server te traag → hoger."),
        { group: GROUP_STEER }),
      ownKeepPredictionDuringInput: toggle("Zelf lopen tijdens toetsen", "🏃", true,
        help("Tijdens het lopen beweegt de game je zelf en wacht hij niet op de server (de server controleert wel).",
          "Aan laten staan.", "Uit voelt traag en schokkerig → zet aan."), { group: GROUP_STEER }),
      predictionEnabled: toggle("Voorspellen", "🔮", true,
        help("De game laat je meteen lopen en rekent zelf uit waar je uitkomt. Uit = je wacht steeds op de server.",
          "Aan. Alleen uit om te testen.", "Lopen voelt vertraagd → zet aan."), { group: GROUP_STEER }),
      reconciliationEnabled: toggle("Bijsturen naar de server", "🧲", true,
        help("De game schuift je naar de plek van de server als die echt anders is. Uit = de game luistert niet naar correcties.",
          "Aan. Alleen uit om te testen.", "Je loopt ergens anders dan andere spelers je zien → zet aan."), { group: GROUP_STEER })
    }
  }
};

// Voor de wereldbouwer: de waarden van de kaart (of een standaard) als world.mmo.network.
export function networkValues(body = null) {
  const fields = NETWORK_KINDS.network_settings.fields;
  const values = {};
  for (const [key, field] of Object.entries(fields)) {
    const value = body ? body[key] : undefined;
    values[key] = value === undefined || value === null || value === "" ? field.default : value;
  }
  const preset = NETWORK_PRESETS[values.networkPreset] || null;
  if (preset) Object.assign(values, preset);
  const base = Number(values.remoteInterpolationBaseDelayMs);
  const inputRate = Math.min(Number(values.inputSendRateHz), Number(values.serverTickRateHz));
  return Object.assign(values, {
    enabled: true,
    networkPreset: preset ? values.networkPreset : "custom",
    inputSendRateHz: inputRate,
    snapshotRateHz: Math.min(Number(values.snapshotRateHz), Number(values.serverTickRateHz)),
    moveSendIntervalMs: Math.max(16, Math.min(120, Math.round(1000 / inputRate))),
    remoteInterpolationMinDelayMs: Math.max(0, Math.round(base * 0.8)),
    remoteInterpolationMaxDelayMs: Math.min(500, Math.round(base * 1.4))
  });
}
