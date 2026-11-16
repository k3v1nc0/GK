// Werkbank Fase 10 (keuze van Kevin 15-11): de Game Bible en de editor kennen elkaar.
// Een bijbelkaart in een kolom voor NPC's, items, quests, bazen of plekken hoort bij een kaart in de editor:
// - vast gekoppeld (node.gameRef = docKey, gekozen op de kaart), of
// - vanzelf: de naam van de kaart (Kevins kaarten heten "Soort: Naam", bijv. "Mentor: @{Mentor}"; een @{Tag} telt met zijn
//   waarde) is gelijk aan de naam van een editorkaart van dat soort (hoofdletters, accenten en leestekens tellen niet).
// - gameRef "none" = deze kaart hoort niet in de game (Kevin kiest dat op de kaart): geen seintje.
// Zo ziet de bijbel wat al in de game zit (en wat nog niet), en de editor wat de bijbel nog mist.
// Dezelfde code draait in de bijbel (browser) en in ⚖️ Balans (server).

export const BIBLE_GAME_KINDS = Object.freeze(["npc", "item_definition", "recipe", "quest", "actor_archetype", "area", "ability", "profession", "lore_entry"]);

// Op een kaart gekozen: "hoort niet in de game" (bijv. de speler zelf, of een idee voor later).
export const BIBLE_NOT_IN_GAME = "none";

export const BIBLE_KIND_LABELS = Object.freeze({
  npc: "NPC", item_definition: "Item", recipe: "Recept", quest: "Quest", actor_archetype: "Vijand", area: "Gebied", ability: "Vaardigheid", profession: "Beroep",
  lore_entry: "Verhaal"
});

// De kolommen uit de bijbel van Kevin (v6.23), en voor nieuwe kolommen een gok op de titel.
const COLUMN_KINDS = Object.freeze({
  "col-chars": ["npc"],
  "col-artifacts": ["item_definition", "recipe"],
  "col-mainquests": ["quest"],
  "col-sidequests": ["quest"],
  "col-bosses": ["actor_archetype"],
  "col-world": ["area"],
  "col-unlocks": ["ability"],
  // Werkbank Fase 10 (10b): facties worden een 📕 Verhaal (leesbaar in de wereld, daarna in het kennisboek).
  "col-factions": ["lore_entry"]
});
const TITLE_HINTS = [
  [/\b(npc|npcs|allies|personages?|characters?)\b/i, ["npc"]],
  [/\b(items?|relics?|crafting|voorwerpen|spullen|recepten)\b/i, ["item_definition", "recipe"]],
  [/\b(quests?|missies)\b/i, ["quest"]],
  [/\b(bosses|boss|bazen|vijanden|enemies|monsters?|beasts?|wilde dieren)\b/i, ["actor_archetype"]],
  [/\b(world|zones?|gebieden|plekken|exploration)\b/i, ["area"]],
  [/\b(unlocks?|vaardigheden|spells?|skills?)\b/i, ["ability"]],
  [/\b(beroepen|professions?)\b/i, ["profession"]],
  [/\b(lore|verhalen|facties|factions?|geschiedenis|legendes?)\b/i, ["lore_entry"]]
];

export function bibleColumnKinds(category) {
  if (!category) return [];
  if (Array.isArray(category.gameKinds)) return category.gameKinds.filter((kind) => BIBLE_GAME_KINDS.includes(kind));
  if (COLUMN_KINDS[category.id]) return COLUMN_KINDS[category.id].slice();
  const title = String(category.title || "");
  for (const [pattern, kinds] of TITLE_HINTS) if (pattern.test(title)) return kinds.slice();
  return [];
}

export function bibleNormName(value) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[’'`´]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

const KIND_WORDS = /^(npc|item|items|quest|boss|enemy|zone|unlock|relic|artifact|mechanic|faction|vijand|gebied|recept|beroep)\s+/i;

// De naam van een bijbelkaart: wat na de dubbele punt staat ("Main Quest 06: Gloommaw in the Mire" = "Gloommaw in the Mire"),
// met elke @{Tag} vervangen door zijn waarde ("Mentor: @{Mentor}" = "Master Thorne"). Geen dubbele punt = de hele titel.
export function bibleCardName(node, tagsByName) {
  const title = String(node?.title || "");
  const colon = title.indexOf(":");
  const part = colon >= 0 && title.slice(colon + 1).trim() ? title.slice(colon + 1) : title;
  const named = part.replace(/@\{([^}]+)\}/g, (all, tagName) => {
    const tag = tagsByName?.get(bibleNormName(tagName));
    return tag && String(tag.value || "").trim() ? String(tag.value).trim() : tagName.replace(KIND_WORDS, "");
  });
  return named.replace(KIND_WORDS, "").replace(/\s+/g, " ").trim();
}

