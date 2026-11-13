// Werkbank Fase 8: geld. Instellingen > 💰 Geld.
// - Winkel: de prijs van een item is standaard zijn Verkoopwaarde × opslag; een eigen prijs in de winkel gaat voor.
// - Terugkopen: wat je aan een winkel verkocht blijft even bij die NPC liggen, voor dezelfde prijs terug.
// - Geldafvoer (keuze van Kevin 11-11, "alle drie, laag"): marktbelasting, craftkosten en reiskosten (portals).
//   Reiskosten staan al bij Instellingen > Portals; hier staan de markt en het craften.
import { help, ui } from "./ui.js";

const SHOP_GROUP = "🛒 Winkel";
const SINK_GROUP = "💸 Waar geld weer verdwijnt";
const LOOT_GROUP = "🎁 Buit";

const slider = (label, icon, def, min, max, step, unit, range, group, helpText) => ({ type: "integer", required: false, min, max, audience: "client", label,
  ui: ui(icon, "slider", "instellingen", Object.assign({ step, range, group }, unit ? { unit } : {})), default: def, help: helpText });

export const ECONOMY_KINDS = {
  economy_settings: {
    label: "Geld",
    icon: "💰",
    place: "instellingen",
    singleton: true,
    domain: "project",
    fields: {
      shopMarkupPct: slider("Winkelprijs", "🏷️", 150, 10, 2000, 10, "% van de waarde", [50, 500], SHOP_GROUP,
        help("Wat een item in een winkel kost als je er geen eigen prijs bij zet: zoveel procent van de Verkoopwaarde van dat item.",
          "150 % = je betaalt anderhalf keer wat je ervoor terugkrijgt. Zo verdient de winkel eraan.",
          "Spelers worden te rijk → hoger. Alles is onbetaalbaar → lager.")),
      shopBuyPct: slider("Winkel koopt terug voor", "↩️", 100, 0, 200, 5, "% van de waarde", [0, 150], SHOP_GROUP,
        help("Wat een winkel betaalt als jij iets verkoopt, als er geen eigen terugkoopprijs staat: zoveel procent van de Verkoopwaarde.",
          "100 % = precies de waarde van het item. Lager voelt als een echte handelaar.",
          "Spelers verdienen te veel met verkopen → lager. Verkopen levert niets op → hoger.")),
      buyBackSlots: slider("Terugkopen: hoeveel onthoudt de winkel", "🧾", 12, 0, 50, 1, "stuks", [0, 30], SHOP_GROUP,
        help("Hoeveel dingen die jij aan een winkel verkocht daar blijven liggen, zodat je ze voor dezelfde prijs kunt terugkopen.",
          "12 is ruim genoeg. 0 = niets terugkopen.",
          "Spelers verkopen per ongeluk iets en zijn het kwijt → hoger.")),
      marketTaxPct: slider("Marktbelasting", "🏛️", 5, 0, 50, 1, "%", [0, 25], SINK_GROUP,
        help("Hoeveel procent de koper op de markt bovenop de prijs betaalt. Dat deel gaat naar de stad en verdwijnt uit het spel; de verkoper krijgt zijn hele prijs.",
          "5 % merk je nauwelijks en houdt de prijzen gezond.",
          "Er komt te veel geld in het spel → hoger. Spelers mijden de markt → lager.")),
      craftCostPct: slider("Craftkosten", "🔨", 10, 0, 200, 5, "% van de waarde", [0, 50], SINK_GROUP,
        help("Wat het maken van iets kost in geld, bovenop de grondstoffen: zoveel procent van de Verkoopwaarde van wat je maakt.",
          "10 % is een kleine kraan. 0 = craften kost alleen grondstoffen.",
          "Niemand craft meer → lager. Craften levert gratis geld op → hoger.")),
      // Fase 8 herstel 3/4 (Kevin 13-11, zoals ESO): buit hoort bij de plek waar je hem kreeg; weglopen = venster dicht.
      lootRangeM: slider("Buitvenster dicht na", "🎁", 3, 1, 20, 1, "m", [2, 8], LOOT_GROUP,
        help("Loop je verder dan dit weg van de plek waar je de buit kreeg, dan gaat het buitvenster dicht. De buit blijft nog even liggen: kom je terug, dan zie je hem weer. Pakken kan alleen zo dichtbij. Buit van één soort (bijv. 3× Hout) gaat altijd meteen in je tas; het venster is er voor een mix.",
          "3 m: een paar stappen opzij en het venster is weg, zoals in ESO. 1 m = één stap.",
          "Het venster gaat dicht terwijl je nog vecht → hoger. Je ziet buit van verderop → lager.")),
      // Fase 8 herstel 4 (Kevin 13-11): één soort gaat meteen in je tas; zo lang zie je een kaartje met wat het was.
      lootShowS: slider("Eén soort even tonen", "🎁", 3, 0, 10, 1, "s", [2, 5], LOOT_GROUP,
        help("Buit van één soort (bijv. 3× Hout) en een los item gaan met één klik of E meteen in je tas. Zo lang zie je daarna een kaartje met wat het was: plaatje, naam en aantal. 0 = geen kaartje.",
          "3 s: even zien wat je kreeg, zonder nog eens te klikken.",
          "Het kaartje zit in de weg tijdens farmen → lager. Spelers missen wat ze kregen → hoger."))
    }
  }
};

// De waarden voor de wereld (alleen bekende velden, binnen min/max).
export function economyValues(body = null) {
  const fields = ECONOMY_KINDS.economy_settings.fields;
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => {
    const raw = body ? body[key] : undefined;
    const value = Math.round(Number(raw));
    return [key, raw !== undefined && raw !== null && raw !== "" && Number.isFinite(value) ? Math.min(field.max, Math.max(field.min, value)) : field.default];
  }));
}

// Wat een item in de winkel kost (eigen prijs gaat voor; anders waarde × opslag). Altijd minstens 1 als het iets waard is.
export function shopSellPrice(vendorValue, ownPrice, markupPct) {
  const own = Math.max(0, Math.round(Number(ownPrice) || 0));
  if (own > 0) return own;
  const value = Math.max(0, Math.round(Number(vendorValue) || 0));
  if (value <= 0) return 0;
  return Math.max(1, Math.round(value * Math.max(0, Number(markupPct) || 0) / 100));
}

// Wat de winkel betaalt als jij iets verkoopt (eigen terugkoopprijs gaat voor).
export function shopBuyPrice(vendorValue, ownPrice, buyPct) {
  const own = Math.max(0, Math.round(Number(ownPrice) || 0));
  if (own > 0) return own;
  const value = Math.max(0, Math.round(Number(vendorValue) || 0));
  if (value <= 0) return 0;
  const pct = Math.max(0, Number(buyPct) || 0);
  return pct <= 0 ? 0 : Math.max(1, Math.round(value * pct / 100));
}
