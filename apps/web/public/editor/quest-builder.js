// Quest Builder stap 1 (4-11): een quest als netwerk van stappen, over de editor heen, met tabs.
// 5-11: de tabs volgen hoe je een quest bedenkt. 🚪 Start = hoe begint hij en wie mag hem doen; 🪜 Stappen = wat moet
// de speler doen (doelen, eindes en ⚡ Als → Dan); 👾 Verschijnen = vijanden die de quest laat verschijnen (stap 5);
// 🧪 Testen = quest-check en de stand van spelers. Naam, beloning en verhaal staan in het paneel.
// Alles schrijft naar het quest-document (veld steps) via de opslag van de Werkbank (met Ctrl+Z).
// De quest-check is dezelfde als bij SAVE TO GAME (shared/quest-graph.js).
import { api, el } from "./canonical-api.js";
import { OBJECTIVE_CREDITS, OBJECTIVE_KINDS, OBJECTIVE_ORDER, OBJECTIVE_ROLES, OBJECTIVE_SHARES, QUEST_LIMITS, QUEST_NEARBY_M, QUEST_SPAWN_AUDIENCE, QUEST_SPAWN_DESPAWN, QUEST_SPAWN_LIMITS, QUEST_START_LIMITS, QUEST_START_MODES, REQUIREMENT_KINDS, REQUIREMENT_MATCH, RULE_THEN, RULE_WHEN, STEP_MAP_SHOW, STEP_MATCH, hasOwnSteps, objectiveNeeded, objectiveText, questGraphIssues, questStartIssues, questStartMode, spawnName, stepsFromSimple } from "../shared/quest-graph.js?v=20261105-quest15";

const TABS = [["start", "🚪 Start"], ["stappen", "🪜 Stappen"], ["verschijnen", "👾 Verschijnen"], ["testen", "🧪 Testen"]];
const SIMPLE_FIELDS = ["goal", "itemRef", "amount", "targetNpcRef"];
let current = null;

const clone = (value) => JSON.parse(JSON.stringify(value));

export function openQuestBuilder(bench, docKey, { setStatus = () => {}, tab = "stappen" } = {}) {
  if (!TABS.some(([id]) => id === tab)) tab = "stappen";
  if (current && current.docKey === docKey) { current.tab = tab; current.render(); return; }
  if (current) current.close();
  const root = el("div", { class: "qbOverlay", role: "dialog", "aria-label": "Quest Builder" });
  const state = { root, bench, docKey, tab, setStatus, mine: null, busy: false };
  const onKey = (event) => {
    if (event.key === "Escape" && !event.target.closest?.("input, select, textarea")) state.close();
    // Ctrl+Z / Ctrl+Y doet de editor; daarna tekenen we opnieuw met de teruggezette quest.
    if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(String(event.key).toLowerCase())) setTimeout(() => state.render(), 700);
  };
  state.close = () => { root.remove(); document.removeEventListener("keydown", onKey); current = null; };
  state.render = () => render(state);
  document.addEventListener("keydown", onKey);
  document.body.append(root);
  current = state;
  render(state);
}

function names(bench) {
  const nameOf = (ref) => {
    const doc = ref ? bench.doc(ref) : null;
    return doc ? bench.docName(doc) : String(ref || "…").replace(/^[a-z_]+:/, "");
  };
  // Een gebied in een quest moet een Questgebied zijn (zelfde regel als bij SAVE TO GAME).
  const refExists = (ref) => { const doc = bench.doc(ref); return Boolean(doc) && !doc.archived && (doc.kind !== "area" || doc.body?.soort === "questgebied"); };
  return { nameOf, refExists };
}

// Stap 3: keuzelijst met de Questgebieden (gemaakt met de Area tool, soort 🎯 Questgebied).
function areaSelect(bench, value, empty, title, onPick, prefix = "🎯 ") {
  const areas = bench.docs("area").filter((doc) => doc.body?.soort === "questgebied");
  const select = el("select", { class: "wbdSelect qbArea", title }, [el("option", { value: "", text: empty })]
    .concat(areas.map((doc) => el("option", { value: doc.docKey, text: prefix + bench.docName(doc) }))));
  if (value && !areas.some((doc) => doc.docKey === value)) select.append(el("option", { value, text: "⚠️ " + value.replace(/^area:/, "") }));
  select.value = value || "";
  select.addEventListener("change", () => onPick(select.value || null));
  return select;
}

function stepLabel(step, index, nameOf) {
  if (step.kind === "end") return "🏁 " + (step.title || "Einde");
  const goals = (step.objectives || []).filter((objective) => objective.role !== "hidden").map((objective) => objectiveText(objective, nameOf));
  return (index + 1) + " · " + (step.title || goals.join(", ") || "Nieuwe stap");
}

function uniqueId(prefix, used) {
  let n = used.size + 1;
  while (used.has(prefix + n)) n += 1;
  return prefix + n;
}

function render(state) {
  const { bench, root } = state;
  const doc = bench.doc(state.docKey);
  if (!doc || doc.archived) { state.close(); return; }
  const body = clone(doc.body || {});
  const { nameOf, refExists } = names(bench);
  const steps = hasOwnSteps(body) ? body.steps : null;
  // Stap 5: de verschijningen van deze quest (voor Als → Dan en Versla bij de stappen).
  state.spawns = Array.isArray(body.spawns) ? body.spawns : [];
  // Stap 4: de quest-check kijkt ook of de quest te beginnen is (start en voorwaarden).
  const maxLevel = bench.docs("project_settings")[0]?.body?.maxLevel || 50;
  const startIssues = questStartIssues(body, { refExists, refLabel: nameOf, selfRef: doc.docKey, maxLevel });
  const issues = startIssues.concat(steps ? questGraphIssues(steps, { refExists, refLabel: nameOf, partyLeave: body.partyLeave, spawns: body.spawns }) : []);
  const badge = issues.length ? el("span", { class: "qbBadge qbBadgeBad", text: "⚠️ " + issues.length + (issues.length === 1 ? " melding" : " meldingen") })
    : !steps ? el("span", { class: "qbBadge", text: "Snelle quest" })
      : el("span", { class: "qbBadge qbBadgeOk", text: "✅ Quest-check OK" });
  const close = el("button", { type: "button", class: "wbdGhost", text: "✕ Sluiten", title: "Sluiten (Esc)" });
  close.addEventListener("click", () => state.close());
  const tabs = el("nav", { class: "qbTabs" }, TABS.map(([id, label]) => {
    const button = el("button", { type: "button", class: "qbTab" + (state.tab === id ? " active" : ""), text: label });
    button.addEventListener("click", () => { state.tab = id; render(state); });
    return button;
  }));
  const content = el("div", { class: "qbBody" });
  const panel = el("div", { class: "qbPanel wbdPanel" }, [
    el("header", { class: "qbHead" }, [el("span", { class: "qbHeadIcon", text: "📜" }),
      el("div", { class: "qbHeadText" }, [el("div", { class: "wbdHeadKind", text: "Quest Builder" }), el("div", { class: "wbdHeadName", text: bench.docName(doc) })]), badge, close]),
    tabs, content
  ]);
  // Na opslaan opnieuw tekenen zonder weg te springen van de stap waar je mee bezig bent.
  const old = root.querySelector(".qbPanel");
  const scroll = old && old.dataset.tab === state.tab ? old.scrollTop : 0;
  panel.dataset.tab = state.tab;
  root.replaceChildren(panel);
  placePanel(state, panel);
  if (state.tab === "start") renderStart(state, content, body, startIssues, nameOf);
  else if (state.tab === "verschijnen") renderSpawns(state, content, body, steps, issues, nameOf);
  else if (state.tab === "testen") renderTest(state, content, body, steps, issues, nameOf);
  else renderSteps(state, content, body, steps, issues, nameOf);
  panel.scrollTop = scroll;
}

