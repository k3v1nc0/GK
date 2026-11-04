// Quest Builder stap 1 (4-11): een quest als netwerk van stappen, over de editor heen, met tabs.
// 📋 Basis = de gewone Quest-kaart; 🪜 Stappen = stappen, doelen en eindes; 🧪 Testen = quest-check en je eigen stand.
// Alles schrijft naar het quest-document (veld steps) via de opslag van de Werkbank (met Ctrl+Z).
// De quest-check is dezelfde als bij SAVE TO GAME (shared/quest-graph.js).
import { api, el } from "./canonical-api.js";
import { OBJECTIVE_KINDS, OBJECTIVE_ORDER, OBJECTIVE_ROLES, OBJECTIVE_SHARES, QUEST_LIMITS, STEP_MATCH, hasOwnSteps, objectiveNeeded, objectiveText, questGraphIssues, stepsFromSimple } from "../shared/quest-graph.js?v=20261104-quest2";

const TABS = [["basis", "📋 Basis"], ["stappen", "🪜 Stappen"], ["testen", "🧪 Testen"]];
const SIMPLE_FIELDS = ["goal", "itemRef", "amount", "targetNpcRef"];
let current = null;

const clone = (value) => JSON.parse(JSON.stringify(value));

export function openQuestBuilder(bench, docKey, { setStatus = () => {}, tab = "stappen" } = {}) {
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
  const refExists = (ref) => { const doc = bench.doc(ref); return Boolean(doc) && !doc.archived; };
  return { nameOf, refExists };
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
  const issues = steps ? questGraphIssues(steps, { refExists, refLabel: nameOf }) : [];
  const badge = !steps ? el("span", { class: "qbBadge", text: "Snelle quest" })
    : issues.length ? el("span", { class: "qbBadge qbBadgeBad", text: "⚠️ " + issues.length + (issues.length === 1 ? " melding" : " meldingen") })
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
  if (state.tab === "basis") {
    const form = el("div", { class: "wbdForm" });
    content.append(form);
    bench.renderForm(form, { kind: "quest", docKey: doc.docKey });
  } else if (state.tab === "testen") renderTest(state, content, body, steps, issues, nameOf);
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

// ---------- 🪜 Stappen ----------

function renderSteps(state, host, body, steps, issues, nameOf) {
  if (!steps) {
    const simple = stepsFromSimple(body);
    const convert = el("button", { type: "button", class: "wbdPrimary", text: "🪜 Omzetten naar stappen" });
    convert.addEventListener("click", () => saveSteps(state, body, simple, "omgezet naar stappen", true));
    host.append(el("div", { class: "qbIntro" }, [
      el("p", { text: "Dit is nu een snelle quest: " + objectiveText(simple[0].objectives[0], nameOf) + "." }),
      el("p", { class: "wbdNote", text: "Omzetten = dezelfde quest als 1 stap + een einde. Daarna kun je doelen en stappen toevoegen. Spelers die hem al doen merken niets." }),
      convert
    ]));
    return;
  }
  const edit = (label, change) => {
    const copy = clone(steps);
    change(copy);
    saveSteps(state, body, copy, label);
  };
  const general = issues.filter((issue) => !issue.stepId);
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
    card.append(el("div", { class: "wbdNote", text: "Hier is de quest klaar. De beloning (tab Basis) krijgt iedere speler 1 keer per keer dat hij de quest speelt." }));
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
    const nextSelect = el("select", { class: "wbdSelect" }, [el("option", { value: "", text: "Kies..." })].concat(steps.filter((other) => other.stepId !== step.stepId)
      .map((other) => el("option", { value: other.stepId, text: stepLabel(other, steps.indexOf(other), nameOf) }))));
    nextSelect.value = (step.next || [])[0]?.to || "";
    nextSelect.addEventListener("change", () => edit("daarna", (copy) => {
      const rest = (at(copy).next || []).slice(1);
      at(copy).next = nextSelect.value ? [{ to: nextSelect.value }].concat(rest) : rest;
    }));
    card.append(el("div", { class: "qbRow" }, [el("span", { class: "qbLabel", text: "➡️ Daarna" }), nextSelect]));
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
    if (!next.event) delete target.share;
    if (next.amount) target.amount = target.amount || 1; else delete target.amount;
  }));
  const parts = [type, el("div", { class: "qbSlot" }, bench.refControl({ refKind: spec.refKind, required: false, ui: { icon: spec.icon } }, objective.ref || null,
    (ref) => change("doel", (target) => { target.ref = ref || null; })))];
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
  // Stap 2 (samen questen): voor wie telt dit doel. Alleen bij Versla, Verzamel en Pak op.
  if (spec.event) {
    const share = el("select", { class: "wbdSelect qbShare", title: "Ieder voor zich: iedereen zijn eigen aantal. Team samen: één teller voor de groep (aantal × teamleden)." },
      Object.entries(OBJECTIVE_SHARES).map(([value, entry]) => el("option", { value, text: entry.icon + " " + entry.label })));
    share.value = objective.share === "team" ? "team" : "personal";
    share.addEventListener("change", () => change("voor wie", (target) => { if (share.value === "team") target.share = "team"; else delete target.share; }));
    parts.push(share);
  }
  const role = el("select", { class: "wbdSelect qbRole", title: "Verplicht, verborgen, mag of bonus" }, Object.entries(OBJECTIVE_ROLES).map(([value, entry]) => el("option", { value, text: entry.icon + " " + entry.label })));
  role.value = OBJECTIVE_ROLES[objective.role] ? objective.role : "required";
  role.addEventListener("change", () => change("rol", (target) => { target.role = role.value; }));
  parts.push(role, smallButton("🗑️", "Doel weghalen", remove));
  const row = el("div", { class: "qbObjective" + (issues.length ? " qbObjectiveBad" : "") }, parts);
  return issues.length ? el("div", { class: "qbObjectiveWrap" }, [row, issueList(issues)]) : row;
}

