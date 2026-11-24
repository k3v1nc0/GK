// Zoekbalk (Kevin 24-11): de editor zoekt in alle instellingen uit het schema, ook in de Ⓘ-uitleg.
import test from "node:test";
import assert from "node:assert/strict";
import { CANONICAL_KINDS } from "../src/shared/authoring/kinds.js";
import { buildSearchIndex, searchIndex } from "../apps/web/public/editor/editor-search.js";

const bench = {
  kinds: () => CANONICAL_KINDS,
  libraryKinds: () => ["item_definition", "npc", "doorway", "quest"],
  settingsMenu: () => Object.entries(CANONICAL_KINDS).filter(([, spec]) => spec.place === "instellingen")
    .map(([id, spec]) => ({ id, icon: spec.icon, label: spec.label })).concat([{ id: "builds", icon: "🚀", label: "Builds" }])
};
const index = buildSearchIndex(bench);
const first = (query) => searchIndex(index, query)[0]?.item;

test("vindt een veld van een Werkbank-kaart (Doorgang) op de naam", () => {
  const hit = searchIndex(index, "sleutel nodig").find((h) => h.item.kind === "doorway");
  assert.ok(hit, "Sleutel nodig van Doorgang niet gevonden");
  assert.equal(hit.item.place, "werkbank");
  assert.equal(hit.item.key, "keyItemRef");
});

test("vindt Instellingen- en Terrein-velden en de kaarten zelf", () => {
  assert.equal(first("builds").kind, "builds");
  const ground = searchIndex(index, "kleur grond").find((h) => h.item.place === "terrein");
  assert.ok(ground, "Terrein-veld niet gevonden");
  assert.ok(index.some((item) => item.place === "instellingen" && item.type === "field"));
});

test("zoekt ook in de uitleg en in de instellingen per vlak-soort", () => {
  const helpOnly = index.find((item) => item.type === "field" && item.helpLines[0] && !item.nLabel.includes("verdwijnt"));
  const word = helpOnly.nHelp.split(/\s+/).find((w) => w.length > 6 && !helpOnly.nLabel.includes(w) && !helpOnly.nPath.includes(w));
  const hit = searchIndex(index, word, 1000).find((h) => h.item === helpOnly);
  assert.ok(hit && hit.inHelp, "uitlegwoord niet gevonden: " + word);
  assert.ok(index.some((item) => item.kind === "area" && item.soort === "muur" && item.type === "field"), "muur-instellingen ontbreken");
  assert.deepEqual(searchIndex(index, "x"), []);
});
