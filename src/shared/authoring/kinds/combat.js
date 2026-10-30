// Fase 05 (F5-E2-T01): een aanval (ability) als getypeerde data. Alleen hele getallen:
// schade in punten, schaal in basispunten (10000 = 100%), afstand in mm en wachttijd in ms. Geen formules of scripts.
// Werkbank Fase 1: per veld icoon, bediening, plek, standaard en Ⓘ-hulp (zie ./ui.js).
import { HELP_ID, HELP_NAME, help, ui } from "./ui.js";

const PCT = { unit: "%", scale: 100 };

export const COMBAT_KINDS = {
  ability: {
    label: "Aanval",
    plural: "Aanvallen",
    icon: "⚔️",
    place: "werkbank",
    singleton: false,
    domain: "actors",
    idField: "abilityId",
    fields: {
      abilityId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Aanval-ID",
        ui: ui("🔖", "id", "werkbank", { more: true }), default: null, help: HELP_ID("deze aanval") },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam",
        ui: ui("🏷️", "text", "werkbank"), default: "", help: HELP_NAME("deze aanval") },
      baseDamage: { type: "integer", required: true, min: 0, max: 1000000, audience: "server", label: "Basisschade",
        ui: ui("💥", "slider", "werkbank", { step: 1, range: [0, 200] }), default: 10,
        help: help("Hoeveel schade de aanval altijd doet, voordat kracht en pantser meetellen.", "5-20 voor het begin van de game, hoger voor latere vijanden.", "Vijanden gaan te snel dood → lager. Gevechten duren te lang → hoger.") },
      powerScalingBp: { type: "integer", required: true, min: 0, max: 100000, audience: "server", label: "Kracht telt mee",
        ui: ui("💪", "slider", "werkbank", Object.assign({ step: 500, range: [0, 30000] }, PCT)), default: 10000,
        help: help("Hoeveel de aanvalskracht van de aanvaller erbij telt.", "100 % = alle kracht telt mee. 50-150 % is gebruikelijk.", "Betere wapens maken geen verschil → hoger zetten.") },
      armorFactorBp: { type: "integer", required: true, min: 0, max: 100000, audience: "server", label: "Pantser telt mee",
        ui: ui("🛡️", "slider", "werkbank", Object.assign({ step: 500, range: [0, 30000] }, PCT)), default: 10000,
        help: help("Hoeveel het pantser van het doel de schade tegenhoudt.", "100 % = pantser werkt volledig. 0 % = pantser negeren.", "Gepantserde vijanden zijn onverslaanbaar → lager zetten.") },
      rangeMm: { type: "integer", required: true, min: 500, max: 50000, audience: "client", label: "Bereik",
        ui: ui("🎯", "slider", "werkbank", { step: 100, unit: "m", scale: 1000, range: [500, 20000] }), default: 2000,
        help: help("Hoe ver weg het doel mag staan om te raken.", "1,5-2,5 m voor zwaarden, 10-20 m voor bogen en spreuken.", "Je moet tegen het doel aan lopen → hoger. Raken van te ver → lager.") },
      cooldownMs: { type: "integer", required: true, min: 100, max: 600000, audience: "client", label: "Wachttijd",
        ui: ui("⏱️", "slider", "werkbank", { step: 100, unit: "s", scale: 1000, range: [100, 30000] }), default: 1500,
        help: help("Hoe lang je moet wachten voor je deze aanval weer kunt doen.", "1-2 s voor een gewone aanval, 10-60 s voor een sterke.", "Te veel klikken → langer. Gevecht voelt traag → korter.") }
    }
  }
};
