// Quest Builder stap 1 (4-11): een quest is een netwerk van stappen, geen rij.
// Een stap heeft doelen (alle of één van de verplichte), overgangen naar een volgende stap, en een quest
// eindigt in een of meer eindes. Gedeeld door de editor (browser) en de server (schema, build, quest-motor),
// zodat de quest-check in de Quest Builder en bij SAVE TO GAME precies hetzelfde zegt.

const ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

export const QUEST_LIMITS = Object.freeze({ steps: 64, objectives: 12, next: 4, title: 80, text: 300, amount: 9999 });

// Soorten doelen. event = de server telt gebeurtenissen (niet wat je nu hebt).
export const OBJECTIVE_KINDS = Object.freeze({
  defeat: Object.freeze({ icon: "⚔️", label: "Versla", refKind: "actor_archetype", amount: true, event: true }),
  gather: Object.freeze({ icon: "🪵", label: "Verzamel", refKind: "resource_definition", amount: true, event: true }),
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
export const STEP_MATCH = Object.freeze({ all: "Alle verplichte doelen", any: "Eén verplicht doel" });
export const STEP_KINDS = Object.freeze({ step: "Stap", end: "Einde" });

const STEP_KEYS = new Set(["stepId", "kind", "title", "text", "match", "objectives", "next", "mapRef", "mapShow"]);
const OBJECTIVE_KEYS = new Set(["objectiveId", "type", "ref", "npcRef", "amount", "role", "share", "credit", "areaRef"]);
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
    });
  });
  return { issues, refs: Array.from(new Set(refs)) };
}

// De quest-check: alles wat de quest onspeelbaar maakt. refExists(ref) -> bestaat die kaart (niet gearchiveerd)?
// Elke melding: { stepId, objectiveId, message }. Dezelfde meldingen in de Quest Builder en bij SAVE TO GAME.
export function questGraphIssues(steps, { refExists = () => true, refLabel = (ref) => ref, partyLeave = null } = {}) {
  const issues = [];
  const add = (stepId, objectiveId, message) => issues.push({ stepId: stepId || null, objectiveId: objectiveId || null, message });
  const list = Array.isArray(steps) ? steps.filter(isObject) : [];
  if (!list.length) { add(null, null, "Deze quest heeft nog geen stappen."); return issues; }
  const byId = new Map(list.map((step) => [step.stepId, step]));
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
      if (objective.areaRef && !spec.event) add(step.stepId, objective.objectiveId, spec.label + ": Alleen in gebied kan alleen bij Versla, Verzamel en Pak op.");
      else if (objective.areaRef && !refExists(objective.areaRef)) add(step.stepId, objective.objectiveId, refLabel(objective.areaRef) + " bestaat niet (meer) of is geen Questgebied.");
      if (!objective.ref) add(step.stepId, objective.objectiveId, spec.label + (spec.refKind === "area" ? ": kies een Questgebied." : ": kies wat (sleep een kaart op het vak)."));
      else if (!refExists(objective.ref)) add(step.stepId, objective.objectiveId, refLabel(objective.ref) + (spec.refKind === "area" ? " bestaat niet (meer) of is geen Questgebied." : " bestaat niet (meer) of is gearchiveerd."));
      if (spec.npc) {
        if (!objective.npcRef) add(step.stepId, objective.objectiveId, spec.label + ": kies bij wie het gebracht moet worden.");
        else if (!refExists(objective.npcRef)) add(step.stepId, objective.objectiveId, refLabel(objective.npcRef) + " bestaat niet (meer) of is gearchiveerd.");
      }
    }
  }
  // Een regel voor groep verlaten zonder Team samen-doel doet niets: zeg het, dan schrikt niemand.
  const hasTeam = list.some((step) => Array.isArray(step.objectives) && step.objectives.some((objective) => isObject(objective) && objective.share === "team"));
  if (partyLeave && partyLeave !== "keep" && !hasTeam) add(null, null, "Bij groep verlaten doet niets: deze quest heeft geen doel met Team samen.");
  // Bereikbaar vanaf het begin, en vanaf elke bereikbare stap moet een einde te halen zijn.
  const nextOf = (step) => (step.kind === "step" && Array.isArray(step.next) ? step.next.map((link) => link?.to).filter((id) => byId.has(id)) : []);
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

// Korte tekst voor een doel, bijv. "Versla 3× Wolf" of "Breng 2× Hout naar Smid".
export function objectiveText(objective, nameOf = (ref) => ref) {
  const spec = OBJECTIVE_KINDS[objective?.type];
  if (!spec) return "?";
  const what = objective.ref ? nameOf(objective.ref) : "…";
  const amount = spec.amount && Number(objective.amount) > 1 ? objective.amount + "× " : "";
  const to = spec.npc ? " naar " + (objective.npcRef ? nameOf(objective.npcRef) : "…") : "";
  return spec.label + " " + amount + what + to;
}
