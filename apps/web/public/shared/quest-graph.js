// Quest Builder stap 1 (4-11): een quest is een netwerk van stappen, geen rij.
// Een stap heeft doelen (alle of één van de verplichte), overgangen naar een volgende stap, en een quest
// eindigt in een of meer eindes. Gedeeld door de editor (browser) en de server (schema, build, quest-motor),
// zodat de quest-check in de Quest Builder en bij SAVE TO GAME precies hetzelfde zegt.

const ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

export const QUEST_LIMITS = Object.freeze({ steps: 64, objectives: 12, next: 4, title: 80, text: 300, amount: 9999 });

// Soorten doelen. event = de server telt gebeurtenissen (niet wat je nu hebt).
export const OBJECTIVE_KINDS = Object.freeze({
  defeat: Object.freeze({ icon: "⚔️", label: "Versla", refKind: "actor_archetype", amount: true, event: true, mark: true }),
  gather: Object.freeze({ icon: "🪵", label: "Verzamel", refKind: "resource_definition", amount: true, event: true, mark: true }),
  pickup: Object.freeze({ icon: "✋", label: "Pak op", refKind: "item_definition", amount: true, event: true }),
  collect: Object.freeze({ icon: "🎒", label: "Heb in je tas", refKind: "item_definition", amount: true }),
  deliver: Object.freeze({ icon: "📦", label: "Breng", refKind: "item_definition", amount: true, npc: true }),
  talk: Object.freeze({ icon: "💬", label: "Praat met", refKind: "npc" }),
  visit: Object.freeze({ icon: "🚶", label: "Ga naar", refKind: "npc" }),
  // Stap 3: gebieden (Questgebied uit de Area tool). De server kijkt zelf waar je bent.
  enter: Object.freeze({ icon: "🎯", label: "Ga naar gebied", refKind: "area" }),
  leave: Object.freeze({ icon: "🏃", label: "Verlaat gebied", refKind: "area" })
});
export const OBJECTIVE_ORDER = Object.freeze(["defeat", "gather", "pickup", "collect", "deliver", "talk", "visit", "enter", "leave"]);
// Stap 3: per stap hoe het gebied op de minimap en de kaart staat.
export const STEP_MAP_SHOW = Object.freeze({
  area: Object.freeze({ icon: "⭕", label: "Zoekgebied" }),
  point: Object.freeze({ icon: "📍", label: "Punt in het midden" }),
  hidden: Object.freeze({ icon: "🙈", label: "Verborgen" })
});

