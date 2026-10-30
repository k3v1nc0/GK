// Werkbank Fase 1 (bouwrecept §0b punt 6, 8, 9): elk veld in het schema heeft een icoon, bediening, plek,
// standaard en Ⓘ-hulp met drie regels; elk getal heeft min, max en stap (anders geen slider).
import test from "node:test";
import assert from "node:assert/strict";
import { CANONICAL_KINDS, validateDocument } from "../src/shared/authoring/kinds.js";
import { CONTROL_FOR_TYPE, FIELD_CONTROLS, FIELD_PLACES, KIND_PLACES } from "../src/shared/authoring/kinds/ui.js";

const filled = (text) => typeof text === "string" && text.trim().length >= 8;

test("elke soort heeft een icoon en een plek", () => {
  for (const [kind, spec] of Object.entries(CANONICAL_KINDS)) {
    assert.ok(spec.icon, kind + " mist een icoon");
    assert.ok(KIND_PLACES.includes(spec.place), kind + " heeft geen geldige plek");
  }
});

test("elk veld heeft icoon, bediening, plek, standaard en Ⓘ-hulp", () => {
  const problems = [];
  for (const [kind, spec] of Object.entries(CANONICAL_KINDS)) {
    for (const [key, field] of Object.entries(spec.fields)) {
      const where = kind + "." + key;
      const ui = field.ui || {};
      if (!ui.icon) problems.push(where + ": geen icoon");
      if (!FIELD_CONTROLS.includes(ui.control)) problems.push(where + ": onbekende bediening " + ui.control);
      else if (!(CONTROL_FOR_TYPE[field.type] || []).includes(ui.control)) problems.push(where + ": bediening " + ui.control + " past niet bij " + field.type);
      if (!FIELD_PLACES.includes(ui.place)) problems.push(where + ": geen plek");
      if (!Object.prototype.hasOwnProperty.call(field, "default")) problems.push(where + ": geen standaard");
      const help = field.help || {};
      if (!filled(help.waarvoor) || !filled(help.goed) || !filled(help.probleem)) problems.push(where + ": Ⓘ-hulp mist waarvoor/goede waarden/probleem");
      if (field.type === "integer" || field.type === "number") {
        if (!Number.isFinite(field.min) || !Number.isFinite(field.max)) problems.push(where + ": getal zonder min/max");
        if (!(ui.step > 0)) problems.push(where + ": getal zonder stap");
        if (ui.range && !(ui.range[0] >= field.min && ui.range[1] <= field.max && ui.range[0] < ui.range[1])) problems.push(where + ": sliderbereik buiten min/max");
      }
      if (field.type === "select") {
        for (const option of field.options) {
          if (field.optionLabels && !field.optionLabels[option]) problems.push(where + ": keuze " + option + " zonder naam");
        }
      }
      if (ui.place === "werkbank" && spec.place === "instellingen") problems.push(where + ": Werkbank-veld in een Instellingen-soort");
    }
  }
  assert.deepEqual(problems, []);
});

test("de standaardwaarden zijn zelf geldig", () => {
  for (const [kind, spec] of Object.entries(CANONICAL_KINDS)) {
    for (const [key, field] of Object.entries(spec.fields)) {
      const value = field.default;
      if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) continue;
      const result = validateDocument(kind, { [key]: value });
      const own = result.issues.filter((entry) => entry.field === key);
      assert.deepEqual(own, [], kind + "." + key + " heeft een ongeldige standaard");
    }
  }
});

test("per soort staan hooguit ±6 velden in beeld (rest onder ⚙️ meer)", () => {
  for (const [kind, spec] of Object.entries(CANONICAL_KINDS)) {
    const visible = Object.values(spec.fields).filter((field) => field.ui.place === spec.place && !field.ui.more);
    assert.ok(visible.length <= 7, kind + " toont " + visible.length + " velden zonder ⚙️");
  }
});
