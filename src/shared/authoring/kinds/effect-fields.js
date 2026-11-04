// Healing en tijdelijke effecten (2-11): dezelfde effect-velden voor een item (broodje) en een aanval (gif, genezing over tijd).
// Ze staan samen in een eigen uitklapblok (ui.group) zodat de kaart overzichtelijk blijft.
import { help, ui } from "./ui.js";

const int = (label, icon, min, max, range, group, helpText, extra = {}) => ({ type: "integer", required: false, min, max, audience: "client", label,
  ui: ui(icon, "slider", "werkbank", Object.assign({ step: 1, range, group }, extra)), default: 0, help: helpText });

// unit "min": de duur toont in minuten (opgeslagen in seconden); "s": in seconden.
export function effectFields(group, { unit = "min", what = "dit item" } = {}) {
  const minutes = unit === "min";
  return {
    effectDurationS: int("Effect duurt", "⏳", 0, 7 * 24 * 3600, minutes ? [0, 7200] : [0, 120], group,
      help("Hoe lang het effect werkt. 0 = geen effect. Het is echte tijd: het loopt ook door als je offline bent.",
        minutes ? "5 minuten voor eten, 30-60 minuten voor een drankje. 300 minuten = 5 uur." : "5-15 seconden voor gif of bloeden, 10-20 seconden voor genezing over tijd.",
        "Effect is te snel weg → langer. Icoon verschijnt niet → zet hier meer dan 0 en minstens één effect hieronder."),
      minutes ? { step: 30, unit: "min", scale: 60 } : { unit: "s" }),
    effectAttackPower: int("Extra kracht", "💪", -1000, 1000, [-50, 50], group,
      help("Zolang het effect werkt sla je zoveel harder (min = zwakker).", "+2 tot +10 voor eten. Een vijand-aanval met -5 maakt je zwakker.", "Merk je niets → hoger.")),
    effectArmor: int("Extra pantser", "🛡️", -1000, 1000, [-50, 50], group,
      help("Zolang het effect werkt krijg je minder schade (min = meer schade).", "+2 tot +10.", "Spelers onkwetsbaar → lager.")),
    effectHealPower: int("Extra heal-kracht", "💚", -1000, 1000, [-50, 50], group,
      help("Zolang het effect werkt geneest je genees-spreuk zoveel meer.", "+2 tot +10 voor een healer-drankje.", "Merk je niets → hoger.")),
    // 2-11 (Kevin): genezen over tijd in procenten van je max, om de zoveel seconden (0 % = geen herhaling).
    effectHealthPctBp: int("Levens per keer", "❤️", -10000, 10000, [-1000, 1000], group,
      help("Hoeveel procent van je max levens je elke keer terugkrijgt zolang het effect werkt (hoe vaak: zie 'Om de'). 0 % = niets. Min = gif of bloeden (levens eraf). Eén keer meteen genezen doe je met 'Geneest meteen'.",
        "Broodje: 1 % om de 1 s, 5 minuten lang. Gif: -2 % om de 2 s.", "Gif te sterk → dichter bij 0 %. Genezen te traag → hoger of 'Om de' korter."),
      { step: 10, unit: "%", scale: 100 }),
    effectManaPctBp: int("Mana per keer", "🔵", -10000, 10000, [-1000, 1000], group,
      help("Hoeveel procent van je max mana je elke keer terugkrijgt zolang het effect werkt. 0 % = niets. Min = mana eraf.", "Manadrankje: 2 % om de 1 s.", "Mana raakt nog steeds op → hoger."),
      { step: 10, unit: "%", scale: 100 }),
    effectTickS: Object.assign(int("Om de", "⏱️", 1, 600, [1, 60], group,
      help("Om de hoeveel seconden 'Levens per keer' en 'Mana per keer' gebeuren.", "1 s voor eten, 2-3 s voor gif.", "Getallen springen te vaak in beeld → langer."),
      { unit: "s" }), { default: 1 }),
    effectName: { type: "text", required: false, maxLength: 80, audience: "client", label: "Naam van het effect",
      ui: ui("🏷️", "text", "werkbank", { group }), default: null,
      help: help("De naam die je in de HUD ziet bij het icoontje. Leeg = de naam van " + what + ".", "Kort, bijv. \"Sterk\" of \"Vergiftigd\".", "Naam te lang → korter maken.") },
    effectIconAssetId: { type: "asset", assetType: "image", required: false, maxLength: 160, audience: "client", label: "Icoon in de HUD",
      ui: ui("✨", "asset", "werkbank", { group }), default: null,
      help: help("Het plaatje dat in de HUD bij je portret staat zolang het effect werkt.", minutes ? "Een vierkant plaatje van 64-128 px. Leeg = het plaatje van het item zelf (de thumbnail van het 3D-model)." : "Een vierkant plaatje van 64-128 px. Leeg = een standaard icoontje.", "Icoon wazig → kies een groter plaatje.") }
  };
}
