// Eén compacte kiezer voor assetvelden en sleepvakken in de editor.
import { el } from "./canonical-api.js";

const ASSET_MIME = "text/gk-asset";
const PAGE_SIZE = 48;
let closeActivePicker = null;
let nextPickerId = 0;
const searchText = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function thumbnail(option = {}) {
  const face = el("span", { class: "miniAssetThumb" });
  if (option.thumbnailPath) {
    const img = el("img", { src: option.thumbnailPath, alt: "", loading: "lazy", draggable: "false" });
    img.addEventListener("error", () => face.replaceChildren(el("span", { text: option.icon || "▧" })), { once: true });
    face.append(img);
  } else face.append(el("span", { text: option.icon || "▧" }));
  return face;
}

export function createMiniPicker({ value = "", selected = null, label = "Asset", placeholder = "Kies of sleep een asset…",
  getOptions = () => [], onChange, onClear, accepts = () => false, onDrop, disabled = false } = {}) {
  const root = el("div", { class: "miniAssetPicker" });
  const trigger = el("button", { type: "button", class: "miniAssetTrigger", disabled,
    "aria-label": label, "aria-haspopup": "dialog", "aria-expanded": "false" });
  const clear = el("button", { type: "button", class: "miniAssetClear", title: "Leegmaken", "aria-label": label + " leegmaken", text: "×", disabled });
  root.append(trigger, clear);
  let current = value || "";
  let fallback = selected;
  let close = null;

  function paint() {
    const option = getOptions().find((entry) => entry.value === current) || fallback || (current ? { label: current } : null);
    trigger.replaceChildren(el("span", { class: "miniAssetDropIcon", text: "⇩", title: "Sleep hierheen", "aria-hidden": "true" }),
      thumbnail(option || {}), el("span", { class: "miniAssetName", text: option?.label || placeholder }),
      el("span", { class: "miniAssetArrow", text: "▾", "aria-hidden": "true" }));
    trigger.title = option?.label || placeholder;
    clear.hidden = !option || !onClear;
    root.classList.toggle("filled", Boolean(option));
  }

  function choose(next) {
    close?.(true);
    current = next || "";
    fallback = null;
    paint();
    onChange?.(next);
  }

  clear.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    close?.(true);
    current = "";
    fallback = null;
    paint();
    onClear?.();
  });

  function open() {
    if (disabled || !onChange) return;
    if (close) { close(true); return; }
    closeActivePicker?.();
    const popupId = "mini-asset-" + ++nextPickerId;
    const popup = el("div", { class: "miniAssetPopup", id: popupId, role: "dialog", "aria-label": label, popover: "manual" });
    const search = el("input", { class: "miniAssetSearch", type: "search", placeholder: "Zoeken op naam of categorie…", "aria-label": label + " zoeken", autocomplete: "off" });
    const count = el("div", { class: "miniAssetCount", role: "status" });
    const results = el("div", { class: "miniAssetResults" });
    const grid = el("div", { class: "miniAssetGrid" });
    const more = el("button", { type: "button", class: "miniAssetMore", text: "Meer tonen" });
    results.append(grid, more);
    popup.append(search, count, results);
    // Buiten de scrollpanelen, zodat ook een veld onderaan of in een smalle kolom kan uitklappen.
    document.body.append(popup);
    if (typeof popup.showPopover === "function") popup.showPopover();
    trigger.setAttribute("aria-controls", popupId);
    trigger.setAttribute("aria-expanded", "true");
    const entries = getOptions().map((option) => ({ ...option, search: searchText([option.label, option.subtitle, option.value].join(" ")) }));
    let filtered = entries;
    let shown = 0;

    function addPage() {
      const fragment = document.createDocumentFragment();
      for (const option of filtered.slice(shown, shown + PAGE_SIZE)) {
        const button = el("button", { type: "button", class: "miniAssetOption", title: [option.label, option.subtitle].filter(Boolean).join(" · "),
          "aria-pressed": String(option.value === current) }, [thumbnail(option), el("span", { text: option.label })]);
        button.addEventListener("click", () => choose(option.value));
        fragment.append(button);
      }
      grid.append(fragment);
      shown = Math.min(filtered.length, shown + PAGE_SIZE);
      more.hidden = shown >= filtered.length;
      count.textContent = filtered.length ? shown + " van " + filtered.length : "Geen resultaten";
    }

    function filter() {
      const words = searchText(search.value).trim().split(/\s+/).filter(Boolean);
      filtered = entries.filter((option) => words.every((word) => option.search.includes(word)));
      shown = 0;
      grid.replaceChildren();
      results.scrollTop = 0;
      addPage();
    }
    search.addEventListener("input", filter);
    more.addEventListener("click", addPage);
    filter();
    const rect = root.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 10;
    const above = rect.top - 10;
    const openBelow = below >= 240 || below >= above;
    const height = Math.min(400, Math.max(80, openBelow ? below : above));
    const width = Math.min(Math.max(300, rect.width), window.innerWidth - 16);
    popup.style.width = width + "px";
    popup.style.maxHeight = height + "px";
    popup.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + "px";
    popup.style.top = (openBelow ? rect.bottom + 4 : Math.max(8, rect.top - popup.getBoundingClientRect().height - 4)) + "px";

    const outside = (event) => { if (!root.contains(event.target) && !popup.contains(event.target)) close?.(); };
    const onScroll = (event) => { if (!popup.contains(event.target)) close?.(); };
    const onResize = () => close?.();
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close?.(true); }
    };
    const observer = new MutationObserver(() => { if (!root.isConnected) close?.(); });
    close = (restoreFocus = false) => {
      observer.disconnect();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      popup.remove();
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("aria-controls");
      closeActivePicker = null;
      close = null;
      if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
    closeActivePicker = close;
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    observer.observe(document.body, { childList: true, subtree: true });
    popup.addEventListener("keydown", (event) => {
      event.stopPropagation();
      const buttons = [...grid.querySelectorAll("button")];
      const index = buttons.indexOf(document.activeElement);
      const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[event.key];
      if (document.activeElement === search && event.key === "ArrowDown") { event.preventDefault(); buttons[0]?.focus(); }
      else if (index >= 0 && delta) { event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, index + delta))]?.focus(); }
    });
    popup.addEventListener("focusout", () => requestAnimationFrame(() => {
      if (!popup.contains(document.activeElement) && !root.contains(document.activeElement)) close?.();
    }));
    search.focus({ preventScroll: true });
  }

  trigger.addEventListener("click", open);
  root.addEventListener("dragover", (event) => {
    if (disabled || !accepts(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    root.classList.add("over");
  });
  root.addEventListener("dragleave", (event) => {
    if (!root.contains(event.relatedTarget)) root.classList.remove("over");
  });
  root.addEventListener("drop", (event) => {
    root.classList.remove("over");
    if (disabled || !accepts(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    close?.();
    onDrop?.(event.dataTransfer, choose);
  });
  paint();
  return root;
}

export function createAssetPicker({ getAssets, assetTypes = [], value, label = "Asset", placeholder, onChange,
  onError = () => {}, allowClear = true, disabled = false } = {}) {
  const types = new Set(assetTypes);
  if (types.has("image") || types.has("texture")) { types.add("image"); types.add("texture"); }
  const matches = (asset) => types.has(asset.assetType);
  return createMiniPicker({ value, label, placeholder, disabled, onChange,
    onClear: allowClear ? () => onChange(null) : null,
    getOptions: () => getAssets().filter(matches).map((asset) => ({ value: asset.id, label: asset.name || asset.id,
      subtitle: [asset.category, asset.assetType].filter(Boolean).join(" · "),
      thumbnailPath: asset.thumbnailPath || (["image", "texture"].includes(asset.assetType) ? asset.sourcePath : ""),
      icon: { model: "⬡", audio: "♫", image: "▧", texture: "▧", data: "{}" }[asset.assetType] })),
    accepts: (transfer) => Array.from(transfer?.types || []).includes(ASSET_MIME),
    onDrop: (transfer, choose) => {
      const asset = getAssets().find((entry) => entry.id === transfer.getData(ASSET_MIME));
      if (!asset || !matches(asset)) { onError("Dit asset past niet in " + label + "."); return; }
      choose(asset.id);
    }
  });
}