// verplicht = nodig om verder te gaan; mag = niet nodig; bonus = niet nodig, extra; verborgen = nodig, maar pas in beeld als het klaar is.
export const OBJECTIVE_ROLES = Object.freeze({
  required: Object.freeze({ icon: "⭐", label: "Verplicht", needed: true }),
  hidden: Object.freeze({ icon: "🙈", label: "Verborgen", needed: true }),
  optional: Object.freeze({ icon: "➕", label: "Mag", needed: false }),
  bonus: Object.freeze({ icon: "🎁", label: "Bonus", needed: false })
});
// Voor wie telt een doel (stap 2, samen questen). Team samen: één teller voor de groep; het doel wordt
// aantal × teamleden met deze quest op deze stap. Wie de groep verlaat houdt zijn eigen bijdrage.
export const OBJECTIVE_SHARES = Object.freeze({
  personal: Object.freeze({ icon: "🧍", label: "Ieder voor zich" }),
  team: Object.freeze({ icon: "👥", label: "Team samen" })
});
// Versla, Ieder voor zich: voor wie telt een kill. Standaard: wie meevocht plus de groep in de buurt.
export const OBJECTIVE_CREDITS = Object.freeze({
  group: Object.freeze({ icon: "👥", label: "Wie meevocht + groep in de buurt" }),
  fighters: Object.freeze({ icon: "⚔️", label: "Alleen wie meevocht" }),
  nearby: Object.freeze({ icon: "🌍", label: "Iedereen in de buurt met deze stap" })
});
// Hoe ver "in de buurt" is (meters), voor kills die meetellen voor de groep of voor iedereen.
export const QUEST_NEARBY_M = 50;
// Per quest: wat gebeurt er als je de groep verlaat (alleen bij Team samen-doelen). Niets wordt gekopieerd.
export const PARTY_LEAVE_RULES = Object.freeze({
  keep: Object.freeze({ icon: "🎒", label: "Meenemen: alleen verder" }),
  wait: Object.freeze({ icon: "⏸️", label: "Wachten tot je weer in een groep zit" }),
  fail: Object.freeze({ icon: "❌", label: "Quest mislukt" })
});
// Stap 4: hoe een quest start en wat je nodig hebt om hem te beginnen (EN = alles, OF = één is genoeg).
export const QUEST_START_MODES = Object.freeze({
  npc: Object.freeze({ icon: "🧑", label: "Bij een NPC (praten)" }),
  item: Object.freeze({ icon: "📜", label: "Item lezen (bijv. een brief uit een kist)" }),
  area: Object.freeze({ icon: "🎯", label: "Een Questgebied binnenlopen" }),
  auto: Object.freeze({ icon: "⛓️", label: "Vanzelf (bijv. meteen na een andere quest)" })
});
export const REQUIREMENT_MATCH = Object.freeze({ all: "EN: alles moet kloppen", any: "OF: één is genoeg" });
export const REQUIREMENT_KINDS = Object.freeze({
  level: Object.freeze({ icon: "⭐", label: "Level minstens" }),
  item: Object.freeze({ icon: "🎒", label: "Heeft item", refKind: "item_definition", amount: true }),
  quest: Object.freeze({ icon: "📜", label: "Quest af", refKind: "quest" }),
  class: Object.freeze({ icon: "🧙", label: "Klasse", refKind: "player_class" })
});
export const QUEST_START_LIMITS = Object.freeze({ rules: 8, level: 500 });
// Stap 5: wat een quest laat verschijnen hoort bij de quest (veld spawns), met een eigen naam, voor wie en wanneer weg.
// Een regel bij een stap (Als → Dan) laat het verschijnen. Nooit automatisch gekopieerd (ook niet bij groep verlaten).
export const QUEST_SPAWN_LIMITS = Object.freeze({ spawns: 8, count: 10, name: 60, rules: 6, text: 200 });
export const QUEST_SPAWN_AUDIENCE = Object.freeze({
  group: Object.freeze({ icon: "👥", label: "Voor de groep (alleen = alleen jij)" }),
  player: Object.freeze({ icon: "🧍", label: "Alleen voor de speler" }),
  all: Object.freeze({ icon: "🌍", label: "Voor iedereen" })
});
export const QUEST_SPAWN_DESPAWN = Object.freeze({
  quest: Object.freeze({ icon: "📜", label: "Tot ze dood zijn of de quest eindigt" }),
  step: Object.freeze({ icon: "🪜", label: "Weg als de stap klaar is" }),
  logout: Object.freeze({ icon: "🚪", label: "Weg na uitloggen (1 min)" })
});
// Als → Dan (regels per stap). Elke regel gaat 1× per keer dat je de stap binnenkomt.
export const RULE_WHEN = Object.freeze({
  start: Object.freeze({ icon: "▶️", label: "de stap begint" }),
  count: Object.freeze({ icon: "🔢", label: "een doel een aantal haalt" }),
  done: Object.freeze({ icon: "✅", label: "de stap klaar is" })
});
export const RULE_THEN = Object.freeze({
  spawn: Object.freeze({ icon: "👾", label: "laat vijanden verschijnen" }),
  message: Object.freeze({ icon: "💬", label: "zet een bericht in beeld" }),
  // Stap 6: de klok van deze stap starten of stoppen (gehaald).
  timer_start: Object.freeze({ icon: "⏱️", label: "start de klok" }),
  timer_stop: Object.freeze({ icon: "⏹️", label: "stop de klok (gehaald)" })
});
// Stap 6: tijd per stap. Klok = binnen zoveel seconden; wat er gebeurt als je te laat bent.
export const QUEST_TIMER_LIMITS = Object.freeze({ min: 5, max: 86400 });
export const TIMER_START = Object.freeze({
  step: Object.freeze({ icon: "▶️", label: "Zodra de stap begint" }),
  rule: Object.freeze({ icon: "⚡", label: "Pas door een regel (⚡ Dan: ⏱️ start de klok)" })
});
export const TIMER_SHARE = Object.freeze({
  personal: Object.freeze({ icon: "🧍", label: "Ieder een eigen klok" }),
  group: Object.freeze({ icon: "👥", label: "Eén klok voor de groep (gelijk bij iedereen)" })
});
export const TIMER_LATE = Object.freeze({
  fail: Object.freeze({ icon: "❌", label: "De quest mislukt (opnieuw beginnen kan)" }),
  restart: Object.freeze({ icon: "↩️", label: "De stap begint opnieuw" }),
  step: Object.freeze({ icon: "➡️", label: "Naar een andere stap" })
});
export const TIMER_LOGOUT = Object.freeze({
  run: Object.freeze({ icon: "⏩", label: "De klok loopt door" }),
  pause: Object.freeze({ icon: "⏸️", label: "De klok staat stil tot hij terug is" })
});
// Stap 6: hoe vaak mag een speler de quest doen (veld repeat; oud: repeatable = altijd).
export const QUEST_REPEAT = Object.freeze({
  once: Object.freeze({ icon: "1️⃣", label: "1 keer" }),
  always: Object.freeze({ icon: "🔁", label: "Zo vaak als hij wil" }),
  daily: Object.freeze({ icon: "📅", label: "Elke dag opnieuw" }),
  weekly: Object.freeze({ icon: "🗓️", label: "Elke week opnieuw (maandag)" }),
  cooldown: Object.freeze({ icon: "⏳", label: "Opnieuw na een wachttijd" })
});
export function questRepeatOf(body) {
  if (QUEST_REPEAT[body?.repeat]) return body.repeat;
  return body?.repeatable === true ? "always" : "once";
}
// "2 min", "1 u 30 min", "45 s".
export function durationText(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return [hours ? hours + " u" : "", minutes ? minutes + " min" : "", rest || (!hours && !minutes) ? rest + " s" : ""].filter(Boolean).join(" ");
}
export const STEP_MATCH = Object.freeze({ all: "Alle verplichte doelen", any: "Eén verplicht doel" });
export const STEP_KINDS = Object.freeze({ step: "Stap", end: "Einde" });

const STEP_KEYS = new Set(["stepId", "kind", "title", "text", "match", "objectives", "next", "mapRef", "mapShow", "rules", "timer"]);
const TIMER_KEYS = new Set(["seconds", "start", "share", "late", "lateTo", "logout"]);
const OBJECTIVE_KEYS = new Set(["objectiveId", "type", "ref", "npcRef", "amount", "role", "share", "credit", "areaRef", "mark", "spawnId"]);
const RULE_KEYS_STEP = new Set(["ruleId", "when", "objectiveId", "amount", "then", "spawnId", "text"]);
const SPAWN_KEYS = new Set(["spawnId", "name", "actorRef", "count", "areaRef", "audience", "despawn"]);
const isAreaRef = (value) => typeof value === "string" && value.startsWith("area:") && value.length <= 140;

