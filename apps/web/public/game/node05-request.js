// Wat de game naar de server stuurt bij een handelsactie (winkel, maken, ruilen, markt, post).
// Dit is de enige plek waar die velden staan. In Fase 8 vielen tradeId, entryId en revision onderweg weg,
// omdat de game een eigen lijstje had: ruilen en terugkopen kwamen daardoor nooit bij de server aan.
// tests/fase8-herstel.test.js loopt alle acties van de HUD na en faalt als een veld hier ontbreekt.

// Tekstvelden: een id of een stukje tekst (leeg = null).
export const NODE05_TEXT_FIELDS = Object.freeze([
  "stationId", "recipeId", "jobId", "vendorId", "offerId", "orderId", "mailId", "inviteId", "targetPlayerId",
  "itemId", "itemInstanceId", "currencyId",
  // Fase 8: terugkopen, ruilen, markt en post.
  "entryId", "tradeId", "marketId", "toName", "subject", "text"
]);

// Getalvelden: 0 is een echte waarde (bijv. "haal dit uit de ruil"), dus alleen leeg wordt null.
export const NODE05_NUMBER_FIELDS = Object.freeze(["quantity", "unitPriceMinor", "revision", "amountMinor"]);

// Lijsten: meerdere items in één keer (Fase 8 herstel 3: een brief met meerdere items). Elk item: itemId + quantity.
export const NODE05_LIST_FIELDS = Object.freeze(["items"]);

export function node05ActionBody(action, payload, operationId) {
  const source = payload && typeof payload === "object" ? payload : {};
  const body = { action: String(action || "").replace(/^node05:/, "").toLowerCase() };
  for (const key of NODE05_TEXT_FIELDS) {
    const value = source[key];
    body[key] = value === null || value === undefined || value === "" ? null : String(value);
  }
  for (const key of NODE05_NUMBER_FIELDS) {
    const value = source[key];
    const number = value === null || value === undefined || value === "" ? null : Number(value);
    body[key] = number === null || !Number.isFinite(number) ? null : number;
  }
  const list = Array.isArray(source.items) ? source.items : null;
  body.items = list ? list.slice(0, 12).map(function (entry) {
    return { itemId: String(entry?.itemId || ""), quantity: Math.max(1, Math.round(Number(entry?.quantity) || 1)) };
  }).filter(function (entry) { return entry.itemId; }) : null;
  body.operationId = String(operationId || "");
  return body;
}

// Elke druk op een knop is één actie met een eigen nummer. De server geeft bij hetzelfde nummer hetzelfde antwoord.
export function node05OperationId(clientSessionId) {
  return "node05:" + String(clientSessionId || "client") + ":" + Date.now() + ":" + Math.random().toString(36).slice(2, 8);
}
