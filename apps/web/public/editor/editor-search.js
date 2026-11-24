// Zoekbalk (Kevin 24-11): zoek in ALLE instellingen van de editor (Instellingen, Werkbank, Terrein),
// ook in de Ⓘ-uitleg (waarvoor / goede waarden / probleem). Leest alleen het schema (workspace.kinds),
// dus elk nieuw veld is vanzelf vindbaar. Klik op een resultaat = editor.js springt naar die kaart
// en laat het veld oplichten. Geen eigen opslag, geen tweede systeem.

export const SEARCH_PLACES = Object.freeze({ instellingen: "⚙️ Instellingen", werkbank: "🧰 Werkbank", terrein: "⛰️ Terrein" });
// Welk tabblad van Terrein een terreinsoort toont.
export const TERRAIN_TOOL_FOR_KIND = Object.freeze({ world_settings: "ground", terrain_settings: "ground", terrain_water: "water", terrain_texture: "paint", terrain_stamp: "stamp" });
const MAX_HITS = 40;

export function normText(text) {
  return String(text ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function helpLines(help) {
  return help ? [help.waarvoor, help.goed, help.probleem].filter(Boolean).map(String) : [];
}

function optionWords(field) {
  return Object.values(field?.optionLabels || {}).concat((field?.options || []).map((option) => (option && typeof option === "object" ? option.label : ""))).filter(Boolean).join(" ");
}

// Waarom een veld soms niet in beeld staat (ui.when / ui.hideWhen), in gewone woorden.
function hiddenText(spec, field) {
  if (field.ui?.hideWhen) return "verdwijnt zodra '" + (spec.fields?.[field.ui.hideWhen]?.label || field.ui.hideWhen) + "' gevuld is";
  const when = field.ui?.when;
  if (!when) return "";
  const other = spec.fields?.[String(when.key).split(".")[0]];
  const values = (when.is || []).map((value) => other?.optionLabels?.[value] || (value === true ? "aan" : value === false ? "uit" : String(value)));
  return "staat pas in beeld als '" + (other?.label || when.key) + "' op " + values.join(" of ") + " staat";
}

function entry(data) {
  const help = helpLines(data.help);
  return Object.assign(data, {
    helpLines: help,
    nLabel: normText(data.label),
    nPath: normText((data.path || []).join(" ")),
    nOptions: normText(data.options || ""),
    nHelp: normText(help.join(" "))
  });
}

// Eén lijst van alles wat je kunt instellen. bench = createDocBench (kinds(), settingsMenu(), libraryKinds()).
export function buildSearchIndex(bench) {
  const kinds = bench.kinds() || {};
  const out = [];
  const libraryKinds = new Set(typeof bench.libraryKinds === "function" ? bench.libraryKinds() : []);
  // De kaarten zelf: Instellingen-menu, Bibliotheek-tabs en Terrein-tabs.
  for (const item of (typeof bench.settingsMenu === "function" ? bench.settingsMenu() : [])) {
    out.push(entry({ type: "card", place: "instellingen", kind: item.id, icon: item.icon, label: item.label, path: [SEARCH_PLACES.instellingen] }));
  }
  for (const [kind, spec] of Object.entries(kinds)) {
    const kindName = spec.singleton ? spec.label : (spec.plural || spec.label);
    const isTerrainKind = spec.place === "terrein";
    if (libraryKinds.has(kind) || kind === "area" || isTerrainKind) {
      out.push(entry({ type: "card", place: spec.place, kind, icon: spec.icon, label: kindName, path: [SEARCH_PLACES[spec.place] || spec.place] }));
    }
    for (const [key, field] of Object.entries(spec.fields || {})) {
      // Vlak: de instellingen per soort (Muur, Begroeiing, ...) staan in één veld.
      if (field.ui?.control === "areaSettings" && field.soorten) {
        for (const [soort, soortSpec] of Object.entries(field.soorten)) {
          const soortName = (soortSpec.icon ? soortSpec.icon + " " : "") + soortSpec.label;
          out.push(entry({ type: "card", place: "werkbank", kind, soort, soortName, icon: soortSpec.icon || spec.icon, label: soortSpec.label + " (vlak)", path: [SEARCH_PLACES.werkbank, spec.icon + " " + spec.label] }));
          for (const [settingKey, setting] of Object.entries(soortSpec.fields || {})) {
            if (setting.type === "json") continue;
            out.push(entry({ type: "field", place: "werkbank", kind, soort, soortName, key: settingKey, icon: setting.icon || "•", label: setting.label,
              more: Boolean(setting.more), help: setting.help, options: optionWords(setting), path: [SEARCH_PLACES.werkbank, spec.icon + " " + spec.label, soortName] }));
          }
        }
        continue;
      }
      const place = field.ui?.place;
      if (!SEARCH_PLACES[place] || field.ui?.control === "id") continue;
      const perDoc = !spec.singleton && (place === "terrein" || place === "instellingen");
      out.push(entry({ type: "field", place, kind, key, icon: field.ui?.icon || "•", label: field.label, group: field.ui?.group || "",
        more: Boolean(field.ui?.more), help: field.help, options: optionWords(field), soorten: field.ui?.soorten || null,
        hidden: hiddenText(spec, field) || (perDoc ? "staat op elke kaart " + spec.icon + " " + spec.label + ": kies er eerst een" : ""),
        path: [SEARCH_PLACES[place], spec.icon + " " + kindName, field.ui?.group].filter(Boolean) }));
    }
  }
  return out;
}

// Zoekt met alle woorden tegelijk (volgorde maakt niet uit). Naam telt het zwaarst, dan plek, keuzes, uitleg.
export function searchIndex(index, query, limit = MAX_HITS) {
  const whole = normText(query).trim();
  const words = whole.split(/\s+/).filter(Boolean);
  if (!words.length || whole.length < 2) return [];
  const hits = [];
  for (const item of index) {
    let score = 0;
    let inHelp = false;
    let ok = true;
    for (const word of words) {
      if (item.nLabel.includes(word)) score += item.nLabel.startsWith(word) ? 40 : 30;
      else if (item.nPath.includes(word)) score += 15;
      else if (item.nOptions.includes(word)) score += 10;
      else if (item.nHelp.includes(word)) { score += 4; inHelp = true; }
      else { ok = false; break; }
    }
    if (!ok) continue;
    if (item.nLabel === whole) score += 100;
    else if (item.nLabel.includes(whole)) score += 50;
    if (item.type === "card") score += 5;
    hits.push({ item, score, inHelp, words });
  }
  hits.sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label));
  return hits.slice(0, limit);
}

