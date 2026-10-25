// Fase 05 (F5-E2-T01): een aanval (ability) als getypeerde data. Alleen hele getallen:
// schade in punten, schaal in basispunten (10000 = 100%), afstand in mm en wachttijd in ms. Geen formules of scripts.
export const COMBAT_KINDS = {
  ability: {
    label: "Aanval",
    singleton: false,
    domain: "actors",
    idField: "abilityId",
    fields: {
      abilityId: { type: "id", required: true, maxLength: 120, audience: "client", label: "Aanval-ID" },
      displayName: { type: "text", required: true, maxLength: 80, audience: "client", label: "Naam" },
      baseDamage: { type: "integer", required: true, min: 0, max: 1000000, audience: "server", label: "Basisschade" },
      powerScalingBp: { type: "integer", required: true, min: 0, max: 100000, audience: "server", label: "Aanvalskracht telt mee (10000 = 100%)" },
      armorFactorBp: { type: "integer", required: true, min: 0, max: 100000, audience: "server", label: "Pantser van het doel telt mee (10000 = 100%)" },
      rangeMm: { type: "integer", required: true, min: 500, max: 50000, audience: "client", label: "Bereik (mm)" },
      cooldownMs: { type: "integer", required: true, min: 100, max: 600000, audience: "client", label: "Wachttijd (ms)" }
    }
  }
};