// ---------- 🧪 Testen ----------

function renderTest(state, host, body, steps, issues, nameOf) {
  const check = el("section", { class: "qbTestBox" }, [el("h4", { text: "🔎 Quest-check" })]);
  if (!steps) check.append(el("p", { class: "wbdNote", text: "Snelle quest: SAVE TO GAME controleert item en NPC." }));
  else if (!issues.length) check.append(el("p", { text: "✅ Alles in orde. Deze quest kan naar de game (SAVE TO GAME)." }));
  else {
    check.append(el("p", { class: "wbdNote", text: "SAVE TO GAME houdt deze quest tegen tot dit is opgelost:" }));
    check.append(el("ul", { class: "qbIssues" }, issues.map((issue) => {
      const step = issue.stepId ? steps.find((entry) => entry.stepId === issue.stepId) : null;
      const where = step ? stepLabel(step, steps.indexOf(step), nameOf) + ": " : "";
      return el("li", { text: "⚠️ " + where + issue.message });
    })));
  }
  host.append(check);

  const questId = body.questId;
  const mine = el("section", { class: "qbTestBox" }, [el("h4", { text: "🧍 Jouw speler" }),
    el("p", { class: "wbdNote", text: "Werkt na SAVE TO GAME, met het account waarmee je nu bent ingelogd. 'Naar stap' en 'Opnieuw' alleen als DEV_GAME_ACTIONS=1 op de server aan staat." })]);
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
  const act = async (payload) => {
    try {
      const result = await api("/api/game/node04/action", { method: "POST", body: Object.assign({ questId, operationId: "qb_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8) }, payload) });
      state.setStatus(result.message || "Gedaan.", "success");
      await refresh();
    } catch (error) { show(error.message || "Mislukt.", true); }
  };
  const look = el("button", { type: "button", class: "wbdGhost", text: "🔄 Bekijk mijn stand" });
  look.addEventListener("click", refresh);
  const reset = el("button", { type: "button", class: "wbdGhost", text: "↺ Opnieuw (te halen)" });
  reset.addEventListener("click", () => act({ action: "reset_quest" }));
  const buttons = [look, reset];
  const all = steps || stepsFromSimple(body);
  const playable = all.filter((step) => step.kind === "step");
  if (playable.length) {
    const pick = el("select", { class: "wbdSelect" }, playable.map((step) => el("option", { value: step.stepId, text: stepLabel(step, all.indexOf(step), nameOf) })));
    const go = el("button", { type: "button", class: "wbdGhost", text: "⏩ Naar stap" });
    go.addEventListener("click", () => act({ action: "dev_set_step", stepId: pick.value }));
    buttons.push(pick, go);
  }
  mine.append(el("div", { class: "qbAdd" }, buttons), out);
  host.append(mine);
}