// Het stukje uitleg waar het woord in staat (voor onder het resultaat).
function snippet(item, words) {
  for (const line of item.helpLines) {
    const low = normText(line);
    const word = words.find((w) => low.includes(w));
    if (!word) continue;
    const at = low.indexOf(word);
    const start = Math.max(0, at - 40);
    const end = Math.min(line.length, at + word.length + 60);
    return { before: (start > 0 ? "…" : "") + line.slice(start, at), match: line.slice(at, at + word.length), after: line.slice(at + word.length, end) + (end < line.length ? "…" : "") };
  }
  return null;
}

function node(tag, className, text) {
  const out = document.createElement(tag);
  if (className) out.className = className;
  if (text !== undefined) out.textContent = text;
  return out;
}

// De zoekbalk zelf. input + results = elementen uit index.html; onOpen(hit) springt erheen (editor.js).
export function createEditorSearch({ input, results, getBench, onOpen }) {
  if (!input || !results) return null;
  let index = null;
  let indexKinds = null;
  let hits = [];
  let active = 0;

  function ensureIndex() {
    const bench = getBench();
    if (!bench?.workspace) return null;
    if (!index || indexKinds !== bench.workspace.kinds) {
      index = buildSearchIndex(bench);
      indexKinds = bench.workspace.kinds;
    }
    return index;
  }

  function close() {
    results.hidden = true;
    results.replaceChildren();
  }

  function pick(hit) {
    if (!hit) return;
    close();
    input.blur();
    onOpen(Object.assign({}, hit.item, { inHelp: hit.inHelp }));
  }

  function paint() {
    results.replaceChildren();
    const query = input.value.trim();
    if (query.length < 2) { results.hidden = true; return; }
    if (!hits.length) {
      results.append(node("div", "edSearchEmpty", index ? "Niets gevonden voor \"" + query + "\"." : "Laden..."));
      results.hidden = false;
      return;
    }
    results.append(node("div", "edSearchCount", hits.length + (hits.length >= MAX_HITS ? "+" : "") + " gevonden · ↑↓ en Enter, of klik"));
    hits.forEach((hit, i) => {
      const item = hit.item;
      const button = node("button", "edSearchHit" + (i === active ? " active" : ""));
      button.type = "button";
      const text = node("span", "edSearchText");
      text.append(node("span", "edSearchLabel", item.label + (item.type === "card" ? " (kaart)" : "")), node("span", "edSearchPath", item.path.join(" › ")));
      const part = hit.inHelp ? snippet(item, hit.words) : null;
      if (part) {
        const snip = node("span", "edSearchSnip", part.before);
        snip.append(node("mark", "", part.match), document.createTextNode(part.after));
        text.append(snip);
      }
      button.append(node("span", "edSearchIcon", item.icon || "•"), text);
      // mousedown: kiezen voordat de zoekbalk zijn focus verliest (anders sluit de lijst eerst).
      button.addEventListener("mousedown", (event) => { event.preventDefault(); pick(hit); });
      results.append(button);
    });
    results.hidden = false;
    results.querySelector(".edSearchHit.active")?.scrollIntoView({ block: "nearest" });
  }

  async function run() {
    const query = input.value;
    if (!ensureIndex()) {
      paint();
      const bench = getBench();
      if (bench?.load) { try { await bench.load(); } catch { return; } }
      if (input.value !== query) return;
    }
    hits = searchIndex(ensureIndex() || [], query);
    active = 0;
    paint();
  }

  input.addEventListener("input", () => { void run(); });
  input.addEventListener("focus", () => { if (input.value.trim().length >= 2) void run(); });
  input.addEventListener("blur", () => { setTimeout(close, 150); });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { input.value = ""; close(); input.blur(); return; }
    if (!hits.length || results.hidden) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      active = (active + (event.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length;
      paint();
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(hits[active]);
    }
  });
  // Ctrl+K (of Cmd+K) = naar de zoekbalk, vanuit elk tabblad.
  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && String(event.key || "").toLowerCase() === "k") {
      event.preventDefault();
      input.focus();
      input.select();
    }
  }, true);
  return { close };
}
