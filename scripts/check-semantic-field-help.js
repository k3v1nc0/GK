import { NODE_TYPES } from "../apps/web/public/shared/node-types.js";
import { createSemanticFieldHelpRegistry, semanticFieldHelpCoverage } from "../apps/web/public/editor/semantic-field-help.js";

const registry = createSemanticFieldHelpRegistry(NODE_TYPES);
const result = semanticFieldHelpCoverage(NODE_TYPES, registry);

console.log("Zichtbare (nodeType, fieldKey)-combinaties:", result.total);
console.log("Specifieke semantische hulp:", result.semantic);
console.log("Bewust technisch:", result.technical);
console.log("Nog niet actief:", result.inactive);
console.log("Zonder bewezen voorkeursbereik:", result.noProvenRange);
console.log("Ontbrekende entries:", result.missing.length ? result.missing.join(", ") : "geen");
console.log("Alleen generieke fallback:", result.genericOnly.length ? result.genericOnly.join(", ") : "geen");

if (result.missing.length || result.genericOnly.length || result.semantic !== result.total) process.exitCode = 1;