// Ligt (x, z) binnen het gebied? points = [{x, z}] in meters (een veelhoek; een cirkel is een veelhoek met veel punten).
export function pointInArea(points, x, z) {
  const list = Array.isArray(points) ? points : [];
  if (list.length < 3 || !Number.isFinite(Number(x)) || !Number.isFinite(Number(z))) return false;
  let inside = false;
  for (let i = 0, j = list.length - 1; i < list.length; j = i, i += 1) {
    const a = list[i];
    const b = list[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
const NEXT_KEYS = new Set(["to"]);

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isText = (value, max) => typeof value === "string" && value.length <= max;

export function objectiveRole(objective) {
  return OBJECTIVE_ROLES[objective?.role] ? objective.role : "required";
}

export function objectiveNeeded(objective) {
  return OBJECTIVE_ROLES[objectiveRole(objective)].needed;
}

// Een quest zonder stappen (de snelle Quest-kaart) wordt vanzelf één stap + een einde.
// De ID's blijven die van vroeger, zodat lopende quests van spelers gewoon doorgaan.
export function stepsFromSimple(body) {
  const b = body || {};
  const target = b.targetNpcRef || b.giverRef || null;
  if ((b.goal || "deliver") === "visit") {
    return [
      { stepId: "step.visit", kind: "step", match: "all", objectives: [{ objectiveId: "objective.visit", type: "talk", ref: b.targetNpcRef || null }], next: [{ to: "end" }] },
      { stepId: "end", kind: "end", title: "Klaar" }
    ];
  }
  return [
    { stepId: "step.deliver", kind: "step", match: "all",
      objectives: [{ objectiveId: "objective.deliver", type: "deliver", ref: b.itemRef || null, npcRef: target, amount: Number.isInteger(b.amount) ? b.amount : 1 }], next: [{ to: "end" }] },
    { stepId: "end", kind: "end", title: "Klaar" }
  ];
}

export function questSteps(body) {
  return Array.isArray(body?.steps) && body.steps.length ? body.steps : stepsFromSimple(body);
}

export function hasOwnSteps(body) {
  return Array.isArray(body?.steps) && body.steps.length > 0;
}

// Vorm-controle bij opslaan (schema). Een half ingevuld doel mag opgeslagen worden; de quest-check zegt wat er nog mist.
export function questStepsShapeIssues(value) {
  const issues = [];
  const refs = [];
  if (!Array.isArray(value)) return { issues: ["Stappen moet een lijst zijn."], refs };
  if (value.length > QUEST_LIMITS.steps) issues.push("Hooguit " + QUEST_LIMITS.steps + " stappen.");
  const stepIds = new Set();
  value.forEach((step, index) => {
    const where = "Stap " + (index + 1);
    if (!isObject(step)) { issues.push(where + " is ongeldig."); return; }
    const unknown = Object.keys(step).filter((key) => !STEP_KEYS.has(key));
    if (unknown.length) issues.push(where + ": onbekend veld " + unknown.join(", ") + ".");
    if (typeof step.stepId !== "string" || step.stepId.length > 60 || !ID_PATTERN.test(step.stepId)) issues.push(where + ": ongeldige stap-ID.");
    else if (stepIds.has(step.stepId)) issues.push(where + ": stap-ID " + step.stepId + " komt twee keer voor.");
    else stepIds.add(step.stepId);
    if (!STEP_KINDS[step.kind]) issues.push(where + ": soort moet stap of einde zijn.");
    // Naam mag leeg: dan toont de game het doel (bijv. "Versla 3× Wolf").
    if (step.title !== undefined && step.title !== null && !isText(step.title, QUEST_LIMITS.title)) issues.push(where + ": de naam is te lang.");
    if (step.text !== undefined && step.text !== null && !isText(step.text, QUEST_LIMITS.text)) issues.push(where + ": de uitleg is te lang.");
    if (step.match !== undefined && step.match !== null && !STEP_MATCH[step.match]) issues.push(where + ": ongeldige keuze bij Klaar als.");
    if (step.mapRef !== undefined && step.mapRef !== null) { if (!isAreaRef(step.mapRef)) issues.push(where + ": Kaart moet een Questgebied zijn."); else refs.push(step.mapRef); }
    if (step.mapShow !== undefined && step.mapShow !== null && !STEP_MAP_SHOW[step.mapShow]) issues.push(where + ": ongeldige keuze bij Kaart.");
    if (step.next !== undefined && step.next !== null) {
      if (!Array.isArray(step.next) || step.next.length > QUEST_LIMITS.next) issues.push(where + ": hooguit " + QUEST_LIMITS.next + " overgangen.");
      else step.next.forEach((link) => {
        if (!isObject(link) || Object.keys(link).some((key) => !NEXT_KEYS.has(key)) || typeof link.to !== "string" || !ID_PATTERN.test(link.to)) issues.push(where + ": ongeldige overgang.");
      });
    }
    if (step.rules !== undefined && step.rules !== null) ruleShapeIssues(step.rules, where, issues);
    if (step.timer !== undefined && step.timer !== null) timerShapeIssues(step.timer, where, issues);
    if (step.objectives === undefined || step.objectives === null) return;
    if (!Array.isArray(step.objectives) || step.objectives.length > QUEST_LIMITS.objectives) { issues.push(where + ": hooguit " + QUEST_LIMITS.objectives + " doelen."); return; }
    const objectiveIds = new Set();
    step.objectives.forEach((objective, number) => {
      const at = where + ", doel " + (number + 1);
      if (!isObject(objective)) { issues.push(at + " is ongeldig."); return; }
      const extra = Object.keys(objective).filter((key) => !OBJECTIVE_KEYS.has(key));
      if (extra.length) issues.push(at + ": onbekend veld " + extra.join(", ") + ".");
      if (typeof objective.objectiveId !== "string" || objective.objectiveId.length > 60 || !ID_PATTERN.test(objective.objectiveId)) issues.push(at + ": ongeldige doel-ID.");
      else if (objectiveIds.has(objective.objectiveId)) issues.push(at + ": doel-ID komt twee keer voor.");
      else objectiveIds.add(objective.objectiveId);
      const spec = OBJECTIVE_KINDS[objective.type];
      if (!spec) { issues.push(at + ": onbekende soort doel."); return; }
      if (objective.ref !== undefined && objective.ref !== null) {
        if (typeof objective.ref !== "string" || !objective.ref.startsWith(spec.refKind + ":")) issues.push(at + ": moet naar een " + spec.refKind + " wijzen.");
        else refs.push(objective.ref);
      }
      if (objective.npcRef !== undefined && objective.npcRef !== null) {
        if (typeof objective.npcRef !== "string" || !objective.npcRef.startsWith("npc:")) issues.push(at + ": bij wie moet een NPC zijn.");
        else refs.push(objective.npcRef);
      }
      if (objective.amount !== undefined && objective.amount !== null && (!Number.isInteger(objective.amount) || objective.amount < 1 || objective.amount > QUEST_LIMITS.amount)) {
        issues.push(at + ": aantal moet tussen 1 en " + QUEST_LIMITS.amount + " liggen.");
      }
      if (objective.role !== undefined && objective.role !== null && !OBJECTIVE_ROLES[objective.role]) issues.push(at + ": ongeldige rol.");
      if (objective.share !== undefined && objective.share !== null && !OBJECTIVE_SHARES[objective.share]) issues.push(at + ": ongeldige keuze bij Voor wie.");
      if (objective.credit !== undefined && objective.credit !== null && !OBJECTIVE_CREDITS[objective.credit]) issues.push(at + ": ongeldige keuze bij Telt voor.");
      if (objective.areaRef !== undefined && objective.areaRef !== null) { if (!isAreaRef(objective.areaRef)) issues.push(at + ": Alleen in gebied moet een Questgebied zijn."); else refs.push(objective.areaRef); }
      if (objective.mark !== undefined && objective.mark !== null && objective.mark !== "star") issues.push(at + ": ongeldige keuze bij Ster op kaart.");
      if (objective.spawnId !== undefined && objective.spawnId !== null && !isId(objective.spawnId)) issues.push(at + ": ongeldige verschijning.");
    });
  });
  return { issues, refs: Array.from(new Set(refs)) };
}

const isId = (value) => typeof value === "string" && value.length <= 60 && ID_PATTERN.test(value);

// Stap 5: vorm van de regels (Als → Dan) van één stap.
function ruleShapeIssues(rules, where, issues) {
  if (!Array.isArray(rules) || rules.length > QUEST_SPAWN_LIMITS.rules) { issues.push(where + ": hooguit " + QUEST_SPAWN_LIMITS.rules + " regels (Als → Dan)."); return; }
  const ids = new Set();
  rules.forEach((rule, number) => {
    const at = where + ", regel " + (number + 1);
    if (!isObject(rule)) { issues.push(at + " is ongeldig."); return; }
    const extra = Object.keys(rule).filter((key) => !RULE_KEYS_STEP.has(key));
    if (extra.length) issues.push(at + ": onbekend veld " + extra.join(", ") + ".");
    if (!isId(rule.ruleId)) issues.push(at + ": ongeldige regel-ID.");
    else if (ids.has(rule.ruleId)) issues.push(at + ": regel-ID komt twee keer voor.");
    else ids.add(rule.ruleId);
    if (!RULE_WHEN[rule.when]) issues.push(at + ": ongeldige keuze bij Als.");
    if (!RULE_THEN[rule.then]) issues.push(at + ": ongeldige keuze bij Dan.");
    if (rule.objectiveId !== undefined && rule.objectiveId !== null && !isId(rule.objectiveId)) issues.push(at + ": ongeldig doel.");
    if (rule.spawnId !== undefined && rule.spawnId !== null && !isId(rule.spawnId)) issues.push(at + ": ongeldige verschijning.");
    if (rule.amount !== undefined && rule.amount !== null && (!Number.isInteger(rule.amount) || rule.amount < 1 || rule.amount > QUEST_LIMITS.amount)) issues.push(at + ": aantal moet tussen 1 en " + QUEST_LIMITS.amount + " liggen.");
    if (rule.text !== undefined && rule.text !== null && !isText(rule.text, QUEST_SPAWN_LIMITS.text)) issues.push(at + ": het bericht is te lang.");
  });
}

// Stap 6: vorm van de klok van één stap. Half ingevuld mag (de quest-check zegt wat er mist).
function timerShapeIssues(timer, where, issues) {
  const at = where + ", ⏱️ klok";
  if (!isObject(timer)) { issues.push(at + " is ongeldig."); return; }
  const extra = Object.keys(timer).filter((key) => !TIMER_KEYS.has(key));
  if (extra.length) issues.push(at + ": onbekend veld " + extra.join(", ") + ".");
  if (timer.seconds !== undefined && timer.seconds !== null && (!Number.isInteger(timer.seconds) || timer.seconds < QUEST_TIMER_LIMITS.min || timer.seconds > QUEST_TIMER_LIMITS.max)) {
    issues.push(at + ": tijd moet tussen " + QUEST_TIMER_LIMITS.min + " seconden en 24 uur liggen.");
  }
  if (timer.start !== undefined && timer.start !== null && !TIMER_START[timer.start]) issues.push(at + ": ongeldige keuze bij Wanneer begint de klok.");
  if (timer.share !== undefined && timer.share !== null && !TIMER_SHARE[timer.share]) issues.push(at + ": ongeldige keuze bij Voor wie.");
  if (timer.late !== undefined && timer.late !== null && !TIMER_LATE[timer.late]) issues.push(at + ": ongeldige keuze bij Te laat.");
  if (timer.logout !== undefined && timer.logout !== null && !TIMER_LOGOUT[timer.logout]) issues.push(at + ": ongeldige keuze bij Uitloggen.");
  if (timer.lateTo !== undefined && timer.lateTo !== null && !isId(timer.lateTo)) issues.push(at + ": ongeldige stap bij Te laat.");
}

// Stap 5: vorm-controle van het veld spawns (bij opslaan). Half ingevuld mag; de quest-check zegt wat er nog mist.
export function questSpawnsShapeIssues(value) {
  const issues = [];
  const refs = [];
  if (!Array.isArray(value)) return { issues: ["Verschijnen moet een lijst zijn."], refs };
  if (value.length > QUEST_SPAWN_LIMITS.spawns) issues.push("Hooguit " + QUEST_SPAWN_LIMITS.spawns + " verschijningen.");
  const ids = new Set();
  value.forEach((spawn, index) => {
    const at = "Verschijning " + (index + 1);
    if (!isObject(spawn)) { issues.push(at + " is ongeldig."); return; }
    const extra = Object.keys(spawn).filter((key) => !SPAWN_KEYS.has(key));
    if (extra.length) issues.push(at + ": onbekend veld " + extra.join(", ") + ".");
    if (!isId(spawn.spawnId)) issues.push(at + ": ongeldige ID.");
    else if (ids.has(spawn.spawnId)) issues.push(at + ": ID " + spawn.spawnId + " komt twee keer voor.");
    else ids.add(spawn.spawnId);
    if (spawn.name !== undefined && spawn.name !== null && !isText(spawn.name, QUEST_SPAWN_LIMITS.name)) issues.push(at + ": de naam is te lang.");
    if (spawn.actorRef !== undefined && spawn.actorRef !== null) {
      if (typeof spawn.actorRef !== "string" || spawn.actorRef.length > 160 || !spawn.actorRef.startsWith("actor_archetype:")) issues.push(at + ": moet een vijand zijn.");
      else refs.push(spawn.actorRef);
    }
    if (spawn.count !== undefined && spawn.count !== null && (!Number.isInteger(spawn.count) || spawn.count < 1 || spawn.count > QUEST_SPAWN_LIMITS.count)) issues.push(at + ": aantal moet tussen 1 en " + QUEST_SPAWN_LIMITS.count + " liggen.");
    if (spawn.areaRef !== undefined && spawn.areaRef !== null) { if (!isAreaRef(spawn.areaRef)) issues.push(at + ": Waar moet een Questgebied zijn."); else refs.push(spawn.areaRef); }
    if (spawn.audience !== undefined && spawn.audience !== null && !QUEST_SPAWN_AUDIENCE[spawn.audience]) issues.push(at + ": ongeldige keuze bij Voor wie.");
    if (spawn.despawn !== undefined && spawn.despawn !== null && !QUEST_SPAWN_DESPAWN[spawn.despawn]) issues.push(at + ": ongeldige keuze bij Verdwijnen.");
  });
  return { issues, refs: Array.from(new Set(refs)) };
}

export function spawnName(spawn, nameOf = (ref) => ref) {
  if (!spawn) return "…";
  return spawn.name || (spawn.actorRef ? (Number(spawn.count) > 1 ? spawn.count + "× " : "") + nameOf(spawn.actorRef) : "Verschijning");
}

// De quest-check: alles wat de quest onspeelbaar maakt. refExists(ref) -> bestaat die kaart (niet gearchiveerd)?
// Elke melding: { stepId, objectiveId, message }. Dezelfde meldingen in de Quest Builder en bij SAVE TO GAME.
export function questGraphIssues(steps, { refExists = () => true, refLabel = (ref) => ref, partyLeave = null, spawns = null } = {}) {
  const issues = [];
  const add = (stepId, objectiveId, message, spawnId = null) => issues.push(Object.assign({ stepId: stepId || null, objectiveId: objectiveId || null, message }, spawnId ? { spawnId } : {}));
  const list = Array.isArray(steps) ? steps.filter(isObject) : [];
  if (!list.length) { add(null, null, "Deze quest heeft nog geen stappen."); return issues; }
  const byId = new Map(list.map((step) => [step.stepId, step]));
  // Stap 5: verschijningen van de quest en welke ervan een regel laat verschijnen.
  const spawnList = Array.isArray(spawns) ? spawns.filter(isObject) : [];
  const spawnById = new Map(spawnList.map((spawn) => [spawn.spawnId, spawn]));
  const spawned = new Set();
  for (const step of list) for (const rule of Array.isArray(step.rules) ? step.rules : []) if (isObject(rule) && rule.then === "spawn" && rule.spawnId) spawned.add(rule.spawnId);
  const spawnLabel = (spawn) => "👾 " + spawnName(spawn, refLabel);
  if (list[0].kind !== "step") add(list[0].stepId, null, "De eerste stap is het begin van de quest; dat moet een gewone stap zijn, geen einde.");
  if (!list.some((step) => step.kind === "end")) add(null, null, "Deze quest heeft geen einde. Voeg een einde toe.");
  for (const step of list) {
    if (step.kind !== "step") continue;
    const objectives = Array.isArray(step.objectives) ? step.objectives.filter(isObject) : [];
    if (!objectives.length) add(step.stepId, null, "Deze stap heeft nog geen doel.");
    else if (!objectives.some(objectiveNeeded)) add(step.stepId, null, "Minstens één doel moet verplicht (of verborgen) zijn, anders is de stap meteen klaar.");
    const next = Array.isArray(step.next) ? step.next.filter(isObject) : [];
    if (!next.length) add(step.stepId, null, "Kies waar de quest na deze stap heen gaat (Daarna).");
    if (step.mapRef && !refExists(step.mapRef)) add(step.stepId, null, "Kaart: " + refLabel(step.mapRef) + " bestaat niet (meer) of is geen Questgebied.");
    for (const link of next) {
      if (link.to === step.stepId) add(step.stepId, null, "Deze stap gaat naar zichzelf.");
      else if (!byId.has(link.to)) add(step.stepId, null, "Daarna gaat naar een stap die niet (meer) bestaat.");
    }
    for (const objective of objectives) {
      const spec = OBJECTIVE_KINDS[objective.type];
      if (!spec) continue;
      if (objective.share === "team" && !spec.event) add(step.stepId, objective.objectiveId, spec.label + ": Team samen kan alleen bij Versla, Verzamel en Pak op.");
      if (objective.credit && objective.type !== "defeat") add(step.stepId, objective.objectiveId, spec.label + ": Telt voor kan alleen bij Versla.");
      if (objective.mark && !spec.mark) add(step.stepId, objective.objectiveId, spec.label + ": ⭐ Ster op kaart kan alleen bij Versla en Verzamel.");
      if (objective.areaRef && !spec.event) add(step.stepId, objective.objectiveId, spec.label + ": Alleen in gebied kan alleen bij Versla, Verzamel en Pak op.");
      else if (objective.areaRef && !refExists(objective.areaRef)) add(step.stepId, objective.objectiveId, refLabel(objective.areaRef) + " bestaat niet (meer) of is geen Questgebied.");
      if (!objective.ref) add(step.stepId, objective.objectiveId, spec.label + (spec.refKind === "area" ? ": kies een Questgebied." : ": kies wat (sleep een kaart op het vak)."));
      else if (!refExists(objective.ref)) add(step.stepId, objective.objectiveId, refLabel(objective.ref) + (spec.refKind === "area" ? " bestaat niet (meer) of is geen Questgebied." : " bestaat niet (meer) of is gearchiveerd."));
      if (spec.npc) {
        if (!objective.npcRef) add(step.stepId, objective.objectiveId, spec.label + ": kies bij wie het gebracht moet worden.");
        else if (!refExists(objective.npcRef)) add(step.stepId, objective.objectiveId, refLabel(objective.npcRef) + " bestaat niet (meer) of is gearchiveerd.");
      }
      // Stap 5: Versla een verschijning van deze quest.
      if (objective.spawnId) {
        const spawn = spawnById.get(objective.spawnId);
        if (objective.type !== "defeat") add(step.stepId, objective.objectiveId, spec.label + ": een verschijning kan alleen bij Versla.");
        else if (!spawn) add(step.stepId, objective.objectiveId, "Versla: de verschijning bestaat niet (meer). Kies er een in 👾 Verschijnen.");
        else if (!spawned.has(spawn.spawnId)) add(step.stepId, objective.objectiveId, spawnLabel(spawn) + " verschijnt nooit. Zet bij een stap (⚡ Wat gebeurt er onderweg) een regel: Dan 👾 laat vijanden verschijnen.");
        else if (spawn.actorRef && objective.ref && objective.ref !== spawn.actorRef) add(step.stepId, objective.objectiveId, "Versla: de vijand past niet bij " + spawnLabel(spawn) + ".");
      }
    }
    const ruleList = Array.isArray(step.rules) ? step.rules.filter(isObject) : [];
    for (const rule of ruleList) {
      const where = "⚡ Als → Dan: ";
      if (rule.when === "count") {
        const target = objectives.find((objective) => objective.objectiveId === rule.objectiveId);
        if (!rule.objectiveId) add(step.stepId, null, where + "kies bij welk doel.");
        else if (!target) add(step.stepId, null, where + "het doel bestaat niet (meer) in deze stap.");
      }
      if (rule.then === "spawn") {
        const spawn = spawnById.get(rule.spawnId);
        if (!rule.spawnId) add(step.stepId, null, where + "kies wat er verschijnt.");
        else if (!spawn) add(step.stepId, null, where + "die verschijning bestaat niet (meer). Kijk in 👾 Verschijnen.");
        else if (rule.when === "done" && spawn.despawn === "step") add(step.stepId, null, where + spawnLabel(spawn) + " verschijnt als de stap klaar is, maar is dan meteen weer weg (Weg als de stap klaar is).");
      }
      if (rule.then === "message" && !String(rule.text || "").trim()) add(step.stepId, null, where + "vul het bericht in.");
      if ((rule.then === "timer_start" || rule.then === "timer_stop") && !isObject(step.timer)) add(step.stepId, null, where + "deze stap heeft geen klok. Zet bij ⏱️ Moet het op tijd? een tijd.");
      else if (rule.then === "timer_start" && rule.when === "done") add(step.stepId, null, where + "de klok starten als de stap klaar is doet niets. Kies een ander moment.");
    }
    // Stap 6: de klok van deze stap.
    if (isObject(step.timer)) {
      const where = "⏱️ Klok: ";
      const timer = step.timer;
      if (!Number.isInteger(timer.seconds)) add(step.stepId, null, where + "vul in binnen hoeveel tijd.");
      if (timer.start === "rule" && !ruleList.some((rule) => rule.then === "timer_start")) add(step.stepId, null, where + "de klok start nooit. Zet bij ⚡ een regel Dan ⏱️ start de klok, of kies Zodra de stap begint.");
      if (timer.late === "step") {
        if (!timer.lateTo) add(step.stepId, null, where + "kies naar welke stap je gaat als je te laat bent.");
        else if (timer.lateTo === step.stepId) add(step.stepId, null, where + "te laat gaat naar deze stap zelf. Kies dan ↩️ De stap begint opnieuw.");
        else if (!byId.has(timer.lateTo)) add(step.stepId, null, where + "te laat gaat naar een stap die niet (meer) bestaat.");
      }
    }
  }
  for (const spawn of spawnList) {
    if (!spawn.actorRef) add(null, null, spawnLabel(spawn) + ": kies welke vijand (sleep een vijand uit de Bibliotheek op het vak).", spawn.spawnId);
    else if (!refExists(spawn.actorRef)) add(null, null, spawnLabel(spawn) + ": " + refLabel(spawn.actorRef) + " bestaat niet (meer) of is gearchiveerd.", spawn.spawnId);
    if (spawn.areaRef && !refExists(spawn.areaRef)) add(null, null, spawnLabel(spawn) + ": " + refLabel(spawn.areaRef) + " bestaat niet (meer) of is geen Questgebied.", spawn.spawnId);
  }
  // Een regel voor groep verlaten zonder Team samen-doel doet niets: zeg het, dan schrikt niemand.
  const hasTeam = list.some((step) => Array.isArray(step.objectives) && step.objectives.some((objective) => isObject(objective) && objective.share === "team"));
  if (partyLeave && partyLeave !== "keep" && !hasTeam) add(null, null, "Bij groep verlaten doet niets: deze quest heeft geen doel met Team samen.");
  // Bereikbaar vanaf het begin, en vanaf elke bereikbare stap moet een einde te halen zijn.
  const nextOf = (step) => (step.kind === "step" ? (Array.isArray(step.next) ? step.next.map((link) => link?.to) : [])
    .concat(isObject(step.timer) && step.timer.late === "step" ? [step.timer.lateTo] : []).filter((id) => byId.has(id)) : []);
  const reached = new Set([list[0].stepId]);
  const queue = [list[0].stepId];
  while (queue.length) {
    for (const to of nextOf(byId.get(queue.shift()))) if (!reached.has(to)) { reached.add(to); queue.push(to); }
  }
  const canEnd = new Set(list.filter((step) => step.kind === "end").map((step) => step.stepId));
  let grew = true;
  while (grew) {
    grew = false;
    for (const step of list) if (!canEnd.has(step.stepId) && nextOf(step).some((to) => canEnd.has(to))) { canEnd.add(step.stepId); grew = true; }
  }
  for (const step of list) {
    if (!reached.has(step.stepId)) add(step.stepId, null, "Deze stap wordt nooit bereikt: geen andere stap gaat erheen.");
    else if (step.kind === "step" && !canEnd.has(step.stepId) && nextOf(step).length) add(step.stepId, null, "Vanaf hier kom je nooit bij een einde (de stappen gaan in een kring).");
  }
  return issues;
}

// ---------- Stap 4: start en voorwaarden (veld start op de quest) ----------
// { mode, itemRef, areaRef, match, rules: [{ type: level, min } | { type: item, ref, amount } | { type: quest, ref } | { type: class, ref }] }
const START_KEYS = new Set(["mode", "itemRef", "areaRef", "match", "rules"]);
const RULE_KEYS = new Set(["type", "min", "ref", "amount"]);

export function questStartMode(body) {
  const mode = isObject(body?.start) ? body.start.mode : null;
  return QUEST_START_MODES[mode] ? mode : "npc";
}

// Vorm-controle bij opslaan (schema). Half ingevuld mag; de quest-check zegt wat er nog mist.
export function questStartShapeIssues(value) {
  const issues = [];
  const refs = [];
  if (!isObject(value)) return { issues: ["Start moet een object zijn."], refs };
  const unknown = Object.keys(value).filter((key) => !START_KEYS.has(key));
  if (unknown.length) issues.push("Start: onbekend veld " + unknown.join(", ") + ".");
  const given = (field) => field !== undefined && field !== null;
  const refOf = (ref, kind) => typeof ref === "string" && ref.length <= 160 && ref.startsWith(kind + ":");
  if (given(value.mode) && !QUEST_START_MODES[value.mode]) issues.push("Start: ongeldige keuze bij Hoe start hij.");
  if (given(value.itemRef)) { if (!refOf(value.itemRef, "item_definition")) issues.push("Start: het start-item moet een item zijn."); else refs.push(value.itemRef); }
  if (given(value.areaRef)) { if (!isAreaRef(value.areaRef)) issues.push("Start: het startgebied moet een Questgebied zijn."); else refs.push(value.areaRef); }
  if (given(value.match) && !REQUIREMENT_MATCH[value.match]) issues.push("Voorwaarden: ongeldige keuze bij EN/OF.");
  if (given(value.rules)) {
    if (!Array.isArray(value.rules) || value.rules.length > QUEST_START_LIMITS.rules) issues.push("Hooguit " + QUEST_START_LIMITS.rules + " voorwaarden.");
    else value.rules.forEach((rule, index) => {
      const at = "Voorwaarde " + (index + 1);
      if (!isObject(rule)) { issues.push(at + " is ongeldig."); return; }
      const extra = Object.keys(rule).filter((key) => !RULE_KEYS.has(key));
      if (extra.length) issues.push(at + ": onbekend veld " + extra.join(", ") + ".");
      const spec = REQUIREMENT_KINDS[rule.type];
      if (!spec) { issues.push(at + ": onbekende soort."); return; }
      if (given(rule.min) && (!Number.isInteger(rule.min) || rule.min < 1 || rule.min > QUEST_START_LIMITS.level)) issues.push(at + ": level moet tussen 1 en " + QUEST_START_LIMITS.level + " liggen.");
      if (given(rule.ref)) { if (!spec.refKind || !refOf(rule.ref, spec.refKind)) issues.push(at + ": moet naar een " + (spec.refKind || "?") + " wijzen."); else refs.push(rule.ref); }
      if (given(rule.amount) && (!Number.isInteger(rule.amount) || rule.amount < 1 || rule.amount > QUEST_LIMITS.amount)) issues.push(at + ": aantal moet tussen 1 en " + QUEST_LIMITS.amount + " liggen.");
    });
  }
  return { issues, refs: Array.from(new Set(refs)) };
}

// De quest-check voor de start: is de quest te beginnen en wijst elke voorwaarde naar een bestaande kaart?
// Zelfde meldingen in de Quest Builder en bij SAVE TO GAME. selfRef = de eigen quest (docKey).
export function questStartIssues(body, { refExists = () => true, refLabel = (ref) => ref, selfRef = null, maxLevel = null } = {}) {
  const issues = [];
  const add = (message) => issues.push({ stepId: null, objectiveId: null, message });
  const start = isObject(body?.start) ? body.start : {};
  const mode = questStartMode(body);
  const gone = (ref, area = false) => refLabel(ref) + (area ? " bestaat niet (meer) of is geen Questgebied." : " bestaat niet (meer) of is gearchiveerd.");
  if (mode === "npc") {
    if (!body?.giverRef) add("Start: kies wie de quest geeft (🧑 Wie geeft hem).");
    else if (!refExists(body.giverRef)) add("Start: " + gone(body.giverRef));
  } else if (mode === "item") {
    if (!start.itemRef) add("Start: kies welk item de quest start (bijv. een brief).");
    else if (!refExists(start.itemRef)) add("Start: " + gone(start.itemRef));
  } else if (mode === "area") {
    if (!start.areaRef) add("Start: kies het Questgebied waar de quest start.");
    else if (!refExists(start.areaRef)) add("Start: " + gone(start.areaRef, true));
  }
  for (const rule of Array.isArray(start.rules) ? start.rules.filter(isObject) : []) {
    const spec = REQUIREMENT_KINDS[rule.type];
    if (!spec) continue;
    if (rule.type === "level") {
      if (!Number.isInteger(rule.min)) add("Voorwaarde level: vul in vanaf welk level.");
      else if (Number.isInteger(maxLevel) && rule.min > maxLevel) add("Voorwaarde level " + rule.min + ": het hoogste level is " + maxLevel + ", dus niemand kan deze quest beginnen.");
      continue;
    }
    if (!rule.ref) add("Voorwaarde " + spec.label + ": kies wat (sleep een kaart op het vak).");
    else if (selfRef && rule.ref === selfRef) add("Voorwaarde: een quest kan niet zichzelf nodig hebben.");
    else if (!refExists(rule.ref)) add("Voorwaarde: " + gone(rule.ref));
  }
  return issues;
}

// Korte tekst voor een voorwaarde, bijv. "Level minstens 10" of "Heeft item 2× Sleutel".
export function requirementText(rule, nameOf = (ref) => ref) {
  const spec = REQUIREMENT_KINDS[rule?.type];
  if (!spec) return "?";
  if (rule.type === "level") return spec.label + " " + (rule.min || "…");
  const amount = spec.amount && Number(rule.amount) > 1 ? rule.amount + "× " : "";
  return spec.label + " " + amount + (rule.ref ? nameOf(rule.ref) : "…");
}

// Korte tekst voor een doel, bijv. "Versla 3× Wolf" of "Breng 2× Hout naar Smid".
export function objectiveText(objective, nameOf = (ref) => ref) {
  const spec = OBJECTIVE_KINDS[objective?.type];
  if (!spec) return "?";
  const what = objective.ref ? nameOf(objective.ref) : "…";
  const amount = spec.amount && Number(objective.amount) > 1 ? objective.amount + "× " : "";
  const to = spec.npc ? " naar " + (objective.npcRef ? nameOf(objective.npcRef) : "…") : "";
  return spec.label + " " + amount + what + to;
}
