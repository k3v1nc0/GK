// Klassen (29-10): het venster 🧙 Characters. Per klasse heb je een eigen character met eigen tas, level en plek.
// Hier kies je met welk character je speelt en hoe het eruitziet. Voorlopig een los venster;
// in de nieuwe HUD (stap 4) krijgt het een vaste plek.
function node(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "text") element.textContent = value;
    else if (key === "class") element.className = value;
    else if (value !== false && value !== null && value !== undefined) element.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) if (child) element.append(child);
  return element;
}

export function createCharactersWindow({ fetchJson, postJson, assetById, onSwitched }) {
  const button = node("button", { type: "button", class: "gkCharButton", title: "Characters", text: "🧙" });
  const panel = node("section", { class: "gkCharPanel", hidden: true, "aria-label": "Characters" });
  let busy = false;

  function look(assetId, selected, onPick) {
    const asset = assetById(assetId);
    const thumb = asset?.thumbnailPath
      ? node("img", { src: asset.thumbnailPath, alt: "" })
      : node("span", { class: "gkCharLookIcon", text: "🧍" });
    const tile = node("button", { type: "button", class: "gkCharLook" + (selected ? " active" : ""), title: asset?.name || assetId }, [thumb]);
    tile.addEventListener("click", onPick);
    return tile;
  }

  async function play(classId, modelAssetId = null) {
    if (busy) return;
    busy = true;
    try {
      await postJson("/api/game/characters/play", modelAssetId ? { classId, modelAssetId } : { classId });
      onSwitched();
    } catch (error) {
      busy = false;
      render({ error: error?.message || "Wisselen lukte niet." });
    }
  }

  async function render(extra = {}) {
    panel.replaceChildren(node("div", { class: "gkCharHead" }, [
      node("strong", { text: "🧙 Characters" }),
      (() => { const close = node("button", { type: "button", class: "gkCharClose", title: "Sluiten", text: "✕" }); close.addEventListener("click", () => toggle(false)); return close; })()
    ]));
    if (extra.error) panel.append(node("div", { class: "gkCharError", text: extra.error }));
    let data;
    try {
      data = await fetchJson("/api/game/characters");
    } catch {
      panel.append(node("div", { class: "gkCharNote", text: "Laden lukte niet." }));
      return;
    }
    const classes = Array.isArray(data?.classes) ? data.classes : [];
    if (!classes.length) {
      panel.append(node("div", { class: "gkCharNote", text: "Er zijn nog geen klassen. Maak ze in de editor onder Instellingen > Klassen." }));
      return;
    }
    for (const entry of classes) {
      const character = entry.character;
      const status = character ? (character.active ? "▶ Je speelt nu" : "Level " + character.level) : "Nog niet gespeeld";
      const card = node("div", { class: "gkCharCard" + (character?.active ? " active" : "") }, [
        node("div", { class: "gkCharTitle" }, [node("strong", { text: entry.displayName }), node("span", { class: "gkCharStatus", text: status })]),
        node("div", { class: "gkCharStats", text: "❤️ " + entry.healthMax + "  💪 " + entry.attackPower + "  🛡️ " + entry.armor + "  💚 " + entry.healPower }),
        entry.description ? node("div", { class: "gkCharNote", text: entry.description }) : null
      ]);
      if (entry.models.length > 1) {
        const looks = node("div", { class: "gkCharLooks" });
        const current = character?.modelAssetId || entry.models[0];
        for (const assetId of entry.models) looks.append(look(assetId, assetId === current, () => play(entry.classId, assetId)));
        card.append(looks);
      }
      if (!character?.active) {
        const start = node("button", { type: "button", class: "gkCharPlay", text: character ? "▶ Spelen" : "✨ Nieuw character" });
        start.addEventListener("click", () => play(entry.classId));
        card.append(start);
      }
      panel.append(card);
    }
  }

  function toggle(open = panel.hidden) {
    panel.hidden = !open;
    button.classList.toggle("active", open);
    if (open) render();
  }

  button.addEventListener("click", () => toggle());
  document.body.append(button, panel);
  return { toggle };
}