// Het venster blokkeert de editor niet: de Bibliotheek blijft bruikbaar om kaarten op de vakken te slepen.
// Verschuiven: pak de bovenrand vast.
function placePanel(state, panel) {
  if (state.pos) Object.assign(panel.style, { left: state.pos.x + "px", top: state.pos.y + "px", transform: "none" });
  const head = panel.querySelector(".qbHead");
  head.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button, input, select")) return;
    const box = panel.getBoundingClientRect();
    const dx = event.clientX - box.left;
    const dy = event.clientY - box.top;
    const move = (moveEvent) => {
      state.pos = { x: Math.max(0, Math.min(window.innerWidth - 120, moveEvent.clientX - dx)), y: Math.max(0, Math.min(window.innerHeight - 60, moveEvent.clientY - dy)) };
      Object.assign(panel.style, { left: state.pos.x + "px", top: state.pos.y + "px", transform: "none" });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}

async function saveSteps(state, body, steps, label, dropSimple = false) {
  const doc = state.bench.doc(state.docKey);
  const next = Object.assign({}, body, { steps });
  if (dropSimple) for (const key of SIMPLE_FIELDS) delete next[key];
  try { await state.bench.saveDoc("quest", doc, next, "Quest · " + label); } catch {}
  render(state);
}

// De hele quest in één keer aanpassen (bijv. verschijning + de doelen die erheen wijzen), met één Ctrl+Z.
async function saveQuest(state, label, change) {
  const doc = state.bench.doc(state.docKey);
  const body = clone(doc.body || {});
  change(body);
  if (Array.isArray(body.spawns) && !body.spawns.length) delete body.spawns;
  try { await state.bench.saveDoc("quest", doc, body, "Quest · " + label); } catch {}
  render(state);
}

// Eén gewoon veld van de quest opslaan (bijv. wie geeft hem, pas na quest).
async function saveField(state, key, value, label) {
  const doc = state.bench.doc(state.docKey);
  const body = clone(doc.body || {});
  if (value === null || value === undefined || value === "") delete body[key]; else body[key] = value;
  try { await state.bench.saveDoc("quest", doc, body, "Quest · " + label); } catch {}
  render(state);
}

// ---------- 🚪 Start: hoe begint de quest en wie mag hem doen (stap 4) ----------

// Opslaan in het veld start. De standaard (bij een NPC, geen voorwaarden) = geen veld, zo blijft een quest gelijk aan vroeger.
async function saveStart(state, label, change) {
  const doc = state.bench.doc(state.docKey);
  const body = clone(doc.body || {});
  const next = clone(body.start || {});
  change(next);
  if (next.mode === "npc") delete next.mode;
  if (next.mode !== "item") delete next.itemRef;
  if (next.mode !== "area") delete next.areaRef;
  if (!Array.isArray(next.rules) || !next.rules.length) { delete next.rules; delete next.match; }
  if (next.match === "all") delete next.match;
  for (const key of Object.keys(next)) if (next[key] === null || next[key] === undefined) delete next[key];
  if (Object.keys(next).length) body.start = next; else delete body.start;
  try { await state.bench.saveDoc("quest", doc, body, "Quest · " + label); } catch {}
  render(state);
}

function renderStart(state, host, body, issues, nameOf) {
  const bench = state.bench;
  const start = body.start || {};
  const mode = questStartMode(body);

  // 1. Hoe begint hij: bij een NPC, een item lezen, een gebied in of vanzelf.
  const how = el("select", { class: "wbdSelect", title: "Hoe begint de speler deze quest?" },
    Object.entries(QUEST_START_MODES).map(([value, entry]) => el("option", { value, text: entry.icon + " " + entry.label })));
  how.value = mode;
  how.addEventListener("change", () => saveStart(state, "start", (next) => { next.mode = how.value; }));
  const row = [how];
  if (mode === "npc") {
    row.push(el("div", { class: "qbSlot" }, bench.refControl({ refKind: "npc", required: false, ui: { icon: "🧑" } }, body.giverRef || null,
      (ref) => saveField(state, "giverRef", ref, "wie geeft hem"))));
  }
  if (mode === "item") {
    row.push(el("div", { class: "qbSlot" }, bench.refControl({ refKind: "item_definition", required: false, ui: { icon: "📜" } }, start.itemRef || null,
      (ref) => saveStart(state, "start-item", (next) => { next.itemRef = ref || null; }))));
  }
  if (mode === "area") {
    row.push(areaSelect(bench, start.areaRef || null, "Kies een Questgebied...", "Hier start de quest",
      (ref) => saveStart(state, "startgebied", (next) => { next.areaRef = ref || null; })));
  }
  const hint = {
    npc: "Deze NPC biedt de quest aan. Sleep een NPC uit de Bibliotheek op het vak.",
    item: "De speler klikt het item in zijn tas aan en leest het in het gesprek. Tip: zet het item op Questitem en Uniek (max 1), en leg het als Pickup in de wereld (bijv. bij een kist) met Oppakken = Ieder 1×. Het item blijft in de tas tot de quest klaar is.",
    area: "De quest start als de speler dit gebied binnenloopt.",
    auto: "Start vanzelf zodra de speler mag (zie hieronder), bijv. meteen na ⛓️ Pas na quest. Deze quest kan de speler niet verlaten."
  }[mode];
  // Het verhaal bij de start: bij een NPC in het gesprek, anders in een eigen venster in de game (met plaatje en doelen).
  const story = el("div", { class: "wbdForm" });
  bench.renderForm(story, { kind: "quest", docKey: state.docKey, place: "questbuilder", only: ["description", "imageAssetId"], bare: true, onSaved: () => render(state),
    labels: { description: { npc: "Wat de NPC vertelt", item: "Wat er in de brief staat", area: "Wat er in de buurt gebeurt", auto: "Heads-up" }[mode] } });
  const popup = {
    npc: "De NPC vertelt dit in het gesprek, met de knoppen Aannemen en Nee.",
    item: "Klik op het item in de tas: het gesprek toont deze tekst (als brief), het plaatje en de doelen, met de knop Quest accepteren. Daarna opent Menu > Quests bij deze quest.",
    area: "Loopt de speler het gebied in, dan start de quest en toont het gesprek deze tekst, het plaatje en de doelen, met de knop Op pad! (naar Menu > Quests).",
    auto: "Start de quest vanzelf, dan toont het gesprek deze tekst, het plaatje, de doelen en welke quest net af is, met de knop Op pad! (naar Menu > Quests)."
  }[mode];
  host.append(el("section", { class: "qbTestBox qbStart" }, [el("h4", { text: "🚪 Hoe begint de quest?" }),
    el("div", { class: "qbObjective" }, row), el("p", { class: "wbdNote", text: hint }), story, el("p", { class: "wbdNote", text: "💬 " + popup })]));

  // 2. Wie mag hem beginnen: pas na een andere quest + voorwaarden (EN = alles moet kloppen, OF = één is genoeg).
  const box = el("section", { class: "qbTestBox qbStart" }, [el("h4", { text: "🔒 Wie mag hem beginnen?" })]);
  box.append(el("div", { class: "qbObjective" }, [el("span", { class: "qbLabel", text: "⛓️ Pas na quest" }),
    el("div", { class: "qbSlot" }, bench.refControl({ refKind: "quest", required: false, ui: { icon: "⛓️" } }, body.previousQuestRef || null,
      (ref) => saveField(state, "previousQuestRef", ref, "pas na quest")))]));
  const rules = Array.isArray(start.rules) ? start.rules : [];
  const change = (label, edit) => saveStart(state, label, (next) => { next.rules = clone(rules); edit(next.rules, next); });
  if (rules.length > 1) {
    const match = el("select", { class: "wbdSelect", title: "Moeten alle voorwaarden kloppen, of is één genoeg?" },
      Object.entries(REQUIREMENT_MATCH).map(([value, label]) => el("option", { value, text: label })));
    match.value = start.match === "any" ? "any" : "all";
    match.addEventListener("change", () => saveStart(state, "EN/OF", (next) => { next.match = match.value; }));
    box.append(el("div", { class: "qbAdd" }, [el("span", { class: "qbLabel", text: "Voorwaarden" }), match]));
  } else box.append(el("span", { class: "qbLabel", text: rules.length ? "Voorwaarde" : "Voorwaarden: geen (iedereen mag)" }));
  rules.forEach((rule, index) => box.append(requirementRow(state, rule, (label, edit) => change(label, (list) => edit(list[index])),
    () => change("voorwaarde weg", (list) => list.splice(index, 1)))));
  const add = el("select", { class: "wbdSelect", title: "Voorwaarde toevoegen" }, [el("option", { value: "", text: "➕ Voorwaarde..." })]
    .concat(Object.entries(REQUIREMENT_KINDS).map(([value, entry]) => el("option", { value, text: entry.icon + " " + entry.label }))));
  add.disabled = rules.length >= QUEST_START_LIMITS.rules;
  add.addEventListener("change", () => {
    const type = add.value;
    if (!type) return;
    change("voorwaarde erbij", (list) => list.push(type === "level" ? { type, min: 10 } : type === "item" ? { type, amount: 1 } : { type }));
  });
  box.append(el("div", { class: "qbAdd" }, [add, el("span", { class: "wbdNote", text: "Klopt het niet, dan zegt de game de speler waarom hij nog niet kan beginnen." })]));
  host.append(box);
  if (issues.length) host.append(issueList(issues));
}

function requirementRow(state, rule, change, remove) {
  const bench = state.bench;
  const spec = REQUIREMENT_KINDS[rule.type] || REQUIREMENT_KINDS.level;
  const parts = [el("span", { class: "qbLabel", text: spec.icon + " " + spec.label })];
  if (rule.type === "level") {
    const level = el("input", { type: "number", class: "wbdNumber qbAmount", min: 1, max: QUEST_START_LIMITS.level, step: 1, title: "Vanaf welk level" });
    level.value = rule.min ? String(rule.min) : "";
    level.addEventListener("change", () => change("level", (target) => { target.min = Math.max(1, Math.min(QUEST_START_LIMITS.level, Math.round(Number(level.value) || 1))); }));
    parts.push(level);
  } else if (rule.type === "class") {
    // Klassen staan onder Instellingen > Klassen (niet in de Bibliotheek), dus een keuzelijst.
    const classes = bench.docs("player_class");
    const pick = el("select", { class: "wbdSelect qbArea", title: "Welke klasse" }, [el("option", { value: "", text: "Kies een klasse..." })]
      .concat(classes.map((doc) => el("option", { value: doc.docKey, text: "🧙 " + bench.docName(doc) }))));
    if (rule.ref && !classes.some((doc) => doc.docKey === rule.ref)) pick.append(el("option", { value: rule.ref, text: "⚠️ " + rule.ref.replace(/^player_class:/, "") }));
    pick.value = rule.ref || "";
    pick.addEventListener("change", () => change("klasse", (target) => { if (pick.value) target.ref = pick.value; else delete target.ref; }));
    parts.push(pick);
  } else {
    parts.push(el("div", { class: "qbSlot" }, bench.refControl({ refKind: spec.refKind, required: false, ui: { icon: spec.icon } }, rule.ref || null,
      (ref) => change(spec.label, (target) => { if (ref) target.ref = ref; else delete target.ref; }))));
    if (spec.amount) {
      const amount = el("input", { type: "number", class: "wbdNumber qbAmount", min: 1, max: QUEST_LIMITS.amount, step: 1, title: "Hoeveel" });
      amount.value = String(rule.amount || 1);
      amount.addEventListener("change", () => change("aantal", (target) => { target.amount = Math.max(1, Math.min(QUEST_LIMITS.amount, Math.round(Number(amount.value) || 1))); }));
      parts.push(el("label", { class: "qbTimes" }, [el("span", { text: "×" }), amount]));
    }
  }
  parts.push(smallButton("🗑️", "Voorwaarde weghalen", remove));
  return el("div", { class: "qbObjective" }, parts);
}

// ---------- 🪜 Stappen ----------

function renderSteps(state, host, body, steps, issues, nameOf) {
  // Velden van de quest zelf (snelle quest, bij groep verlaten) tekent de Werkbank; na opslaan tekenen we de Quest Builder opnieuw.
  const fields = (only) => {
    const form = el("div", { class: "wbdForm" });
    state.bench.renderForm(form, { kind: "quest", docKey: state.docKey, place: "questbuilder", only, bare: true, onSaved: () => render(state) });
    return form;
  };
  if (!steps) {
    const simple = stepsFromSimple(body);
    const convert = el("button", { type: "button", class: "wbdPrimary", text: "🪜 Omzetten naar stappen" });
    convert.addEventListener("click", () => saveSteps(state, body, simple, "omgezet naar stappen", true));
    host.append(el("div", { class: "qbIntro" }, [
      el("p", { text: "Snelle quest (1 doel): " + objectiveText(simple[0].objectives[0], nameOf) + "." }),
      fields(SIMPLE_FIELDS),
      el("p", { class: "wbdNote", text: "Meer nodig (doden, verzamelen, meerdere stappen, eindes)? Omzetten = dezelfde quest als 1 stap + een einde. Spelers die hem al doen merken niets." }),
      convert
    ]));
    return;
  }
  const edit = (label, change) => {
    const copy = clone(steps);
    change(copy);
    saveSteps(state, body, copy, label);
  };
  const general = issues.filter((issue) => !issue.stepId && !issue.spawnId);
  if (general.length) host.append(issueList(general));
  const list = el("div", { class: "qbSteps" });
  steps.forEach((step, index) => list.append(stepCard(state, steps, step, index, issues.filter((issue) => issue.stepId === step.stepId), nameOf, edit)));
  host.append(list);
  const addStep = el("button", { type: "button", class: "wbdGhost", text: "➕ Stap" });
  addStep.addEventListener("click", () => edit("stap erbij", (copy) => {
    const used = new Set(copy.map((step) => step.stepId));
    const stepId = uniqueId("stap_", used);
    let last = -1;
    copy.forEach((step, index) => { if (step.kind === "step") last = index; });
    const prev = last >= 0 ? copy[last] : null;
    const firstEnd = copy.find((step) => step.kind === "end");
    const next = prev && prev.next?.length ? clone(prev.next) : firstEnd ? [{ to: firstEnd.stepId }] : [];
    if (prev) prev.next = [{ to: stepId }];
    copy.splice(last + 1, 0, { stepId, kind: "step", title: "", match: "all", objectives: [], next });
  }));
  const addEnd = el("button", { type: "button", class: "wbdGhost", text: "🏁 Einde" });
  addEnd.addEventListener("click", () => edit("einde erbij", (copy) => {
    const used = new Set(copy.map((step) => step.stepId));
    copy.push({ stepId: used.has("end") ? uniqueId("einde_", used) : "end", kind: "end", title: "" });
  }));
  if (steps.length >= QUEST_LIMITS.steps) { addStep.disabled = true; addEnd.disabled = true; }
  host.append(el("div", { class: "qbAdd" }, [addStep, addEnd,
    el("span", { class: "wbdNote", text: "De bovenste stap is het begin. Elke stap gaat via Daarna naar een volgende stap of een einde." })]));
  // Bij groep verlaten doet alleen iets bij een doel met 👥 Team samen.
  const hasTeam = steps.some((step) => (step.objectives || []).some((objective) => objective?.share === "team"));
  if (hasTeam || (body.partyLeave && body.partyLeave !== "keep")) host.append(fields(["partyLeave"]));
}

function issueList(issues) {
  return el("ul", { class: "qbIssues" }, issues.map((issue) => el("li", { text: "⚠️ " + issue.message })));
}

function textInput(value, placeholder, max, onSave) {
  const input = el("input", { type: "text", class: "wbdText", maxlength: max, placeholder });
  input.value = value || "";
  input.addEventListener("change", () => onSave(input.value.trim()));
  return input;
}

function smallButton(text, title, onClick, disabled = false) {
  const button = el("button", { type: "button", class: "qbIconBtn", text, title, "aria-label": title, disabled: disabled || null });
  button.addEventListener("click", onClick);
  return button;
}

// Verschuiven. Is de quest een gewone rij (elke stap gaat naar de volgende, de laatste naar een einde)?
// Dan schuiven de Daarna-pijlen mee, zodat de rij in de nieuwe volgorde blijft lopen.
function moveStep(copy, index, delta) {
  const before = copy.filter((step) => step.kind === "step");
  const last = before[before.length - 1];
  const finalTo = last && last.next?.length === 1 ? last.next[0].to : null;
  const linear = before.length > 1 && finalTo && copy.some((step) => step.kind === "end" && step.stepId === finalTo)
    && before.every((step, at) => at === before.length - 1 || (step.next?.length === 1 && step.next[0].to === before[at + 1].stepId));
  copy.splice(index + delta, 0, copy.splice(index, 1)[0]);
  if (!linear) return;
  const after = copy.filter((step) => step.kind === "step");
  after.forEach((step, at) => { step.next = [{ to: at < after.length - 1 ? after[at + 1].stepId : finalTo }]; });
}

function stepCard(state, steps, step, index, issues, nameOf, edit) {
  const isEnd = step.kind === "end";
  const at = (copy) => copy[index];
  const card = el("section", { class: "qbStep" + (isEnd ? " qbStepEnd" : "") + (issues.length ? " qbStepBad" : ""), "data-step": step.stepId });
  const goals = (step.objectives || []).map((objective) => objectiveText(objective, nameOf)).join(", ");
  const title = textInput(step.title, isEnd ? "Naam van dit einde (mag leeg)" : (goals || "Naam van de stap (mag leeg)"), QUEST_LIMITS.title,
    (value) => edit("naam", (copy) => { at(copy).title = value; }));
  const head = el("div", { class: "qbStepHead" }, [
    el("span", { class: "qbNum", title: index === 0 ? "Begin van de quest" : "", text: index === 0 && !isEnd ? "▶" : isEnd ? "🏁" : String(index + 1) }),
    title,
    smallButton("▲", "Omhoog", () => edit("volgorde", (copy) => moveStep(copy, index, -1)), index === 0),
    smallButton("▼", "Omlaag", () => edit("volgorde", (copy) => moveStep(copy, index, 1)), index === steps.length - 1),
    smallButton("🗑️", "Weghalen", () => edit("stap weg", (copy) => {
      const gone = copy.splice(index, 1)[0];
      const forward = gone.kind === "step" ? (gone.next || [])[0]?.to : null;
      for (const other of copy) {
        if (other.kind !== "step") continue;
        other.next = (other.next || []).map((link) => (link.to === gone.stepId ? (forward && forward !== other.stepId ? { to: forward } : null) : link)).filter(Boolean);
      }
    }))
  ]);
  card.append(head);
  if (isEnd) {
    card.append(el("div", { class: "wbdNote", text: "Hier is de quest klaar. De beloning (in het questpaneel) krijgt iedere speler 1 keer per keer dat hij de quest speelt." }));
  } else {
    const needed = (step.objectives || []).filter(objectiveNeeded).length;
    if (needed > 1) {
      card.append(el("div", { class: "qbRow" }, [el("span", { class: "qbLabel", text: "✅ Klaar als" }), el("div", { class: "wbdChoices qbMatch" }, Object.entries(STEP_MATCH).map(([value, label]) => {
        const active = (step.match || "all") === value;
        const button = el("button", { type: "button", class: "wbdChoice" + (active ? " active" : ""), "aria-pressed": String(active), text: label });
        button.addEventListener("click", () => edit("klaar als", (copy) => { at(copy).match = value; }));
        return button;
      }))]));
    }
    const objectives = el("div", { class: "qbObjectives" });
    (step.objectives || []).forEach((objective, number) => objectives.append(objectiveRow(state, objective, issues.filter((issue) => issue.objectiveId === objective.objectiveId),
      (label, change) => edit(label, (copy) => change(at(copy).objectives[number], at(copy))),
      () => edit("doel weg", (copy) => { at(copy).objectives.splice(number, 1); }))));
    card.append(objectives);
    const adders = el("div", { class: "qbAdders" }, [el("span", { class: "qbLabel", text: "➕ Doel" })].concat(OBJECTIVE_ORDER.map((type) => {
      const spec = OBJECTIVE_KINDS[type];
      const button = el("button", { type: "button", class: "qbAdder", title: spec.label, disabled: (step.objectives || []).length >= QUEST_LIMITS.objectives || null }, [el("span", { text: spec.icon }), el("span", { text: spec.label })]);
      button.addEventListener("click", () => edit("doel erbij", (copy) => {
        const target = at(copy);
        target.objectives = target.objectives || [];
        const objective = { objectiveId: uniqueId("doel_", new Set(target.objectives.map((entry) => entry.objectiveId))), type, ref: null, role: "required" };
        if (spec.amount) objective.amount = 1;
        target.objectives.push(objective);
      }));
      return button;
    })));
    card.append(adders);
    card.append(rulesBox(state, step, (label, change) => edit(label, (copy) => change(at(copy)))));
    const nextSelect = el("select", { class: "wbdSelect" }, [el("option", { value: "", text: "Kies..." })].concat(steps.filter((other) => other.stepId !== step.stepId)
      .map((other) => el("option", { value: other.stepId, text: stepLabel(other, steps.indexOf(other), nameOf) }))));
    nextSelect.value = (step.next || [])[0]?.to || "";
    nextSelect.addEventListener("change", () => edit("daarna", (copy) => {
      const rest = (at(copy).next || []).slice(1);
      at(copy).next = nextSelect.value ? [{ to: nextSelect.value }].concat(rest) : rest;
    }));
    card.append(el("div", { class: "qbRow" }, [el("span", { class: "qbLabel", text: "➡️ Daarna" }), nextSelect]));
    // Stap 3: Kaart = welk Questgebied deze stap op de minimap en de kaart toont, en hoe.
    const mapArea = areaSelect(state.bench, step.mapRef || null, "Geen gebied", "Het Questgebied van deze stap (maak er een met de Area tool: 🎯 Questgebied)",
      (ref) => edit("kaart", (copy) => { if (ref) at(copy).mapRef = ref; else { delete at(copy).mapRef; delete at(copy).mapShow; } }));
    const mapParts = [mapArea];
    if (step.mapRef) {
      const show = el("select", { class: "wbdSelect", title: "Hoe het gebied op de minimap en de kaart staat" },
        Object.entries(STEP_MAP_SHOW).map(([value, entry]) => el("option", { value, text: entry.icon + " " + entry.label })));
      show.value = STEP_MAP_SHOW[step.mapShow] ? step.mapShow : "area";
      show.addEventListener("change", () => edit("kaart", (copy) => { if (show.value === "area") delete at(copy).mapShow; else at(copy).mapShow = show.value; }));
      mapParts.push(show);
    }
    card.append(el("div", { class: "qbRow" }, [el("span", { class: "qbLabel", text: "🗺️ Kaart" }), el("div", { class: "qbMap" }, mapParts)]));
    card.append(el("div", { class: "qbRow" }, [el("span", { class: "qbLabel", text: "💬 Uitleg" }),
      textInput(step.text, "Wat de speler in zijn questlog leest (mag leeg)", QUEST_LIMITS.text, (value) => edit("uitleg", (copy) => { at(copy).text = value; }))]));
  }
  const own = issues.filter((issue) => !issue.objectiveId);
  if (own.length) card.append(issueList(own));
  return card;
}

function objectiveRow(state, objective, issues, change, remove) {
  const bench = state.bench;
  const spec = OBJECTIVE_KINDS[objective.type] || OBJECTIVE_KINDS.talk;
  const type = el("select", { class: "wbdSelect qbType", title: "Soort doel" }, OBJECTIVE_ORDER.map((value) => el("option", { value, text: OBJECTIVE_KINDS[value].icon + " " + OBJECTIVE_KINDS[value].label })));
  type.value = objective.type;
  type.addEventListener("change", () => change("soort doel", (target) => {
    const next = OBJECTIVE_KINDS[type.value];
    if (next.refKind !== OBJECTIVE_KINDS[target.type]?.refKind) target.ref = null;
    target.type = type.value;
    if (!next.npc) delete target.npcRef;
    if (!next.event) { delete target.share; delete target.areaRef; }
    if (!next.mark) delete target.mark;
    if (target.type !== "defeat") { delete target.credit; delete target.spawnId; }
    if (next.amount) target.amount = target.amount || 1; else delete target.amount;
  }));
  // Ga naar / Verlaat gebied: een keuzelijst met Questgebieden; de rest: een kaart uit de Bibliotheek op het vak.
  const what = spec.refKind === "area"
    ? areaSelect(bench, objective.ref || null, "Kies een Questgebied...", "Welk gebied", (ref) => change("gebied", (target) => { target.ref = ref; }))
    : bench.refControl({ refKind: spec.refKind, required: false, ui: { icon: spec.icon } }, objective.ref || null, (ref) => change("doel", (target) => { target.ref = ref || null; }));
  const parts = [type, el("div", { class: "qbSlot" }, what)];
  // Stap 5: Versla alle vijanden van deze soort, of alleen die van een verschijning van deze quest.
  const spawns = state.spawns || [];
  if (objective.type === "defeat" && (spawns.length || objective.spawnId)) {
    const pick = el("select", { class: "wbdSelect qbShare", title: "Telt elke vijand van deze soort, of alleen de vijanden die deze quest liet verschijnen (👾 Verschijnen)." },
      [el("option", { value: "", text: "⚔️ Elke van deze soort" })].concat(spawns.map((spawn) => el("option", { value: spawn.spawnId, text: "👾 Alleen: " + spawnName(spawn, (ref) => names(bench).nameOf(ref)) }))));
    if (objective.spawnId && !spawns.some((spawn) => spawn.spawnId === objective.spawnId)) pick.append(el("option", { value: objective.spawnId, text: "⚠️ " + objective.spawnId }));
    pick.value = objective.spawnId || "";
    pick.addEventListener("change", () => change("verschijning", (target) => {
      const spawn = spawns.find((entry) => entry.spawnId === pick.value);
      if (!spawn) { delete target.spawnId; return; }
      target.spawnId = spawn.spawnId;
      if (spawn.actorRef) target.ref = spawn.actorRef;
      target.amount = Math.max(1, spawn.count || 1);
    }));
    parts.push(pick);
  }
  if (spec.amount) {
    const amount = el("input", { type: "number", class: "wbdNumber qbAmount", min: 1, max: QUEST_LIMITS.amount, step: 1, title: "Hoeveel" });
    amount.value = String(objective.amount || 1);
    amount.addEventListener("change", () => change("aantal", (target) => { target.amount = Math.max(1, Math.min(QUEST_LIMITS.amount, Math.round(Number(amount.value) || 1))); }));
    parts.push(el("label", { class: "qbTimes" }, [el("span", { text: "×" }), amount]));
  }
  if (spec.npc) {
    parts.push(el("span", { class: "qbLabel", text: "naar" }), el("div", { class: "qbSlot" }, bench.refControl({ refKind: "npc", required: false, ui: { icon: "🧑" } }, objective.npcRef || null,
      (ref) => change("bij wie", (target) => { target.npcRef = ref || null; }))));
  }
  // Stap 3: telt alleen als de vijand, grondstof of pickup in dit Questgebied ligt.
  if (spec.event) {
    parts.push(areaSelect(bench, objective.areaRef || null, "📍 Telt overal", "Waar telt dit? Overal, of alleen als de vijand/grondstof/pickup in dit Questgebied ligt.",
      (ref) => change("alleen in gebied", (target) => { if (ref) target.areaRef = ref; else delete target.areaRef; }), "📍 Telt alleen in 🎯 "));
  }
  // Kevin 5-11: een ster op de minimap en de grote kaart (ook door de mist) die meeloopt met de vijand.
  if (spec.mark) {
    const mark = el("select", { class: "wbdSelect qbShare", title: "⭐ Ster op kaart: de speler ziet op de minimap en de grote kaart (ook door de mist) waar deze vijand of grondstof nu is. De 5 dichtstbijzijnde; hij loopt mee." },
      [el("option", { value: "", text: "🗺️ Geen ster" }), el("option", { value: "star", text: "⭐ Ster op kaart" })]);
    mark.value = objective.mark === "star" ? "star" : "";
    mark.addEventListener("change", () => change("ster op kaart", (target) => { if (mark.value) target.mark = "star"; else delete target.mark; }));
    parts.push(mark);
  }
  // Stap 2 (samen questen): voor wie telt dit doel. Alleen bij Versla, Verzamel en Pak op.
  if (spec.event) {
    const share = el("select", { class: "wbdSelect qbShare", title: "Ieder voor zich: iedereen zijn eigen aantal. Team samen: één teller voor de groep (aantal × teamleden)." },
      Object.entries(OBJECTIVE_SHARES).map(([value, entry]) => el("option", { value, text: entry.icon + " " + entry.label })));
    share.value = objective.share === "team" ? "team" : "personal";
    share.addEventListener("change", () => change("voor wie", (target) => { if (share.value === "team") { target.share = "team"; delete target.credit; } else delete target.share; }));
    parts.push(share);
  }
  // Versla, Ieder voor zich: telt de kill ook voor de groep in de buurt (standaard), alleen wie meevocht, of iedereen in de buurt?
  if (objective.type === "defeat" && objective.share !== "team") {
    const credit = el("select", { class: "wbdSelect qbShare", title: "Voor wie telt een kill. In de buurt = binnen " + QUEST_NEARBY_M + " meter van wie de vijand versloeg." },
      Object.entries(OBJECTIVE_CREDITS).map(([value, entry]) => el("option", { value, text: entry.icon + " " + entry.label })));
    credit.value = OBJECTIVE_CREDITS[objective.credit] ? objective.credit : "group";
    credit.addEventListener("change", () => change("telt voor", (target) => { if (credit.value === "group") delete target.credit; else target.credit = credit.value; }));
    parts.push(credit);
  }
  const role = el("select", { class: "wbdSelect qbRole", title: "Verplicht, verborgen, mag of bonus" }, Object.entries(OBJECTIVE_ROLES).map(([value, entry]) => el("option", { value, text: entry.icon + " " + entry.label })));
  role.value = OBJECTIVE_ROLES[objective.role] ? objective.role : "required";
  role.addEventListener("change", () => change("rol", (target) => { target.role = role.value; }));
  parts.push(role, smallButton("🗑️", "Doel weghalen", remove));
  const row = el("div", { class: "qbObjective" + (issues.length ? " qbObjectiveBad" : "") }, parts);
  return issues.length ? el("div", { class: "qbObjectiveWrap" }, [row, issueList(issues)]) : row;
}

// ---------- ⚡ Als → Dan (stap 5): kleine regels per stap ----------

function rulesBox(state, step, edit) {
  const box = el("div", { class: "qbRules" }, [el("span", { class: "qbLabel", text: "⚡ Als → Dan" })]);
  const rules = Array.isArray(step.rules) ? step.rules : [];
  rules.forEach((rule, index) => box.append(ruleRow(state, step, rule,
    (label, change) => edit(label, (target) => change(target.rules[index], target)),
    () => edit("regel weg", (target) => { target.rules.splice(index, 1); if (!target.rules.length) delete target.rules; }))));
  const add = el("button", { type: "button", class: "wbdGhost", text: "➕ Als → Dan", title: "Bijv. als 5 hout verzameld is, laat 3 wolven verschijnen" });
  add.disabled = rules.length >= QUEST_SPAWN_LIMITS.rules;
  add.addEventListener("click", () => edit("regel erbij", (target) => {
    target.rules = target.rules || [];
    const spawn = (state.spawns || [])[0];
    const rule = { ruleId: uniqueId("regel_", new Set(target.rules.map((entry) => entry.ruleId))), when: "start", then: spawn ? "spawn" : "message" };
    if (spawn) rule.spawnId = spawn.spawnId; else rule.text = "";
    target.rules.push(rule);
  }));
  box.append(el("div", { class: "qbAdd" }, [add, el("span", { class: "wbdNote", text: rules.length ? "Elke regel gaat 1× per keer dat de speler deze stap binnenkomt." : "Bijv. als 5 hout verzameld is, laat 3 wolven verschijnen; of een bericht in beeld." })]));
  return box;
}

function ruleRow(state, step, rule, change, remove) {
  const spawns = state.spawns || [];
  const objectives = Array.isArray(step.objectives) ? step.objectives : [];
  const { nameOf } = names(state.bench);
  const when = el("select", { class: "wbdSelect", title: "Wanneer" }, Object.entries(RULE_WHEN).map(([value, entry]) => el("option", { value, text: entry.icon + " " + entry.label })));
  when.value = RULE_WHEN[rule.when] ? rule.when : "start";
  when.addEventListener("change", () => change("als", (target) => {
    target.when = when.value;
    if (when.value === "count") {
      const first = objectives.find((objective) => OBJECTIVE_KINDS[objective.type]?.amount) || objectives[0];
      if (first) target.objectiveId = first.objectiveId;
      target.amount = target.amount || Math.max(1, Math.ceil((first?.amount || 2) / 2));
    } else { delete target.objectiveId; delete target.amount; }
  }));
  const parts = [when];
  if (rule.when === "count") {
    const goal = el("select", { class: "wbdSelect qbArea", title: "Welk doel" }, [el("option", { value: "", text: "Kies een doel..." })]
      .concat(objectives.map((objective) => el("option", { value: objective.objectiveId, text: objectiveText(objective, nameOf) }))));
    goal.value = rule.objectiveId || "";
    goal.addEventListener("change", () => change("doel", (target) => { if (goal.value) target.objectiveId = goal.value; else delete target.objectiveId; }));
    const amount = el("input", { type: "number", class: "wbdNumber qbAmount", min: 1, max: QUEST_LIMITS.amount, step: 1, title: "Bij hoeveel" });
    amount.value = String(rule.amount || 1);
    amount.addEventListener("change", () => change("aantal", (target) => { target.amount = Math.max(1, Math.min(QUEST_LIMITS.amount, Math.round(Number(amount.value) || 1))); }));
    parts.push(goal, el("label", { class: "qbTimes" }, [el("span", { text: "op" }), amount]));
  }
  const then = el("select", { class: "wbdSelect", title: "Wat er dan gebeurt" }, Object.entries(RULE_THEN).map(([value, entry]) => el("option", { value, text: "→ " + entry.icon + " " + entry.label })));
  then.value = RULE_THEN[rule.then] ? rule.then : "message";
  then.addEventListener("change", () => change("dan", (target) => {
    target.then = then.value;
    if (then.value === "spawn") { delete target.text; if (spawns[0]) target.spawnId = spawns[0].spawnId; }
    else { delete target.spawnId; target.text = target.text || ""; }
  }));
  parts.push(then);
  if (rule.then === "spawn") {
    if (!spawns.length) {
      const go = el("button", { type: "button", class: "wbdGhost", text: "👾 Maak eerst een verschijning" });
      go.addEventListener("click", () => { state.tab = "verschijnen"; render(state); });
      parts.push(go);
    } else {
      const what = el("select", { class: "wbdSelect qbArea", title: "Wat er verschijnt (👾 Verschijnen)" }, [el("option", { value: "", text: "Kies..." })]
        .concat(spawns.map((spawn) => el("option", { value: spawn.spawnId, text: "👾 " + spawnName(spawn, nameOf) }))));
      if (rule.spawnId && !spawns.some((spawn) => spawn.spawnId === rule.spawnId)) what.append(el("option", { value: rule.spawnId, text: "⚠️ " + rule.spawnId }));
      what.value = rule.spawnId || "";
      what.addEventListener("change", () => change("wat verschijnt", (target) => { if (what.value) target.spawnId = what.value; else delete target.spawnId; }));
      parts.push(what);
    }
  } else {
    parts.push(textInput(rule.text, "Bericht in beeld, bijv. Wolven! Verdedig het hout!", QUEST_SPAWN_LIMITS.text, (value) => change("bericht", (target) => { target.text = value; })));
  }
  parts.push(smallButton("🗑️", "Regel weghalen", remove));
  return el("div", { class: "qbObjective qbRule" }, parts);
}

// ---------- 👾 Verschijnen (stap 5): wat de quest laat verschijnen ----------

function renderSpawns(state, host, body, steps, issues, nameOf) {
  const bench = state.bench;
  const spawns = state.spawns || [];
  host.append(el("section", { class: "qbTestBox" }, [el("h4", { text: "👾 Wat deze quest laat verschijnen" }),
    el("p", { class: "wbdNote", text: "Vijanden die bij deze quest horen. Ze verschijnen pas als een regel bij een stap dat zegt: 🪜 Stappen > ⚡ Als → Dan > 👾 Laat verschijnen. Ze komen niet terug als ze dood zijn en worden nooit gekopieerd, ook niet als iemand de groep verlaat (wie erbij was, ziet ze nog)." })]));
  if (!steps) host.append(el("p", { class: "wbdNote", text: "Een snelle quest heeft geen regels. Zet hem eerst om naar stappen (🪜 Stappen)." }));
  const used = (spawnId) => {
    const lines = [];
    (steps || []).forEach((step, index) => {
      for (const rule of step.rules || []) if (rule.then === "spawn" && rule.spawnId === spawnId) lines.push("⚡ " + stepLabel(step, index, nameOf) + ": " + (RULE_WHEN[rule.when]?.label || "") + (rule.when === "count" ? " " + (rule.amount || 1) : ""));
      for (const objective of step.objectives || []) if (objective.spawnId === spawnId) lines.push("⚔️ " + stepLabel(step, index, nameOf) + ": " + objectiveText(objective, nameOf));
    });
    return lines;
  };
  const edit = (label, change) => saveQuest(state, label, change);
  spawns.forEach((spawn, index) => {
    const at = (body2) => body2.spawns[index];
    const card = el("section", { class: "qbStep" + (issues.some((issue) => issue.spawnId === spawn.spawnId) ? " qbStepBad" : ""), "data-spawn": spawn.spawnId });
    const name = textInput(spawn.name, "Naam, bijv. Wolvengroep", QUEST_SPAWN_LIMITS.name, (value) => edit("naam verschijning", (copy) => { if (value) at(copy).name = value; else delete at(copy).name; }));
    card.append(el("div", { class: "qbStepHead" }, [el("span", { class: "qbNum", text: "👾" }), name,
      smallButton("🗑️", "Verschijning weghalen", () => edit("verschijning weg", (copy) => {
        copy.spawns.splice(index, 1);
        // Regels en doelen die erheen wezen: leeg maken (de quest-check zegt wat er nog moet).
        for (const step of Array.isArray(copy.steps) ? copy.steps : []) {
          for (const rule of step.rules || []) if (rule.spawnId === spawn.spawnId) delete rule.spawnId;
          for (const objective of step.objectives || []) if (objective.spawnId === spawn.spawnId) delete objective.spawnId;
        }
      }))]));
    const count = el("input", { type: "number", class: "wbdNumber qbAmount", min: 1, max: QUEST_SPAWN_LIMITS.count, step: 1, title: "Hoeveel" });
    count.value = String(spawn.count || 1);
    count.addEventListener("change", () => edit("aantal verschijning", (copy) => { at(copy).count = Math.max(1, Math.min(QUEST_SPAWN_LIMITS.count, Math.round(Number(count.value) || 1))); }));
    const actor = bench.refControl({ refKind: "actor_archetype", required: false, ui: { icon: "⚔️" } }, spawn.actorRef || null, (ref) => edit("vijand verschijning", (copy) => {
      if (ref) at(copy).actorRef = ref; else delete at(copy).actorRef;
      // Versla-doelen van deze verschijning wijzen naar dezelfde vijand.
      for (const step of Array.isArray(copy.steps) ? copy.steps : []) for (const objective of step.objectives || []) if (objective.spawnId === spawn.spawnId && ref) objective.ref = ref;
    }));
    card.append(el("div", { class: "qbRow" }, [el("span", { class: "qbLabel", text: "⚔️ Wat" }), el("div", { class: "qbObjective" }, [el("div", { class: "qbSlot" }, actor), el("label", { class: "qbTimes" }, [el("span", { text: "×" }), count])])]));
    const audience = el("select", { class: "wbdSelect", title: "Wie ziet ze, kan ze raken en wordt door ze aangevallen" },
      Object.entries(QUEST_SPAWN_AUDIENCE).map(([value, entry]) => el("option", { value, text: entry.icon + " " + entry.label })));
    audience.value = QUEST_SPAWN_AUDIENCE[spawn.audience] ? spawn.audience : "group";
    audience.addEventListener("change", () => edit("voor wie verschijning", (copy) => { if (audience.value === "group") delete at(copy).audience; else at(copy).audience = audience.value; }));
    card.append(el("div", { class: "qbRow" }, [el("span", { class: "qbLabel", text: "👥 Voor wie" }), audience]));
    const where = areaSelect(bench, spawn.areaRef || null, "📍 Rond de speler (7 m)", "Waar ze verschijnen: rond de speler bij wie de regel ging, of in het midden van een Questgebied",
      (ref) => edit("waar verschijning", (copy) => { if (ref) at(copy).areaRef = ref; else delete at(copy).areaRef; }), "🎯 In ");
    card.append(el("div", { class: "qbRow" }, [el("span", { class: "qbLabel", text: "📍 Waar" }), where]));
    const despawn = el("select", { class: "wbdSelect", title: "Wanneer ze weggaan. Dood = weg (ze komen niet terug)." },
      Object.entries(QUEST_SPAWN_DESPAWN).map(([value, entry]) => el("option", { value, text: entry.icon + " " + entry.label })));
    despawn.value = QUEST_SPAWN_DESPAWN[spawn.despawn] ? spawn.despawn : "quest";
    despawn.addEventListener("change", () => edit("verdwijnen verschijning", (copy) => { if (despawn.value === "quest") delete at(copy).despawn; else at(copy).despawn = despawn.value; }));
    card.append(el("div", { class: "qbRow" }, [el("span", { class: "qbLabel", text: "💨 Verdwijnen" }), despawn]));
    const lines = used(spawn.spawnId);
    card.append(el("div", { class: "qbRow" }, [el("span", { class: "qbLabel", text: "🔗 Gebruikt" }),
      el("div", { class: "wbdQuestLines" }, lines.length ? lines.map((line) => el("span", { class: "wbdNote", text: line })) : [el("span", { class: "wbdNote", text: "Nog nergens. Zet bij een stap ⚡ Als → Dan: 👾 Laat verschijnen." })])]));
    const own = issues.filter((issue) => issue.spawnId === spawn.spawnId);
    if (own.length) card.append(issueList(own));
    host.append(card);
  });
  const add = el("button", { type: "button", class: "wbdPrimary", text: "➕ Verschijning" });
  add.disabled = spawns.length >= QUEST_SPAWN_LIMITS.spawns;
  add.addEventListener("click", () => edit("verschijning erbij", (copy) => {
    copy.spawns = Array.isArray(copy.spawns) ? copy.spawns : [];
    copy.spawns.push({ spawnId: uniqueId("spawn_", new Set(copy.spawns.map((entry) => entry.spawnId))), count: 3 });
  }));
  host.append(el("div", { class: "qbAdd" }, [add, el("span", { class: "wbdNote", text: "Sleep een vijand uit de Bibliotheek op het vak ⚔️ Wat." })]));
}

// ---------- 🧪 Testen ----------

function renderTest(state, host, body, steps, issues, nameOf) {
  const check = el("section", { class: "qbTestBox" }, [el("h4", { text: "🔎 Quest-check" })]);
  if (!issues.length && !steps) check.append(el("p", { class: "wbdNote", text: "Snelle quest: SAVE TO GAME controleert item en NPC." }));
  else if (!issues.length) check.append(el("p", { text: "✅ Alles in orde. Deze quest kan naar de game (SAVE TO GAME)." }));
  else {
    check.append(el("p", { class: "wbdNote", text: "SAVE TO GAME houdt deze quest tegen tot dit is opgelost:" }));
    check.append(el("ul", { class: "qbIssues" }, issues.map((issue) => {
      const step = issue.stepId && steps ? steps.find((entry) => entry.stepId === issue.stepId) : null;
      const where = step ? stepLabel(step, steps.indexOf(step), nameOf) + ": " : "";
      return el("li", { text: "⚠️ " + where + issue.message });
    })));
  }
  host.append(check);

  const questId = body.questId;
  const mine = el("section", { class: "qbTestBox" }, [el("h4", { text: "🧍 Jouw speler" }),
    el("p", { class: "wbdNote", text: "Werkt na SAVE TO GAME, met het account waarmee je nu bent ingelogd. Opnieuw en Naar stap staan hieronder bij 👥 Spelers." })]);
  const out = el("div", { class: "qbMine" });
  const show = (text, bad = false) => { out.replaceChildren(el("p", { class: bad ? "qbBad" : "", text })); };
  const refresh = async () => {
    show("Even kijken...");
    try {
      const snapshot = await api("/api/game/node04/state");
      const quest = (snapshot.quests?.all || []).find((entry) => entry.questId === questId);
      if (!quest) { show("Deze quest staat (nog) niet in de game. Druk eerst SAVE TO GAME."); return; }
      const status = { available: "Te halen", active: "Bezig", ready_to_turn_in: "Bezig", completed: "Voltooid" }[quest.status] || quest.status;
      const lines = [el("p", {}, [el("b", { text: status }), quest.activeStep ? " · stap: " + (quest.activeStep.displayName || quest.activeStep.stepId) : ""])];
      for (const objective of quest.activeStep?.objectives || []) {
        lines.push(el("div", { class: "qbMineGoal" + (objective.complete ? " done" : "") }, [el("span", { text: (objective.complete ? "✅ " : "▫️ ") + (objective.displayName || objective.objectiveType) }),
          el("b", { text: objective.currentValue + " / " + objective.requiredValue })]));
      }
      out.replaceChildren(...lines);
    } catch (error) { show(error.message || "Kon je stand niet ophalen.", true); }
  };
  const look = el("button", { type: "button", class: "wbdGhost", text: "🔄 Bekijk mijn stand" });
  look.addEventListener("click", refresh);
  mine.append(el("div", { class: "qbAdd" }, [look]), out);
  host.append(mine, playersBox(state, body, steps, nameOf));
}

// ---------- 👥 Spelers (5-11): wie heeft de quest nog niet, wie is bezig (welke stap), wie is klaar ----------

const PLAYER_STATUS = {
  none: ["⚪", "Nog niet"], available: ["⚪", "Nog niet"], active: ["🟡", "Bezig"], ready_to_turn_in: ["🟡", "Bezig (inleveren)"],
  completed: ["🟢", "Gedaan"], abandoned: ["⚫", "Verlaten"], failed: ["🔴", "Mislukt"]
};
const PLAYER_FILTERS = [["all", "Iedereen"], ["none", "Nog niet"], ["busy", "Bezig"], ["done", "Gedaan"]];
const PLAYER_ROWS_MAX = 200;

function sinceText(iso) {
  const ms = Date.now() - Date.parse(iso || "");
  if (!Number.isFinite(ms) || ms < 0) return "";
  const min = Math.floor(ms / 60000);
  if (min < 60) return min + " min";
  if (min < 48 * 60) return Math.floor(min / 60) + " u";
  return Math.floor(min / 1440) + " d";
}

function playersBox(state, body, steps, nameOf) {
  const bench = state.bench;
  const questId = body.questId;
  const all = steps || stepsFromSimple(body);
  const playable = all.filter((step) => step.kind === "step");
  const stepName = (stepId) => { const index = all.findIndex((step) => step.stepId === stepId); return index >= 0 ? stepLabel(all[index], index, nameOf) : stepId || ""; };
  const classes = new Map(bench.docs("player_class").map((doc) => [doc.body?.classId, bench.docName(doc)]));
  const box = el("section", { class: "qbTestBox" }, [el("h4", { text: "👥 Spelers" }),
    el("p", { class: "wbdNote", text: "Per character: nog niet, bezig (op welke stap en hoe lang al) of gedaan. Zitten veel spelers lang op dezelfde stap, dan lopen ze daar vast. Alleen voor de admin." })]);
  const search = el("input", { type: "search", class: "wbdText qbSearch", placeholder: "🔍 Zoek speler...", value: state.playerSearch || "" });
  const filter = el("select", { class: "wbdSelect", title: "Welke spelers" }, PLAYER_FILTERS.map(([value, label]) => el("option", { value, text: label })));
  filter.value = state.playerFilter || "all";
  const reload = el("button", { type: "button", class: "wbdGhost", text: "🔄 Vernieuwen" });
  const stepPick = el("select", { class: "wbdSelect", title: "Naar welke stap gaat ⏩" }, playable.map((step) => el("option", { value: step.stepId, text: "⏩ " + stepName(step.stepId) })));
  if (state.playerStep && playable.some((step) => step.stepId === state.playerStep)) stepPick.value = state.playerStep;
  stepPick.addEventListener("change", () => { state.playerStep = stepPick.value; });
  const summary = el("div", { class: "qbPlayerSum" });
  const table = el("div", { class: "qbPlayers" });
  box.append(el("div", { class: "qbAdd" }, [search, filter, reload]), summary, el("div", { class: "qbAdd" }, [el("span", { class: "wbdNote", text: "Knop ⏩ zet een speler op:" }), stepPick]), table);
  let players = [];
  let me = null;

  const draw = () => {
    const counts = { none: 0, busy: 0, done: 0, other: 0 };
    const perStep = new Map();
    for (const player of players) {
      const status = player.status;
      if (status === "none" || status === "available") counts.none += 1;
      else if (status === "active" || status === "ready_to_turn_in") { counts.busy += 1; perStep.set(player.stepId, (perStep.get(player.stepId) || 0) + 1); }
      else if (status === "completed") counts.done += 1;
      else counts.other += 1;
    }
    summary.replaceChildren(el("div", { text: "⚪ Nog niet: " + counts.none + " · 🟡 Bezig: " + counts.busy + " · 🟢 Gedaan: " + counts.done + (counts.other ? " · ⚫ Verlaten/mislukt: " + counts.other : "") }));
    if (perStep.size) {
      summary.append(el("div", { class: "qbStepBars" }, playable.concat(Array.from(perStep.keys()).filter((id) => !playable.some((step) => step.stepId === id)).map((stepId) => ({ stepId })))
        .map((step) => {
          const count = perStep.get(step.stepId) || 0;
          return el("div", { class: "qbStepBar" }, [el("span", { text: stepName(step.stepId) }),
            el("span", { class: "qbStepTrack" }, el("span", { class: "qbStepFill", style: "width:" + Math.round((count / Math.max(1, counts.busy)) * 100) + "%" })), el("b", { text: String(count) })]);
        })));
    }
    const term = search.value.trim().toLowerCase();
    const want = filter.value;
    const shown = players.filter((player) => {
      if (term && !String(player.username || "").toLowerCase().includes(term)) return false;
      if (want === "none") return player.status === "none" || player.status === "available";
      if (want === "busy") return player.status === "active" || player.status === "ready_to_turn_in";
      if (want === "done") return player.status === "completed";
      return true;
    });
    const head = el("div", { class: "qbPlayerRow qbPlayerHead" }, ["Speler", "Stand", "Stap", "Sinds", ""].map((text) => el("span", { text })));
    const rows = shown.slice(0, PLAYER_ROWS_MAX).map((player) => {
      const [icon, label] = PLAYER_STATUS[player.status] || ["❔", player.status];
      const who = player.username + (classes.get(player.classId) ? " · " + classes.get(player.classId) : "") + (player.userId === me ? " (jij)" : "");
      const reset = smallButton("↺", "Opnieuw: quest weg bij " + player.username + " (ook de questitems)", () => {
        if (!window.confirm("Quest '" + (body.displayName || questId) + "' weghalen bij " + who + "?\nAlsof hij hem nooit had: stand en questitems gaan weg.")) return;
        act({ action: "reset", playerId: player.playerId });
      });
      const go = smallButton("⏩", "Zet " + player.username + " op de gekozen stap", () => act({ action: "step", playerId: player.playerId, stepId: stepPick.value }), !playable.length);
      return el("div", { class: "qbPlayerRow" }, [el("span", { text: who }), el("span", { text: icon + " " + label }),
        el("span", { text: player.stepId ? stepName(player.stepId) : "" }), el("span", { class: "wbdNote", text: sinceText(player.since) }), el("span", { class: "qbPlayerActs" }, [reset, go])]);
    });
    table.replaceChildren(head, ...rows);
    if (!shown.length) table.append(el("p", { class: "wbdNote", text: players.length ? "Niemand gevonden." : "Nog geen spelers." }));
    if (shown.length > PLAYER_ROWS_MAX) table.append(el("p", { class: "wbdNote", text: "Eerste " + PLAYER_ROWS_MAX + " van " + shown.length + ". Zoek om er minder te zien." }));
  };
  const load = async () => {
    table.replaceChildren(el("p", { class: "wbdNote", text: "Even kijken..." }));
    try {
      const result = await api("/api/admin/quest-players?questId=" + encodeURIComponent(questId || ""));
      players = result.players || [];
      me = result.me || null;
      draw();
    } catch (error) { table.replaceChildren(el("p", { class: "qbBad", text: error.message || "Kon de spelers niet ophalen." })); }
  };
  const act = async (payload) => {
    try {
      const result = await api("/api/admin/quest-players", { method: "POST", body: Object.assign({ questId }, payload) });
      state.setStatus(result.message || "Gedaan.", "success");
    } catch (error) { state.setStatus(error.message || "Mislukt.", "error"); }
    await load();
  };
  search.addEventListener("input", () => { state.playerSearch = search.value; draw(); });
  filter.addEventListener("change", () => { state.playerFilter = filter.value; draw(); });
  reload.addEventListener("click", load);
  load();
  return box;
}