// De korte naam (voor een nieuwe editorkaart): "Lume, the Little Slyph" = "Lume".
export function bibleShortName(name) {
  const text = String(name || "").trim();
  const short = text.split(",")[0].trim();
  return short || text;
}

// Wat er in de editor staat, kort (voor de bijbel en voor Balans).
export function bibleGameIndex(docs) {
  const list = [];
  for (const doc of Array.isArray(docs) ? docs : []) {
    if (!doc || doc.archived || !BIBLE_GAME_KINDS.includes(doc.kind)) continue;
    const body = doc.body || {};
    const entry = { docKey: doc.docKey, kind: doc.kind, name: String(body.displayName || body.name || doc.docKey) };
    // Dialoog staat op één plek: de NPC-kaart in de editor. De bijbel toont hem alleen.
    if (doc.kind === "npc" && body.greeting) entry.greeting = String(body.greeting);
    if (doc.kind === "quest" && body.description) entry.story = String(body.description).slice(0, 400);
    list.push(entry);
  }
  return list;
}

// Koppelt het bord aan de editor. cards: per kaart-id { status: "game" | "missing", kinds, name, docKey, kind, ... }.
// missing = kaarten zonder editorkaart; extra = editorkaarten zonder bijbelkaart.
export function bibleLinks(board, index) {
  const nodes = Array.isArray(board?.nodes) ? board.nodes : [];
  const categories = new Map((Array.isArray(board?.categories) ? board.categories : []).map((category) => [category.id, category]));
  const tagsByName = new Map((Array.isArray(board?.tags) ? board.tags : []).map((tag) => [bibleNormName(tag.name), tag]));
  const entries = Array.isArray(index) ? index : [];
  const byKey = new Map(entries.map((entry) => [entry.docKey, entry]));
  const byName = new Map();
  for (const entry of entries) {
    const key = bibleNormName(entry.name);
    if (!key) continue;
    byName.set(key, (byName.get(key) || []).concat(entry));
  }
  const cards = {};
  const used = new Set();
  const missing = [];
  for (const node of nodes) {
    const kinds = bibleColumnKinds(categories.get(node.categoryId));
    const name = bibleCardName(node, tagsByName);
    let entry = null;
    let lost = false;
    if (node.gameRef === BIBLE_NOT_IN_GAME) {
      cards[node.id] = { status: "none", kinds, name, explicit: true, lost: false };
      continue;
    }
    if (node.gameRef) {
      entry = byKey.get(node.gameRef) || null;
      lost = !entry;
    }
    if (!entry && !node.gameRef) {
      if (!kinds.length) continue;
      // "Lume, the Little Slyph" mag ook gewoon "Lume" heten in de editor.
      const find = (value) => (byName.get(bibleNormName(value)) || []).find((candidate) => kinds.includes(candidate.kind)) || null;
      entry = find(name) || (name !== bibleShortName(name) ? find(bibleShortName(name)) : null);
    }
    const card = { status: entry ? "game" : "missing", kinds: entry ? [entry.kind] : kinds, name, explicit: Boolean(node.gameRef), lost };
    if (entry) {
      used.add(entry.docKey);
      Object.assign(card, { docKey: entry.docKey, kind: entry.kind, gameName: entry.name });
      if (entry.greeting) card.greeting = entry.greeting;
      if (entry.story) card.story = entry.story;
    } else {
      missing.push({ nodeId: node.id, name, kinds: card.kinds, lost });
    }
    cards[node.id] = card;
  }
  const extra = entries.filter((entry) => !used.has(entry.docKey));
  const all = Object.values(cards);
  const inGame = all.filter((card) => card.status === "game").length;
  const notInGame = all.filter((card) => card.status === "none").length;
  return { cards, missing, extra, counts: { linked: all.length - notInGame, inGame, missing: missing.length, extra: extra.length, notInGame } };
}
