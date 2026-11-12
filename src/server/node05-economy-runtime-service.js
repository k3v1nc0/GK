import crypto from "node:crypto";
import { assertDeveloperActionAllowed, normalizedActionPayloadHash } from "./action-security.js";
import { runOperation } from "./persistence/operation-contract.js";
import { partyRulesFromProject } from "./runtime/party-runtime.js";
import { economyValues, shopBuyPrice, shopSellPrice } from "../shared/authoring/kinds/economy.js";
import { tradeValues } from "../shared/authoring/kinds/trade.js";

function now() {
  return new Date().toISOString();
}

function addSeconds(seconds) {
  return new Date(Date.now() + Math.max(0, Number(seconds) || 0) * 1000).toISOString();
}

function addDays(days) {
  return new Date(Date.now() + Math.max(1, Number(days) || 1) * 86400000).toISOString();
}

function safeString(value, fallback = "") {
  const text = String(value === null || value === undefined ? "" : value).trim();
  return text || fallback;
}

function safeInteger(value, fallback = 0) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : fallback;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function stableJson(value) {
  return JSON.stringify(value);
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function randomId(prefix) {
  return prefix + "_" + crypto.randomUUID();
}

function catalogSection(catalogs, key) {
  return catalogs && typeof catalogs[key] === "object" && catalogs[key] ? catalogs[key] : {};
}

function policiesOfType(project, type) {
  return Array.isArray(project?.playerRules?.byType?.[type]) ? project.playerRules.byType[type] : [];
}

function firstPolicy(project, type, fallback = {}) {
  return policiesOfType(project, type)[0] || fallback;
}

// Fase 8: de geldregels uit Instellingen > 💰 Geld (zonder kaart de standaarden uit het schema).
function economyRules(project) {
  return economyValues(policiesOfType(project, "economy_rules")[0] || null);
}

function uiModules(project) {
  return Array.isArray(project?.ui?.modules) ? project.ui.modules : [];
}

function node05Modules(project) {
  const types = new Set(["party_hud", "vendor_hud", "crafting_hud", "trade_hud", "market_hud", "mail_hud"]);
  return uiModules(project).filter(function (module) {
    return module && types.has(module.nodeType) && module.moduleId;
  });
}

function displayForItem(catalogs, itemId) {
  const item = catalogSection(catalogs, "items")[itemId] || {};
  return item.displayName || itemId;
}

function displayForCurrency(catalogs, currencyId) {
  const currency = catalogSection(catalogs, "currencies")[currencyId] || {};
  return currency.displayName || currencyId;
}

function positionDistance(position, entity) {
  if (!position || !entity) return null;
  return Math.hypot(safeNumber(position.x, 0) - safeNumber(entity.x, 0), safeNumber(position.z, 0) - safeNumber(entity.z, 0));
}

function normalizeMode(value, allowed, fallback) {
  const text = safeString(value, fallback).toLowerCase();
  return allowed.includes(text) ? text : fallback;
}

function normalizeQuantity(value, fallback = 1) {
  return Math.max(1, safeInteger(value, fallback));
}

// Questitems (Quest Builder stap 4) zijn nooit te verhandelen of te verkopen.
function itemIsTradable(item) {
  return item && item.tradable !== false && item.bindPolicy !== "quest_bound" && item.questItem !== true && item.category !== "quest";
}

// Fase 8 herstel: alles wat je mag ruilen mag ook op de markt (een oud item kan het nog expliciet uitzetten).
function itemMarketOk(item) {
  return Boolean(item) && item.marketEligible !== false && itemIsTradable(item);
}

// De valuta van een winkel: "Betalen met" op de NPC-kaart, anders die van zijn waren, anders de eerste valuta.
function vendorCurrency(catalogs, catalog, item) {
  const offers = Array.isArray(catalog?.offers) ? catalog.offers : [];
  const first = Object.keys(catalogSection(catalogs, "currencies"))[0] || "currency.gold";
  return catalog?.currencyRef || offers.find((offer) => offer.sellCurrencyRef)?.sellCurrencyRef || item?.vendorCurrencyRef || first;
}

// De eerste valuta van de wereld (de markt rekent standaard daarmee).
function firstCurrencyId(catalogs) {
  return Object.keys(catalogSection(catalogs, "currencies"))[0] || "currency.gold";
}

// Een stukje tekst van een speler: zonder regeleinden aan het eind, nooit langer dan max.
function playerText(value, max) {
  return String(value === null || value === undefined ? "" : value).replace(/\r\n?/g, "\n").trim().slice(0, max);
}

const TRADE_ACTION_TYPES = [
  "trade_invite", "trade:invite", "trade_accept", "trade:accept", "trade_offer", "trade:offer",
  "trade_confirm", "trade:confirm", "market_list", "market:create", "market_buy", "market:buy", "mail_send", "mail:send"
];

function operationIdFromPayload(payload) {
  return safeString(payload?.operationId || payload?.operation_id || "", "");
}

function connectedComponents(zonePackage) {
  const components = Array.isArray(zonePackage?.entityComponents) ? zonePackage.entityComponents.slice() : [];
  for (const entity of Array.isArray(zonePackage?.entities) ? zonePackage.entities : []) {
    if (!Array.isArray(entity?.components)) continue;
    const linkedEntityId = safeString(entity?.entityId || entity?.model?.entityId || entity?.model?.nodeId || entity?.nodeId || "", "");
    components.push.apply(components, entity.components.map(function (component) {
      if (!component || !linkedEntityId || component.linkedEntityId || component.entityRef) return component;
      return Object.assign({}, component, { linkedEntityId });
    }));
  }
  return components.filter(Boolean);
}

function canonicalZoneEntity(entity) {
  if (!entity) return null;
  if (entity.nodeType === "entity_assembly") {
    const model = entity.model || null;
    if (!model || model.nodeType !== "model_entity") return null;
    return Object.assign({}, model, {
      entityId: entity.entityId || model.entityId || model.nodeId || null,
      label: entity.label || model.label || entity.entityId || model.entityId || model.nodeId || null,
      assemblyNodeId: entity.nodeId || null,
      assemblyEntityId: entity.entityId || null
    });
  }
  if (entity.nodeType === "model_entity") return entity;
  if (entity.modelAssetId && (entity.transform || Number.isFinite(Number(entity.x)) || Number.isFinite(Number(entity.z)))) return entity;
  return null;
}

function zoneEntityIdValues(entity) {
  return [
    entity?.entityId,
    entity?.nodeId,
    entity?.id,
    entity?.assemblyEntityId,
    entity?.assemblyNodeId
  ].map(function (value) {
    return safeString(value, "");
  }).filter(Boolean);
}

function visibleEntities(zonePackage) {
  return (Array.isArray(zonePackage?.entities) ? zonePackage.entities : [])
    .map(canonicalZoneEntity)
    .filter(Boolean);
}

function linkedEntityForComponent(zonePackage, component) {
  const entityId = safeString(component?.linkedEntityId || component?.entityRef || "", "");
  const entities = visibleEntities(zonePackage);
  if (entityId) {
    const found = entities.find(function (entity) {
      return zoneEntityIdValues(entity).includes(entityId);
    });
    if (found) return found;
  }
  return null;
}

function positionedComponent(ctx, component) {
  const entity = linkedEntityForComponent(ctx.zonePackage, component);
  const entityPosition = entity?.transform?.position || {};
  const x = safeNumber(entityPosition.x ?? entity?.x ?? component?.x, safeNumber(ctx.position?.x, 0));
  const y = safeNumber(entityPosition.y ?? entity?.y ?? component?.y, 0);
  const z = safeNumber(entityPosition.z ?? entity?.z ?? component?.z, safeNumber(ctx.position?.z, 0));
  const distance = positionDistance(ctx.position, { x, z });
  const range = Math.max(1, safeNumber(component?.range || component?.distance || 5, 5));
  return Object.assign({}, component, {
    linkedEntity: entity ? {
      entityId: entity.entityId || entity.nodeId || null,
      label: entity.label || entity.entityId || entity.nodeId || null
    } : null,
    x,
    y,
    z,
    range,
    distance: distance === null ? null : round(distance),
    inRange: distance === null || distance <= range
  });
}

export class Node05EconomyRuntimeService {
  constructor(db, repository, mmoService, node03RuntimeService) {
    this.db = db;
    this.repository = repository;
    this.mmoService = mmoService;
    this.node03RuntimeService = node03RuntimeService;
  }

  getRequestContext(req) {
    return this.node03RuntimeService.getRequestContext(req);
  }

  ensureRuntime(ctx) {
    this.node03RuntimeService.ensurePlayerRuntime(ctx);
    this.node03RuntimeService.ensureZoneEntityState(ctx);
  }

  snapshotForRequest(req) {
    const ctx = this.getRequestContext(req);
    this.ensureRuntime(ctx);
    return this.buildSnapshot(ctx);
  }

  actionForRequest(req, payload = {}) {
    const ctx = this.getRequestContext(req);
    const action = safeString(payload.action, "").toLowerCase();
    const operationId = operationIdFromPayload(payload) || randomId("node05_operation");
    const hash = normalizedActionPayloadHash(action, payload);
    if (action === "reset_node05") assertDeveloperActionAllowed(ctx);
    // Fase 8 herstel: wie er ook bij hoort (de ander in een ruil, wie post krijgt, de verkoper op de markt) krijgt
    // na de transactie meteen een seintje. Zijn scherm hoeft dan niet op de volgende ronde (3,5 s) te wachten.
    let notify = [];
    const response = runOperation(this.db, {
      operationId,
      playerId: ctx.profile.id,
      operationType: action || "unknown",
      requestHash: hash,
      label: "Deze handelsactie",
      faultHook: this.operationFaultHook || null,
      perform: () => {
        this.ensureRuntime(ctx);
        const result = this.performAction(ctx, action, payload, operationId);
        notify = Array.isArray(result?.notify) ? result.notify : [];
        return result;
      },
      buildResponse: (result) => {
        const clean = Object.assign({}, result);
        delete clean.notify;
        return Object.assign({ ok: true, operationId }, clean, { snapshot: this.buildSnapshot(ctx) });
      }
    });
    this.pingPlayers(notify.filter((id) => id && id !== ctx.profile.id));
    return response;
  }

  // Seintje naar de game van een andere speler: haal je handelsstand nu op (na de COMMIT, anders zie je de oude stand).
  pingPlayers(playerIds) {
    const ids = Array.from(new Set((playerIds || []).filter(Boolean)));
    if (!ids.length || typeof this.mmoService?.sendToPlayer !== "function") return;
    const timer = setTimeout(() => {
      for (const id of ids) { try { this.mmoService.sendToPlayer(id, { type: "node05:refresh" }); } catch {} }
    }, 30);
    if (typeof timer?.unref === "function") timer.unref();
  }

  performAction(ctx, action, payload, operationId) {
    if (action === "craft" || action === "crafting:start") return this.startCraft(ctx, payload, operationId);
    if (action === "crafting:claim" || action === "claim_craft_job") return this.claimCraftingJob(ctx, payload, operationId);
    if (action === "vendor_buy" || action === "vendor:buy") return this.vendorBuy(ctx, payload, operationId);
    if (action === "vendor_sell" || action === "vendor:sell") return this.vendorSell(ctx, payload, operationId);
    // Fase 8: terugkopen wat je net verkocht.
    if (action === "vendor_buy_back" || action === "vendor:buy_back") return this.vendorBuyBack(ctx, payload, operationId);
    if (action === "party_create" || action === "party:create") return this.createParty(ctx, operationId);
    if (action === "party_leave" || action === "party:leave") return this.leaveParty(ctx, operationId);
    if (action === "party_invite" || action === "party:invite") return this.inviteToParty(ctx, payload, operationId);
    if (action === "party_accept" || action === "party:accept_invite") return this.acceptPartyInvite(ctx, payload, operationId);
    if (action === "party_decline" || action === "party:decline_invite") return this.declinePartyInvite(ctx, payload, operationId);
    if (action === "party_kick" || action === "party:kick") return this.kickFromParty(ctx, payload, operationId);
    if (action === "party_invite_rule" || action === "party:invite_rule") return this.setPartyInviteRule(ctx, payload, operationId);
    // Fase 8b: ruilen met een speler.
    if (action === "trade_invite" || action === "trade:invite") return this.inviteToTrade(ctx, payload, operationId);
    if (action === "trade_accept" || action === "trade:accept") return this.acceptTrade(ctx, payload, operationId);
    if (action === "trade_offer" || action === "trade:offer") return this.offerToTrade(ctx, payload, operationId);
    if (action === "trade_confirm" || action === "trade:confirm") return this.confirmTrade(ctx, payload, operationId);
    if (action === "trade_cancel" || action === "trade:cancel") return this.cancelTrade(ctx, payload, operationId);
    if (action === "market_list" || action === "market:create") return this.createMarketOrder(ctx, payload, operationId);
    if (action === "market_buy" || action === "market:buy") return this.buyMarketOrder(ctx, payload, operationId);
    if (action === "market_cancel" || action === "market:cancel") return this.cancelMarketOrder(ctx, payload, operationId);
    if (action === "mail_claim" || action === "mail:claim") return this.claimMail(ctx, payload, operationId);
    if (action === "mail_claim_all" || action === "mail:claim_all") return this.claimAllMail(ctx, operationId);
    // Fase 8 herstel: post sturen, lezen en weggooien.
    if (action === "mail_send" || action === "mail:send") return this.sendMail(ctx, payload, operationId);
    if (action === "mail_read" || action === "mail:read") return this.readMail(ctx, payload);
    if (action === "mail_delete" || action === "mail:delete") return this.deleteMail(ctx, payload);
    if (action === "reset_node05") return this.resetNode05(ctx, operationId);
    const error = new Error("Onbekende handelsactie: " + (action || "-"));
    error.status = 400;
    throw error;
  }

  buildSnapshot(ctx) {
    const node03 = this.node03RuntimeService.buildSnapshot(ctx);
    return {
      ok: true,
      schemaVersion: "node05-runtime-v1",
      worldId: ctx.worldId,
      zoneId: ctx.zoneId,
      playerId: ctx.profile.id,
      node03,
      ui: {
        modules: node05Modules(ctx.project)
      },
      services: this.buildServiceTargets(ctx),
      crafting: this.buildCraftingSnapshot(ctx),
      vendors: this.buildVendorSnapshot(ctx),
      party: this.buildPartySnapshot(ctx),
      trade: this.buildTradeSnapshot(ctx),
      market: this.buildMarketSnapshot(ctx),
      mail: this.buildMailSnapshot(ctx),
      generatedAt: now()
    };
  }

  buildServiceTargets(ctx) {
    const stations = this.craftingStations(ctx).map(function (station) {
      return {
        kind: "crafting",
        id: station.stationId,
        label: station.linkedEntity?.label || station.stationId,
        prompt: station.interactionPrompt || "Craft",
        x: station.x,
        y: station.y,
        z: station.z,
        distance: station.distance,
        range: station.range,
        inRange: station.inRange
      };
    });
    const vendors = this.vendors(ctx).map(function (vendor) {
      return {
        kind: "vendor",
        id: vendor.vendorId,
        label: vendor.linkedEntity?.label || vendor.vendorId,
        prompt: vendor.interactionPrompt || "Trade",
        x: vendor.x,
        y: vendor.y,
        z: vendor.z,
        distance: vendor.distance,
        range: vendor.range,
        inRange: vendor.inRange
      };
    });
    const markets = this.marketAccesses(ctx).map(function (market) {
      return {
        kind: "market",
        id: market.marketAccessId,
        label: market.linkedEntity?.label || market.marketAccessId,
        prompt: market.interactionPrompt || "Market",
        x: market.x,
        y: market.y,
        z: market.z,
        distance: market.distance,
        range: market.range,
        inRange: market.inRange
      };
    });
    return stations.concat(vendors, markets).sort(function (left, right) {
      return safeNumber(left.distance, 999999) - safeNumber(right.distance, 999999);
    });
  }

  // Quest Builder stap 9: een winkel of werkplek bij een NPC die er voor deze speler (door een vlag) niet is, telt niet.
  flagVisible(ctx, component) {
    const flags = this.mmoService?.worldFlags;
    const gates = ctx.project?.campaigns?.flags?.gates;
    if (!flags || !Array.isArray(gates) || !gates.length) return true;
    const entityId = safeString(component?.linkedEntityId || component?.entityRef || "", "");
    const gate = gates.find((entry) => entry?.entityId === entityId);
    return !gate || flags.passes(ctx.profile.id, gate);
  }

  craftingStations(ctx) {
    return connectedComponents(ctx.zonePackage).filter(function (component) {
      return component.nodeType === "crafting_station_component";
    }).filter((component) => this.flagVisible(ctx, component)).map(function (component) {
      return positionedComponent(ctx, component);
    });
  }

  vendors(ctx) {
    return connectedComponents(ctx.zonePackage).filter(function (component) {
      return component.nodeType === "vendor_component";
    }).filter((component) => this.flagVisible(ctx, component)).map(function (component) {
      return positionedComponent(ctx, component);
    });
  }

  marketAccesses(ctx) {
    return connectedComponents(ctx.zonePackage).filter(function (component) {
      return component.nodeType === "marketplace_access_component";
    }).filter((component) => this.flagVisible(ctx, component)).map(function (component) {
      return positionedComponent(ctx, component);
    });
  }

  recipes(ctx) {
    return Object.values(catalogSection(ctx.catalogs, "recipes")).filter(function (recipe) {
      return recipe && recipe.enabled !== false;
    });
  }

  vendorCatalogs(ctx) {
    return catalogSection(ctx.catalogs, "vendorCatalogs");
  }

  buildCraftingSnapshot(ctx) {
    const stations = this.craftingStations(ctx);
    const jobs = this.loadCraftingJobs(ctx.profile.id);
    const stationSnapshots = stations.map((station) => {
      const recipes = this.recipesForStation(ctx, station).map((recipe) => this.recipeSummary(ctx, recipe, station));
      return Object.assign({}, station, { recipes });
    });
    return {
      policy: firstPolicy(ctx.project, "crafting_policy", null),
      stations: stationSnapshots,
      jobs
    };
  }

  recipesForStation(ctx, station) {
    const refs = Array.isArray(station.recipeRefs) ? station.recipeRefs : [];
    return this.recipes(ctx).filter(function (recipe) {
      if (refs.length && refs.includes(recipe.id)) return true;
      if (refs.length) return false;
      return !station.stationType || recipe.stationType === station.stationType;
    });
  }

  recipeSummary(ctx, recipe, station = null) {
    const ingredients = (Array.isArray(recipe.ingredients) ? recipe.ingredients : []).map((ingredient) => {
      const owned = ingredient.kind === "currency"
        ? this.currencyAmount(ctx.profile.id, ingredient.currencyRef)
        : this.itemCount(ctx.profile.id, ingredient.itemRef);
      const required = normalizeQuantity(ingredient.amount, 1);
      return Object.assign({}, ingredient, {
        displayName: ingredient.kind === "currency" ? displayForCurrency(ctx.catalogs, ingredient.currencyRef) : displayForItem(ctx.catalogs, ingredient.itemRef),
        owned,
        required,
        enough: owned >= required
      });
    });
    const outputItems = Array.isArray(recipe.outputItems) ? recipe.outputItems : [];
    const outputCurrencies = Array.isArray(recipe.outputCurrencies) ? recipe.outputCurrencies : [];
    const outputs = outputItems.map(function (entry) {
      return { kind: "item", itemId: entry.itemRef, displayName: displayForItem(ctx.catalogs, entry.itemRef), amount: normalizeQuantity(entry.amount, 1) };
    }).concat(outputCurrencies.map(function (entry) {
      return { kind: "currency", currencyId: entry.currencyRef, displayName: displayForCurrency(ctx.catalogs, entry.currencyRef), amountMinor: safeInteger(entry.amountMinor, 0) };
    }));
    // Fase 8: wat het maken in geld kost (bovenop de grondstoffen), zodat de speler het ziet staan.
    const cost = this.craftCost(ctx, { outputs });
    const money = cost ? Object.assign({}, cost, { owned: this.currencyAmount(ctx.profile.id, cost.currencyId) }) : null;
    return {
      recipeId: recipe.id,
      displayName: recipe.displayName || recipe.id,
      description: recipe.description || "",
      category: recipe.category || "",
      stationId: station?.stationId || null,
      stationType: recipe.stationType || null,
      craftDurationMs: safeInteger(recipe.craftDurationMs, 0),
      unlocked: this.recipeUnlocked(ctx, recipe),
      canCraft: ingredients.every(function (entry) { return entry.enough; }) && (!money || money.owned >= money.amount)
        && this.recipeUnlocked(ctx, recipe) && (!station || station.inRange === true),
      ingredients,
      moneyCost: money,
      outputs
    };
  }

  recipeUnlocked(ctx, recipe) {
    if (recipe.unlockMode !== "player_unlock_required") return true;
    const row = this.db.prepare("SELECT player_id FROM player_recipe_unlocks WHERE player_id = ? AND recipe_id = ? LIMIT 1")
      .get(ctx.profile.id, recipe.id);
    return Boolean(row);
  }

  loadCraftingJobs(playerId) {
    return this.db.prepare(`
      SELECT * FROM player_crafting_jobs
      WHERE player_id = ?
      ORDER BY started_at DESC
      LIMIT 10
    `).all(playerId).map(function (row) {
      return {
        jobId: row.id,
        recipeId: row.recipe_id,
        stationEntityId: row.station_entity_id,
        zoneId: row.zone_id,
        batchCount: safeInteger(row.batch_count, 1),
        state: row.state,
        startedAt: row.started_at,
        completesAt: row.completes_at,
        completedAt: row.completed_at,
        canClaim: row.state === "running" && row.completes_at && Date.parse(row.completes_at) <= Date.now(),
        revision: safeInteger(row.revision, 1)
      };
    });
  }

  buildVendorSnapshot(ctx) {
    const catalogs = this.vendorCatalogs(ctx);
    const vendors = this.vendors(ctx).map((vendor) => {
      const catalog = catalogs[vendor.vendorCatalogRef] || {};
      const offers = (Array.isArray(catalog.offers) ? catalog.offers : []).map((offer) => this.vendorOfferSummary(ctx, vendor, offer));
      return Object.assign({}, vendor, {
        displayName: vendor.linkedEntity?.label || catalog.displayName || vendor.vendorId,
        catalogId: catalog.id || vendor.vendorCatalogRef || null,
        currencyRef: vendorCurrency(ctx.catalogs, catalog, null),
        offers,
        // Fase 8: wat jij hier verkocht en voor dezelfde prijs kunt terugkopen.
        buyBack: this.buyBackRows(ctx, vendor),
        // Fase 8 herstel: wat deze winkel jou betaalt voor wat er in je tas zit (alleen als je bij de winkel staat).
        sells: vendor.inRange === true ? this.bagSellList(ctx, vendor) : []
      });
    });
    return {
      policy: firstPolicy(ctx.project, "vendor_policy", null),
      economy: economyRules(ctx.project),
      vendors
    };
  }

  vendorOfferSummary(ctx, vendor, offer) {
    const item = catalogSection(ctx.catalogs, "items")[offer.itemRef] || {};
    const sellCurrencyId = offer.sellCurrencyRef || item.vendorCurrencyRef || "currency.gold";
    const buyCurrencyId = offer.buyCurrencyRef || item.vendorCurrencyRef || sellCurrencyId;
    const owned = this.itemCount(ctx.profile.id, offer.itemRef);
    const funds = this.currencyAmount(ctx.profile.id, sellCurrencyId);
    // Fase 8: zonder eigen prijs rekent de winkel met de Verkoopwaarde van het item en de opslag uit Instellingen > 💰 Geld.
    const rules = economyRules(ctx.project);
    const value = safeInteger(item.vendorBaseValueMinor, 0);
    const ownSell = Math.max(0, safeInteger(offer.sellPriceMinor, 0));
    const ownBuy = Math.max(0, safeInteger(offer.buyPriceMinor, 0));
    const sellPrice = shopSellPrice(value, ownSell, rules.shopMarkupPct);
    const buyPrice = shopBuyPrice(value, ownBuy, rules.shopBuyPct);
    const stock = this.offerStock(vendor, offer);
    return Object.assign({}, offer, {
      displayName: displayForItem(ctx.catalogs, offer.itemRef),
      sellCurrencyRef: sellCurrencyId,
      buyCurrencyRef: buyCurrencyId,
      sellPriceMinor: sellPrice,
      buyPriceMinor: buyPrice,
      // De game zet er "automatisch" bij als de prijs uit de waarde + opslag komt.
      sellPriceAuto: ownSell <= 0,
      buyPriceAuto: ownBuy <= 0,
      owned,
      stock,
      canBuy: vendor.inRange === true && ["sell_to_player", "both"].includes(offer.mode) && sellPrice > 0 && funds >= sellPrice && (stock === null || stock > 0),
      canSell: vendor.inRange === true && buyPrice > 0 && owned > 0 && itemIsTradable(item)
    });
  }

  offerStock(vendor, offer) {
    const mode = normalizeMode(offer.stockMode, ["inherit", "infinite", "limited"], "infinite");
    if (mode !== "limited") return null;
    const scopeKey = "vendor:" + vendor.vendorId;
    const row = this.db.prepare("SELECT quantity FROM vendor_stock_state WHERE vendor_id = ? AND offer_id = ? AND scope_key = ? LIMIT 1")
      .get(vendor.vendorId, offer.offerId, scopeKey);
    if (row) return safeInteger(row.quantity, 0);
    return safeInteger(offer.initialStock, 0);
  }

  buildPartySnapshot(ctx) {
    const party = this.activePartyForPlayer(ctx.profile.id);
    const invites = this.db.prepare(`
      SELECT i.*, p.display_name AS inviter_name
      FROM party_invites i
      LEFT JOIN player_profiles p ON p.id = i.inviter_player_id
      WHERE i.invitee_player_id = ? AND i.status = 'pending' AND i.expires_at > ?
      ORDER BY i.created_at DESC
      LIMIT 5
    `).all(ctx.profile.id, now()).map(function (row) {
      return {
        inviteId: row.id,
        partyId: row.party_id,
        inviterPlayerId: row.inviter_player_id,
        inviterName: row.inviter_name || row.inviter_player_id,
        expiresAt: row.expires_at
      };
    });
    const presence = typeof this.mmoService.getWorldPresenceSnapshot === "function"
      ? this.mmoService.getWorldPresenceSnapshot(ctx.worldId, ctx.profile.id)
      : { players: [] };
    return {
      policy: firstPolicy(ctx.project, "party_rules", null),
      party,
      invites,
      onlinePlayers: (Array.isArray(presence.players) ? presence.players : []).slice(0, 8)
    };
  }

  activePartyForPlayer(playerId) {
    const membership = this.db.prepare(`
      SELECT pm.*, p.leader_player_id, p.loot_policy_id, p.invite_rule, p.revision, p.created_at, p.updated_at
      FROM party_members pm
      JOIN parties p ON p.id = pm.party_id
      WHERE pm.player_id = ? AND pm.left_at IS NULL AND p.disbanded_at IS NULL
      LIMIT 1
    `).get(playerId);
    if (!membership) return null;
    const members = this.db.prepare(`
      SELECT pm.player_id, pm.role, pm.joined_at, pp.display_name, pp.current_zone_id
      FROM party_members pm
      JOIN player_profiles pp ON pp.id = pm.player_id
      WHERE pm.party_id = ? AND pm.left_at IS NULL
      ORDER BY pm.role ASC, pm.joined_at ASC
    `).all(membership.party_id).map((row) => ({
      playerId: row.player_id,
      displayName: row.display_name || row.player_id,
      role: row.role,
      zoneId: row.current_zone_id || null,
      online: this.mmoService.countConnectedPlayerSessions ? this.mmoService.countConnectedPlayerSessions(row.player_id) > 0 : false,
      joinedAt: row.joined_at
    }));
    return {
      partyId: membership.party_id,
      leaderPlayerId: membership.leader_player_id,
      lootPolicyId: membership.loot_policy_id,
      inviteRule: membership.invite_rule || null,
      role: membership.role,
      revision: safeInteger(membership.revision, 1),
      members
    };
  }

  // Fase 8b: wat de speler van een ruil ziet, inclusief de bevestiging die precies zegt wat je geeft en krijgt.
  buildTradeSnapshot(ctx) {
    const rules = this.tradeRules(ctx);
    const text = function (lines) { return lines.length ? lines.map(function (line) { return line.text; }).join(", ") : "niets"; };
    const sessions = this.db.prepare(`
      SELECT *
      FROM direct_trade_sessions
      WHERE (player_a_id = ? OR player_b_id = ?)
        AND state IN ('invited', 'open')
      ORDER BY updated_at DESC
      LIMIT 3
    `).all(ctx.profile.id, ctx.profile.id).map((row) => {
      const mineIsA = row.player_a_id === ctx.profile.id;
      const partnerId = mineIsA ? row.player_b_id : row.player_a_id;
      const give = this.tradeOffers(row.id, ctx.profile.id).map((entry) => this.tradeLine(ctx, entry));
      const get = this.tradeOffers(row.id, partnerId).map((entry) => this.tradeLine(ctx, entry));
      return {
        tradeId: row.id,
        state: row.state,
        revision: safeInteger(row.revision, 1),
        expiresAt: row.expires_at,
        invitedByMe: mineIsA && row.state === "invited",
        waitingForMe: !mineIsA && row.state === "invited",
        partnerId,
        partnerName: this.playerName(partnerId),
        give,
        get,
        iConfirmed: Boolean(safeInteger(mineIsA ? row.player_a_confirmed : row.player_b_confirmed, 0)),
        theyConfirmed: Boolean(safeInteger(mineIsA ? row.player_b_confirmed : row.player_a_confirmed, 0)),
        // Dit is de bevestiging: precies dit geef je weg en precies dit krijg je terug.
        confirmText: "Je geeft " + text(give) + " en je krijgt " + text(get) + "."
      };
    });
    return {
      rules,
      sessions,
      slots: Math.max(1, safeInteger(rules.tradeSlots, 8)),
      message: ""
    };
  }

  buildMarketSnapshot(ctx) {
    // Fase 8b: de marktregels komen uit Instellingen > 🤝 Handel en de belasting uit 💰 Geld.
    const rules = this.tradeRules(ctx);
    this.expireMarketOrders(ctx);
    return {
      rules,
      taxPct: Math.max(0, safeInteger(economyRules(ctx.project).marketTaxPct, 0)),
      currencyId: firstCurrencyId(ctx.catalogs),
      accesses: this.marketAccesses(ctx),
      orders: this.loadMarketOrders(ctx, false),
      myOrders: this.loadMarketOrders(ctx, true),
      sellableItems: this.sellableMarketItems(ctx)
    };
  }

  loadMarketOrders(ctx, mineOnly) {
    const stamp = now();
    const rows = mineOnly
      ? this.db.prepare(`
        SELECT o.*, pp.display_name AS seller_name
        FROM market_orders o
        LEFT JOIN player_profiles pp ON pp.id = o.seller_player_id
        WHERE o.seller_player_id = ? AND o.status IN ('active', 'partially_filled') AND o.expires_at > ?
        ORDER BY o.created_at DESC
        LIMIT 60
      `).all(ctx.profile.id, stamp)
      : this.db.prepare(`
        SELECT o.*, pp.display_name AS seller_name
        FROM market_orders o
        LEFT JOIN player_profiles pp ON pp.id = o.seller_player_id
        WHERE o.status IN ('active', 'partially_filled') AND o.expires_at > ? AND o.seller_player_id <> ?
        ORDER BY o.created_at DESC
        LIMIT 60
      `).all(stamp, ctx.profile.id);
    return rows.map((row) => ({
      orderId: row.id,
      sellerPlayerId: row.seller_player_id,
      sellerName: row.seller_name || "Speler",
      itemKind: row.item_kind,
      itemId: row.item_id,
      displayName: displayForItem(ctx.catalogs, row.item_id),
      quantityRemaining: safeInteger(row.quantity_remaining, 0),
      quantityTotal: safeInteger(row.quantity_total, 0),
      currencyId: row.currency_id,
      currencyName: displayForCurrency(ctx.catalogs, row.currency_id),
      unitPriceMinor: safeInteger(row.unit_price_minor, 0),
      status: row.status,
      mine: row.seller_player_id === ctx.profile.id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revision: safeInteger(row.revision, 1)
    }));
  }

  // Wat je uit je tas op de markt kunt zetten (alles wat je mag ruilen), met een voorstel voor de prijs:
  // dezelfde prijs als in een winkel (Verkoopwaarde × winkelprijs uit 💰 Geld).
  sellableMarketItems(ctx) {
    const items = catalogSection(ctx.catalogs, "items");
    const markup = economyRules(ctx.project).shopMarkupPct;
    return this.bagItems(ctx.profile.id).map((entry) => {
      const item = items[entry.itemId] || null;
      return {
        itemId: entry.itemId,
        displayName: displayForItem(ctx.catalogs, entry.itemId),
        quantity: entry.quantity,
        marketEligible: itemMarketOk(item),
        suggestedPriceMinor: Math.max(1, shopSellPrice(safeInteger(item?.vendorBaseValueMinor, 0), 0, markup))
      };
    }).filter(function (entry) {
      return entry.marketEligible;
    });
  }

  // Fase 8 herstel: de postbus hoort bij je account (al je characters zien dezelfde post).
  buildMailSnapshot(ctx) {
    const rules = this.tradeRules(ctx);
    const owners = this.mailOwnerIds(ctx);
    const marks = owners.map(() => "?").join(", ");
    const stamp = now();
    const visible = `player_id IN (${marks}) AND state IN ('unread', 'read', 'partially_claimed') AND (expires_at IS NULL OR expires_at > ?)`;
    const counts = this.db.prepare(`
      SELECT COUNT(*) AS total, SUM(CASE WHEN state = 'unread' THEN 1 ELSE 0 END) AS unread FROM player_mail WHERE ${visible}
    `).get(...owners, stamp);
    const messages = this.db.prepare(`SELECT * FROM player_mail WHERE ${visible} ORDER BY created_at DESC LIMIT 40`).all(...owners, stamp).map((row) => {
      const attachments = this.db.prepare(`
        SELECT *
        FROM player_mail_attachments
        WHERE mail_id = ?
        ORDER BY id ASC
      `).all(row.id).map((attachment) => ({
        attachmentId: attachment.id,
        kind: attachment.asset_kind,
        assetId: attachment.asset_id,
        itemId: attachment.asset_kind === "currency" ? null : attachment.asset_id,
        currencyId: attachment.asset_kind === "currency" ? attachment.asset_id : null,
        displayName: attachment.asset_kind === "currency" ? displayForCurrency(ctx.catalogs, attachment.asset_id) : displayForItem(ctx.catalogs, attachment.asset_id),
        quantityMinor: safeInteger(attachment.quantity_minor, 0),
        state: attachment.state
      }));
      const source = String(row.source_ref || "");
      const fromId = source.startsWith("player:") ? source.slice("player:".length) : null;
      return {
        mailId: row.id,
        mailType: row.mail_type,
        subject: row.subject,
        body: row.body,
        state: row.state,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        // Van wie: een speler, of de markt / het spel zelf.
        fromName: fromId ? this.playerName(fromId) : (String(row.mail_type || "").startsWith("market") ? "Markt" : "Spel"),
        fromPlayerId: fromId,
        attachments,
        canClaim: attachments.some(function (attachment) { return attachment.state === "available"; })
      };
    });
    return {
      rules,
      unreadCount: safeInteger(counts?.unread, 0),
      total: safeInteger(counts?.total, 0),
      max: Math.max(1, safeInteger(rules.mailMax, 100)),
      messages
    };
  }

  assertInRange(target, label) {
    if (!target || target.inRange !== false) return;
    const error = new Error(label + " is te ver weg.");
    error.status = 400;
    error.details = { distance: target.distance, range: target.range };
    throw error;
  }

  findStation(ctx, stationId) {
    const id = safeString(stationId, "");
    const stations = this.craftingStations(ctx);
    return stations.find(function (station) { return station.stationId === id; }) || stations[0] || null;
  }

  findVendor(ctx, vendorId) {
    const id = safeString(vendorId, "");
    const vendors = this.vendors(ctx);
    return vendors.find(function (vendor) { return vendor.vendorId === id; }) || vendors[0] || null;
  }

  findMarketAccess(ctx, marketId = "") {
    const accesses = this.marketAccesses(ctx);
    const id = safeString(marketId, "");
    return (id && accesses.find(function (access) { return access.marketAccessId === id; }))
      || accesses.find(function (access) { return access.remoteAccessAllowed === true || access.inRange === true; })
      || accesses[0] || null;
  }

  findRecipe(ctx, recipeId) {
    const id = safeString(recipeId, "");
    return this.recipes(ctx).find(function (recipe) { return recipe.id === id; }) || null;
  }

  startCraft(ctx, payload, operationId) {
    const recipe = this.findRecipe(ctx, payload.recipeId || payload.recipe_id);
    if (!recipe) {
      const error = new Error("Recipe niet gevonden.");
      error.status = 404;
      throw error;
    }
    const station = this.findStation(ctx, payload.stationId || payload.station_id);
    if (!station) {
      const error = new Error("Crafting station niet gevonden in deze zone.");
      error.status = 404;
      throw error;
    }
    this.assertInRange(station, "Crafting station");
    if (!this.recipesForStation(ctx, station).some(function (candidate) { return candidate.id === recipe.id; })) {
      const error = new Error("Recipe hoort niet bij dit station.");
      error.status = 400;
      throw error;
    }
    const summary = this.recipeSummary(ctx, recipe, station);
    if (!summary.unlocked) {
      const error = new Error("Recipe is nog niet unlocked.");
      error.status = 403;
      throw error;
    }
    for (const ingredient of summary.ingredients) {
      if (!ingredient.enough) {
        const error = new Error("Niet genoeg " + ingredient.displayName + ".");
        error.status = 400;
        throw error;
      }
    }
    for (const ingredient of summary.ingredients) {
      if (ingredient.consume === false) continue;
      if (ingredient.kind === "currency") this.spendCurrency(ctx, ingredient.currencyRef, ingredient.required, "crafting_input", recipe.id, operationId);
      else this.removeItem(ctx, ingredient.itemRef, ingredient.required, "crafting_input", recipe.id, operationId);
    }
    // Fase 8 (keuze van Kevin): craften kost ook geld, een deel van de waarde van wat je maakt.
    const cost = this.craftCost(ctx, summary);
    if (cost) this.spendCurrency(ctx, cost.currencyId, cost.amount, "crafting_cost", recipe.id, operationId);
    const durationMs = safeInteger(recipe.craftDurationMs, 0);
    const jobId = randomId("craft_job");
    const stamp = now();
    if (durationMs > 0) {
      this.db.prepare(`
        INSERT INTO player_crafting_jobs (id, operation_id, player_id, recipe_id, station_entity_id, zone_id, batch_count, state, input_snapshot_json, output_plan_json, started_at, completes_at, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, 1, 'running', ?, ?, ?, ?, '{}')
      `).run(jobId, operationId, ctx.profile.id, recipe.id, station.stationId, ctx.zoneId, stableJson(summary.ingredients), stableJson(summary.outputs), stamp, new Date(Date.now() + durationMs).toISOString());
      return { action: "craft", jobId, message: "Craft gestart: " + summary.displayName + ".", events: [{ type: "craft_started", recipeId: recipe.id }] };
    }
    const grants = this.applyRecipeOutputs(ctx, recipe, operationId);
    this.db.prepare(`
      INSERT INTO player_crafting_jobs (id, operation_id, player_id, recipe_id, station_entity_id, zone_id, batch_count, state, input_snapshot_json, output_plan_json, started_at, completes_at, completed_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'completed', ?, ?, ?, ?, ?, '{}')
    `).run(jobId, operationId, ctx.profile.id, recipe.id, station.stationId, ctx.zoneId, stableJson(summary.ingredients), stableJson(summary.outputs), stamp, stamp, stamp);
    this.node03RuntimeService.recordGameplayEvent(ctx, "item_crafted", "player", recipe.id, { grants });
    return { action: "craft", jobId, grants, message: summary.displayName + " crafted.", events: [{ type: "craft_completed", recipeId: recipe.id }] };
  }

  // Wat het maken in geld kost: een deel van de Verkoopwaarde van wat eruit komt (0 % = gratis).
  craftCost(ctx, summary) {
    const pct = Math.max(0, safeInteger(economyRules(ctx.project).craftCostPct, 0));
    if (pct <= 0) return null;
    const items = catalogSection(ctx.catalogs, "items");
    let value = 0;
    let currencyId = "";
    for (const output of Array.isArray(summary.outputs) ? summary.outputs : []) {
      if (output.kind !== "item") continue;
      const item = items[output.itemId] || {};
      value += Math.max(0, safeInteger(item.vendorBaseValueMinor, 0)) * normalizeQuantity(output.amount, 1);
      if (!currencyId && item.vendorCurrencyRef) currencyId = String(item.vendorCurrencyRef);
    }
    if (!currencyId) currencyId = Object.keys(catalogSection(ctx.catalogs, "currencies"))[0] || "";
    const amount = Math.round(value * pct / 100);
    if (!currencyId || amount <= 0) return null;
    return { currencyId, amount, displayName: displayForCurrency(ctx.catalogs, currencyId) };
  }

  claimCraftingJob(ctx, payload, operationId) {
    const jobId = safeString(payload.jobId || payload.job_id, "");
    const row = this.db.prepare("SELECT * FROM player_crafting_jobs WHERE id = ? AND player_id = ? LIMIT 1").get(jobId, ctx.profile.id);
    if (!row || row.state !== "running") {
      const error = new Error("Crafting job niet claimbaar.");
      error.status = 404;
      throw error;
    }
    if (!row.completes_at || Date.parse(row.completes_at) > Date.now()) {
      const error = new Error("Crafting job is nog niet klaar.");
      error.status = 409;
      throw error;
    }
    const recipe = this.findRecipe(ctx, row.recipe_id);
    if (!recipe) {
      const error = new Error("Recipe voor job niet gevonden.");
      error.status = 404;
      throw error;
    }
    const grants = this.applyRecipeOutputs(ctx, recipe, operationId);
    this.db.prepare(`
      UPDATE player_crafting_jobs
      SET state = 'completed', completed_at = ?, revision = revision + 1
      WHERE id = ?
    `).run(now(), row.id);
    return { action: "crafting:claim", jobId: row.id, grants, message: "Crafting output claimed." };
  }

  applyRecipeOutputs(ctx, recipe, operationId) {
    const grants = [];
    for (const entry of Array.isArray(recipe.outputItems) ? recipe.outputItems : []) {
      grants.push.apply(grants, this.node03RuntimeService.grantItem(ctx, entry.itemRef, normalizeQuantity(entry.amount, 1), "crafting_output", recipe.id, operationId));
    }
    for (const entry of Array.isArray(recipe.outputCurrencies) ? recipe.outputCurrencies : []) {
      const grant = this.node03RuntimeService.grantCurrency(ctx, entry.currencyRef, safeInteger(entry.amountMinor, 0), "crafting_output", recipe.id, operationId);
      if (grant) grants.push(grant);
    }
    return grants;
  }

  vendorBuy(ctx, payload, operationId) {
    const vendor = this.findVendor(ctx, payload.vendorId || payload.vendor_id);
    if (!vendor) {
      const error = new Error("Vendor niet gevonden in deze zone.");
      error.status = 404;
      throw error;
    }
    this.assertInRange(vendor, "Vendor");
    const catalog = this.vendorCatalogs(ctx)[vendor.vendorCatalogRef] || {};
    const offer = (Array.isArray(catalog.offers) ? catalog.offers : []).find(function (entry) {
      return entry.offerId === safeString(payload.offerId || payload.offer_id, "");
    }) || null;
    if (!offer || !["sell_to_player", "both"].includes(offer.mode)) {
      const error = new Error("Vendor offer kan niet gekocht worden.");
      error.status = 404;
      throw error;
    }
    const quantity = normalizeQuantity(payload.quantity, 1);
    // Quest Builder stap 4: een uniek item koop je niet als je het al hebt (en nooit meer dan 1).
    const bought = catalogSection(ctx.catalogs, "items")[offer.itemRef] || null;
    if (bought?.unique === true && (quantity > 1 || this.node03RuntimeService.ownedItemCount(ctx.profile.id, offer.itemRef) >= 1)) {
      const error = new Error("Je kunt maar 1 " + displayForItem(ctx.catalogs, offer.itemRef) + " hebben.");
      error.status = 409;
      throw error;
    }
    const summary = this.vendorOfferSummary(ctx, vendor, offer);
    const total = summary.sellPriceMinor * quantity;
    this.spendCurrency(ctx, summary.sellCurrencyRef, total, "vendor_buy", offer.offerId, operationId);
    this.decrementVendorStock(vendor, offer, quantity);
    const grants = this.node03RuntimeService.grantItem(ctx, offer.itemRef, quantity, "vendor_buy", vendor.vendorId, operationId);
    this.node03RuntimeService.recordGameplayEvent(ctx, "vendor_buy", "player", vendor.vendorId, { offerId: offer.offerId, quantity, total });
    return { action: "vendor_buy", grants, message: "Gekocht: " + displayForItem(ctx.catalogs, offer.itemRef) + "." };
  }

  // Fase 8 herstel: wat een winkel jou per stuk betaalt. Staat het item in zijn lijst met een eigen terugkoopprijs,
  // dan die; anders de Verkoopwaarde × "Winkel koopt terug voor" uit Instellingen > 💰 Geld. 0 = koopt het niet.
  shopPaysFor(ctx, vendor, itemId) {
    const item = catalogSection(ctx.catalogs, "items")[itemId] || null;
    const catalog = this.vendorCatalogs(ctx)[vendor.vendorCatalogRef] || {};
    const offer = (Array.isArray(catalog.offers) ? catalog.offers : []).find((entry) => entry.itemRef === itemId) || null;
    const currencyId = offer?.buyCurrencyRef || vendorCurrency(ctx.catalogs, catalog, item);
    const name = displayForItem(ctx.catalogs, itemId);
    if (!item) return { itemId, priceMinor: 0, currencyId, own: false, why: "Dit item bestaat niet meer." };
    if (!itemIsTradable(item)) {
      const quest = item.questItem === true || item.category === "quest" || item.bindPolicy === "quest_bound";
      return { itemId, priceMinor: 0, currencyId, own: false, why: quest ? "Een questitem kun je niet verkopen." : name + " kun je niet verkopen." };
    }
    const own = offer ? Math.max(0, safeInteger(offer.buyPriceMinor, 0)) : 0;
    const priceMinor = shopBuyPrice(safeInteger(item.vendorBaseValueMinor, 0), own, economyRules(ctx.project).shopBuyPct);
    return { itemId, priceMinor, currencyId, own: own > 0, why: priceMinor > 0 ? "" : "Deze winkel koopt " + name + " niet (het heeft geen Verkoopwaarde)." };
  }

  bagSellList(ctx, vendor) {
    return this.bagItems(ctx.profile.id).map((entry) => {
      const pays = this.shopPaysFor(ctx, vendor, entry.itemId);
      return { itemId: entry.itemId, owned: entry.quantity, priceMinor: pays.priceMinor, currencyRef: pays.currencyId, ownPrice: pays.own,
        canSell: pays.priceMinor > 0 && entry.quantity > 0, why: pays.why };
    });
  }

  vendorSell(ctx, payload, operationId) {
    const vendor = this.findVendor(ctx, payload.vendorId || payload.vendor_id);
    if (!vendor) throw httpError(404, "Vendor niet gevonden in deze zone.");
    this.assertInRange(vendor, "Vendor");
    // Je verkoopt wat er in je tas zit (itemId). Een oude knop stuurt nog een offerId: dan het item van die waar.
    let itemId = safeString(payload.itemId || payload.item_id, "");
    if (!itemId) {
      const catalog = this.vendorCatalogs(ctx)[vendor.vendorCatalogRef] || {};
      const offerId = safeString(payload.offerId || payload.offer_id, "");
      itemId = (Array.isArray(catalog.offers) ? catalog.offers : []).find((entry) => entry.offerId === offerId)?.itemRef || "";
    }
    if (!itemId) throw httpError(400, "Kies iets uit je tas om te verkopen.");
    const pays = this.shopPaysFor(ctx, vendor, itemId);
    if (pays.priceMinor <= 0) throw httpError(409, pays.why);
    const name = displayForItem(ctx.catalogs, itemId);
    // Vraag je er meer dan je hebt (de tas veranderde net), dan verkoop je wat er nog is.
    const quantity = Math.min(normalizeQuantity(payload.quantity, 1), this.bagCount(ctx.profile.id, itemId));
    if (quantity <= 0) throw httpError(400, "Je hebt geen " + name + " in je tas.");
    const total = pays.priceMinor * quantity;
    this.removeItem(ctx, itemId, quantity, "vendor_sell", vendor.vendorId, operationId);
    const grant = this.node03RuntimeService.grantCurrency(ctx, pays.currencyId, total, "vendor_sell", vendor.vendorId, operationId);
    // Fase 8: het blijft bij de winkel liggen, zodat je het voor dezelfde prijs kunt terugkopen.
    this.rememberBuyBack(ctx, vendor, itemId, quantity, pays.currencyId, pays.priceMinor);
    this.node03RuntimeService.recordGameplayEvent(ctx, "vendor_sell", "player", vendor.vendorId, { itemId, quantity, total });
    return { action: "vendor_sell", grants: [grant].filter(Boolean),
      message: "Verkocht: " + (quantity > 1 ? quantity + "× " : "") + name + " voor " + total + " " + displayForCurrency(ctx.catalogs, pays.currencyId) + "." };
  }

  // ---- Fase 8: terugkopen bij de winkel ----

  // De tabel vendor_buyback bestaat al sinds migratie 008; Fase 8 vult hem nu echt.
  rememberBuyBack(ctx, vendor, itemId, quantity, currencyId, priceMinor) {
    const slots = Math.max(0, safeInteger(economyRules(ctx.project).buyBackSlots, 0));
    if (slots <= 0 || priceMinor <= 0) return;
    this.db.prepare(`
      INSERT INTO vendor_buyback (id, player_id, vendor_id, item_kind, item_id, item_payload_json, quantity, price_currency_id, price_amount_minor, created_at, expires_at)
      VALUES (?, ?, ?, 'stack', ?, '{}', ?, ?, ?, ?, ?)
    `).run(randomId("buyback"), ctx.profile.id, vendor.vendorId, itemId, normalizeQuantity(quantity, 1), currencyId, priceMinor, now(), addDays(1));
    // Alleen de laatste zoveel regels blijven liggen; de rest geldt meteen als opgehaald.
    this.db.prepare(`
      UPDATE vendor_buyback SET claimed_at = ? WHERE id IN (
        SELECT id FROM vendor_buyback WHERE player_id = ? AND vendor_id = ? AND claimed_at IS NULL
        ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?
      )
    `).run(now(), ctx.profile.id, vendor.vendorId, slots);
  }

  buyBackRows(ctx, vendor) {
    const slots = Math.max(0, safeInteger(economyRules(ctx.project).buyBackSlots, 0));
    if (slots <= 0) return [];
    const rows = this.db.prepare(`
      SELECT * FROM vendor_buyback
      WHERE player_id = ? AND vendor_id = ? AND claimed_at IS NULL AND expires_at > ?
      ORDER BY created_at DESC, id DESC LIMIT ?
    `).all(ctx.profile.id, vendor.vendorId, now(), slots);
    return rows.map((row) => {
      const total = safeInteger(row.price_amount_minor, 0) * normalizeQuantity(row.quantity, 1);
      return {
        id: row.id,
        itemId: row.item_id,
        displayName: displayForItem(ctx.catalogs, row.item_id),
        quantity: normalizeQuantity(row.quantity, 1),
        currencyRef: row.price_currency_id,
        priceMinor: total,
        canBuy: vendor.inRange === true && this.currencyAmount(ctx.profile.id, row.price_currency_id) >= total
      };
    });
  }

  vendorBuyBack(ctx, payload, operationId) {
    const vendor = this.findVendor(ctx, payload.vendorId || payload.vendor_id);
    if (!vendor) {
      const error = new Error("Vendor niet gevonden in deze zone.");
      error.status = 404;
      throw error;
    }
    this.assertInRange(vendor, "Vendor");
    const entryId = safeString(payload.entryId || payload.entry_id, "");
    const row = this.db.prepare(`
      SELECT * FROM vendor_buyback
      WHERE id = ? AND player_id = ? AND vendor_id = ? AND claimed_at IS NULL AND expires_at > ? LIMIT 1
    `).get(entryId, ctx.profile.id, vendor.vendorId, now());
    if (!row) {
      const error = new Error("Dat ligt hier niet meer.");
      error.status = 404;
      throw error;
    }
    const quantity = normalizeQuantity(row.quantity, 1);
    const total = safeInteger(row.price_amount_minor, 0) * quantity;
    this.spendCurrency(ctx, row.price_currency_id, total, "vendor_buy_back", vendor.vendorId, operationId);
    // Alleen als deze regel nog vrij was gaat het item eruit: twee keer klikken geeft nooit twee items.
    const taken = this.db.prepare("UPDATE vendor_buyback SET claimed_at = ? WHERE id = ? AND player_id = ? AND claimed_at IS NULL").run(now(), entryId, ctx.profile.id);
    if (!safeInteger(taken?.changes, 0)) {
      const error = new Error("Dat ligt hier niet meer.");
      error.status = 409;
      throw error;
    }
    const grants = this.node03RuntimeService.grantItem(ctx, row.item_id, quantity, "vendor_buy_back", vendor.vendorId, operationId);
    this.node03RuntimeService.recordGameplayEvent(ctx, "vendor_buy_back", "player", vendor.vendorId, { itemId: row.item_id, quantity, total });
    return { action: "vendor_buy_back", grants, message: "Teruggekocht: " + displayForItem(ctx.catalogs, row.item_id) + "." };
  }


  // ---- Fase 8b: ruilen met een speler. Beide kanten zeggen ja, en de ruil zelf gebeurt in één keer. ----
  // Deze hele actie zit in één SQLite-transactie (runOperation), dus het is alles of niets: nooit een
  // item dubbel en nooit geld in de min. Dubbel klikken geeft hetzelfde operationId dezelfde bon terug.

  tradeRules(ctx) {
    return tradeValues(policiesOfType(ctx.project, "trade_rules")[0] || null);
  }

  // Tegen spammen: hoeveel handelsacties deze speler het afgelopen uur deed (uit de operatiebonnen).
  assertTradePace(ctx, rules) {
    const limit = Math.max(1, safeInteger(rules.actionsPerHour, 60));
    const since = new Date(Date.now() - 3600000).toISOString();
    const marks = TRADE_ACTION_TYPES.map(() => "?").join(", ");
    const row = this.db.prepare(`
      SELECT COUNT(*) AS total FROM operation_idempotency
      WHERE player_id = ? AND created_at >= ? AND operation_type IN (${marks})
    `).get(ctx.profile.id, since, ...TRADE_ACTION_TYPES);
    if (safeInteger(row?.total, 0) > limit) {
      throw httpError(429, "Je handelt te snel. Even wachten (grens: " + limit + " handelsacties per uur).");
    }
  }

  tradeSession(ctx, tradeId, active = true) {
    const row = this.db.prepare("SELECT * FROM direct_trade_sessions WHERE id = ? LIMIT 1").get(safeString(tradeId, ""));
    if (!row || (row.player_a_id !== ctx.profile.id && row.player_b_id !== ctx.profile.id)) throw httpError(404, "Deze ruil bestaat niet meer.");
    if (!active) return row;
    if (!["invited", "open"].includes(row.state)) throw httpError(409, "Deze ruil is al afgelopen.");
    if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
      this.closeTrade(row.id, "expired");
      throw httpError(409, "De ruil is verlopen. Vraag het opnieuw.");
    }
    return row;
  }

  tradePartnerId(row, ctx) {
    return row.player_a_id === ctx.profile.id ? row.player_b_id : row.player_a_id;
  }

  closeTrade(tradeId, state) {
    const stamp = now();
    this.db.prepare("UPDATE direct_trade_sessions SET state = ?, cancelled_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ?")
      .run(state, stamp, stamp, tradeId);
  }

  // Elke wijziging zet beide vinkjes weer uit: niemand kan na jouw ja nog iets omwisselen.
  touchTrade(tradeId) {
    this.db.prepare("UPDATE direct_trade_sessions SET player_a_confirmed = 0, player_b_confirmed = 0, updated_at = ?, revision = revision + 1 WHERE id = ?")
      .run(now(), tradeId);
  }

  tradeOffers(tradeId, ownerId) {
    return this.db.prepare("SELECT * FROM direct_trade_offers WHERE trade_session_id = ? AND owner_player_id = ? ORDER BY asset_kind ASC, asset_id ASC")
      .all(tradeId, ownerId);
  }

  // Eén regel van een ruil, met de tekst die de speler op de bevestiging ziet.
  tradeLine(ctx, entry) {
    const quantity = normalizeQuantity(entry.quantity_minor, 1);
    if (entry.asset_kind === "currency") {
      const name = displayForCurrency(ctx.catalogs, entry.asset_id);
      return { kind: "currency", currencyId: entry.asset_id, displayName: name, quantity, text: quantity + " " + name };
    }
    const name = displayForItem(ctx.catalogs, entry.asset_id);
    // Op de bevestiging staat altijd het aantal, ook als het er één is.
    return { kind: "item", itemId: entry.asset_id, displayName: name, quantity, text: quantity + "× " + name };
  }

  assertTradeDistance(ctx, otherId, rules, name) {
    const max = Math.max(1, safeInteger(rules.tradeDistance, 20));
    if (typeof this.mmoService?.getWorldPlayerStates !== "function" || !ctx.position) return;
    const state = (this.mmoService.getWorldPlayerStates(ctx.worldId, [otherId]) || [])[0] || null;
    if (!state) return;
    const dx = safeNumber(state.x, 0) - safeNumber(ctx.position.x, 0);
    const dz = safeNumber(state.z, 0) - safeNumber(ctx.position.z, 0);
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance > max) throw httpError(409, name + " staat te ver weg: " + Math.round(distance) + " m (mag " + max + " m).");
  }

  assertTradeNotInCombat(ctx, rules) {
    if (rules.tradeInCombat === true) return;
    const combatAt = typeof this.node03RuntimeService?.vitals === "function"
      ? this.node03RuntimeService.vitals()?.combatAt?.get(ctx.profile.id) || 0
      : 0;
    if (combatAt && Date.now() - combatAt < 5000) throw httpError(409, "Je bent nog in gevecht. Ruilen kan zo weer.");
  }

  inviteToTrade(ctx, payload, operationId) {
    const rules = this.tradeRules(ctx);
    if (rules.tradeOn === false) throw httpError(403, "Ruilen tussen spelers staat uit (Instellingen > 🤝 Handel).");
    this.assertTradePace(ctx, rules);
    const targetId = safeString(payload.targetPlayerId || payload.playerId || payload.player_id, "");
    if (!targetId || targetId === ctx.profile.id) throw httpError(400, "Kies een andere speler om mee te ruilen.");
    const target = this.db.prepare("SELECT id, display_name FROM player_profiles WHERE id = ? LIMIT 1").get(targetId);
    if (!target) throw httpError(404, "Speler niet gevonden.");
    const name = target.display_name || "Die speler";
    if (!this.playerOnline(targetId, ctx.worldId)) throw httpError(409, name + " is niet online.");
    const chat = this.mmoService?.chatRuntime || null;
    if (chat && chat.hasBlocked(targetId, ctx.profile.id)) throw httpError(403, name + " wil geen uitnodigingen van jou.");
    if (chat && chat.hasBlocked(ctx.profile.id, targetId)) throw httpError(409, "Je hebt " + name + " geblokkeerd. Deblokkeer eerst (spelermenu).");
    this.assertTradeNotInCombat(ctx, rules);
    this.assertTradeDistance(ctx, targetId, rules, name);
    const open = this.db.prepare(`
      SELECT id FROM direct_trade_sessions
      WHERE state IN ('invited', 'open') AND ((player_a_id = ? AND player_b_id = ?) OR (player_a_id = ? AND player_b_id = ?))
    `).all(ctx.profile.id, targetId, targetId, ctx.profile.id);
    for (const row of open) this.closeTrade(row.id, "cancelled");
    const tradeId = randomId("trade");
    const stamp = now();
    this.db.prepare(`
      INSERT INTO direct_trade_sessions (id, player_a_id, player_b_id, state, player_a_confirmed, player_b_confirmed, revision, created_at, updated_at, expires_at, operation_id)
      VALUES (?, ?, ?, 'invited', 0, 0, 1, ?, ?, ?, ?)
    `).run(tradeId, ctx.profile.id, targetId, stamp, stamp, addSeconds(Math.max(20, safeInteger(rules.tradeHoldSeconds, 120))), operationId);
    this.node03RuntimeService.recordGameplayEvent(ctx, "trade_invite", "player", targetId, { tradeId });
    return { action: "trade_invite", tradeId, notify: [targetId], message: "Ruil gevraagd aan " + name + "." };
  }

  acceptTrade(ctx, payload) {
    const rules = this.tradeRules(ctx);
    if (rules.tradeOn === false) throw httpError(403, "Ruilen tussen spelers staat uit (Instellingen > 🤝 Handel).");
    this.assertTradePace(ctx, rules);
    const row = this.tradeSession(ctx, payload.tradeId || payload.trade_id);
    if (row.state !== "invited") throw httpError(409, "Deze ruil is al begonnen.");
    if (row.player_b_id !== ctx.profile.id) throw httpError(403, "Alleen de uitgenodigde speler kan de ruil aannemen.");
    const name = this.playerName(row.player_a_id);
    this.assertTradeNotInCombat(ctx, rules);
    this.assertTradeDistance(ctx, row.player_a_id, rules, name);
    this.db.prepare("UPDATE direct_trade_sessions SET state = 'open', updated_at = ?, expires_at = ?, revision = revision + 1 WHERE id = ?")
      .run(now(), addSeconds(Math.max(20, safeInteger(rules.tradeHoldSeconds, 120))), row.id);
    return { action: "trade_accept", tradeId: row.id, notify: [row.player_a_id], message: "Ruil begonnen met " + name + "." };
  }

  offerToTrade(ctx, payload) {
    const rules = this.tradeRules(ctx);
    const row = this.tradeSession(ctx, payload.tradeId || payload.trade_id);
    if (row.state !== "open") throw httpError(409, "Deze ruil staat nog niet open.");
    const itemId = safeString(payload.itemId || payload.item_id, "");
    const currencyId = safeString(payload.currencyId || payload.currency_id, "");
    if (Boolean(itemId) === Boolean(currencyId)) throw httpError(400, "Kies één ding: een item of geld.");
    const kind = itemId ? "item_stack" : "currency";
    const assetId = itemId || currencyId;
    const quantity = Math.max(0, safeInteger(payload.quantity, 0));
    if (quantity <= 0) {
      this.db.prepare("DELETE FROM direct_trade_offers WHERE trade_session_id = ? AND owner_player_id = ? AND asset_kind = ? AND asset_id = ?")
        .run(row.id, ctx.profile.id, kind, assetId);
      this.touchTrade(row.id);
      return { action: "trade_offer", tradeId: row.id, notify: [this.tradePartnerId(row, ctx)], message: "Uit de ruil gehaald." };
    }
    // Alleen wat echt in je tas zit telt (niet wat je draagt).
    const have = itemId ? this.bagCount(ctx.profile.id, itemId) : this.currencyAmount(ctx.profile.id, assetId);
    if (have < quantity) throw httpError(400, itemId ? "Zoveel " + displayForItem(ctx.catalogs, itemId) + " heb je niet in je tas." : "Zoveel heb je niet.");
    if (itemId && !itemIsTradable(catalogSection(ctx.catalogs, "items")[itemId] || {})) {
      throw httpError(403, displayForItem(ctx.catalogs, itemId) + " kun je niet ruilen.");
    }
    const slots = Math.max(1, safeInteger(rules.tradeSlots, 8));
    const mine = this.tradeOffers(row.id, ctx.profile.id);
    const known = mine.some(function (entry) { return entry.asset_kind === kind && entry.asset_id === assetId; });
    if (!known && mine.length >= slots) throw httpError(409, "Je kunt er maximaal " + slots + " in één ruil leggen.");
    this.db.prepare(`
      INSERT INTO direct_trade_offers (trade_session_id, owner_player_id, asset_kind, asset_id, quantity_minor, metadata_json, updated_at)
      VALUES (?, ?, ?, ?, ?, '{}', ?)
      ON CONFLICT(trade_session_id, owner_player_id, asset_kind, asset_id) DO UPDATE SET
        quantity_minor = excluded.quantity_minor,
        updated_at = excluded.updated_at
    `).run(row.id, ctx.profile.id, kind, assetId, quantity, now());
    this.touchTrade(row.id);
    return { action: "trade_offer", tradeId: row.id, notify: [this.tradePartnerId(row, ctx)], message: "In de ruil gelegd." };
  }

  confirmTrade(ctx, payload, operationId) {
    const rules = this.tradeRules(ctx);
    this.assertTradePace(ctx, rules);
    const row = this.tradeSession(ctx, payload.tradeId || payload.trade_id);
    if (row.state !== "open") throw httpError(409, "Deze ruil staat nog niet open.");
    // Je bevestigt precies wat je ziet: is de ruil net veranderd, dan moet je opnieuw kijken.
    const seen = payload.revision === undefined || payload.revision === null || payload.revision === "" ? null : safeInteger(payload.revision, 0);
    if (seen !== null && seen !== safeInteger(row.revision, 1)) throw httpError(409, "De ruil is net veranderd. Kijk opnieuw en bevestig daarna.");
    const column = row.player_a_id === ctx.profile.id ? "player_a_confirmed" : "player_b_confirmed";
    this.db.prepare("UPDATE direct_trade_sessions SET " + column + " = 1, updated_at = ? WHERE id = ?").run(now(), row.id);
    const fresh = this.db.prepare("SELECT * FROM direct_trade_sessions WHERE id = ? LIMIT 1").get(row.id);
    if (!safeInteger(fresh.player_a_confirmed, 0) || !safeInteger(fresh.player_b_confirmed, 0)) {
      return { action: "trade_confirm", tradeId: row.id, notify: [this.tradePartnerId(row, ctx)], message: "Jij hebt ja gezegd. Nu de ander nog." };
    }
    return this.commitTrade(ctx, fresh, operationId);
  }

  commitTrade(ctx, row, operationId) {
    const partnerId = row.player_a_id === ctx.profile.id ? row.player_b_id : row.player_a_id;
    const partnerName = this.playerName(partnerId);
    const partnerCtx = { profile: { id: partnerId }, catalogs: ctx.catalogs, project: ctx.project, worldId: ctx.worldId, zoneId: ctx.zoneId };
    const mine = this.tradeOffers(row.id, ctx.profile.id);
    const theirs = this.tradeOffers(row.id, partnerId);
    if (!mine.length && !theirs.length) throw httpError(400, "Er ligt niets in de ruil.");
    // Eerst alles nakijken, dan omwisselen: gaat er iets niet, dan gebeurt er niets (de transactie rolt terug).
    this.assertTradeGiveable(ctx, mine, partnerCtx);
    this.assertTradeGiveable(partnerCtx, theirs, ctx);
    const given = mine.map((entry) => this.tradeLine(ctx, entry));
    const got = theirs.map((entry) => this.tradeLine(ctx, entry));
    for (const entry of mine) this.moveTradeAsset(ctx, partnerCtx, entry, row.id, operationId);
    for (const entry of theirs) this.moveTradeAsset(partnerCtx, ctx, entry, row.id, operationId);
    const stamp = now();
    this.db.prepare("UPDATE direct_trade_sessions SET state = 'completed', completed_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ?")
      .run(stamp, stamp, row.id);
    this.node03RuntimeService.recordGameplayEvent(ctx, "trade_completed", "player", partnerId, { tradeId: row.id, given, got });
    const text = function (lines) { return lines.length ? lines.map(function (line) { return line.text; }).join(", ") : "niets"; };
    return { action: "trade_confirm", tradeId: row.id, traded: { given, got, partnerName }, notify: [partnerId],
      message: "Geruild met " + partnerName + ": je gaf " + text(given) + " en kreeg " + text(got) + "." };
  }

  assertTradeGiveable(fromCtx, rows, toCtx) {
    for (const entry of rows) {
      const quantity = normalizeQuantity(entry.quantity_minor, 1);
      if (entry.asset_kind === "currency") {
        if (this.currencyAmount(fromCtx.profile.id, entry.asset_id) < quantity) {
          throw httpError(409, "De ruil ging niet door: er is niet genoeg " + displayForCurrency(fromCtx.catalogs, entry.asset_id) + " meer.");
        }
        continue;
      }
      const name = displayForItem(fromCtx.catalogs, entry.asset_id);
      if (this.bagCount(fromCtx.profile.id, entry.asset_id) < quantity) throw httpError(409, "De ruil ging niet door: " + name + " is er niet meer.");
      const item = catalogSection(fromCtx.catalogs, "items")[entry.asset_id] || {};
      if (!itemIsTradable(item)) throw httpError(403, "De ruil ging niet door: " + name + " kun je niet ruilen.");
      if (item.unique === true && this.itemCount(toCtx.profile.id, entry.asset_id) >= 1) {
        throw httpError(409, "De ruil ging niet door: de ander heeft " + name + " al, en dat item mag je maar één keer hebben.");
      }
    }
  }

  moveTradeAsset(fromCtx, toCtx, entry, tradeId, operationId) {
    const quantity = normalizeQuantity(entry.quantity_minor, 1);
    if (entry.asset_kind === "currency") {
      this.spendCurrency(fromCtx, entry.asset_id, quantity, "trade", tradeId, operationId);
      this.node03RuntimeService.grantCurrency(toCtx, entry.asset_id, quantity, "trade", tradeId, operationId);
      return;
    }
    this.removeItem(fromCtx, entry.asset_id, quantity, "trade", tradeId, operationId);
    this.node03RuntimeService.grantItem(toCtx, entry.asset_id, quantity, "trade", tradeId, operationId);
  }

  cancelTrade(ctx, payload) {
    const row = this.tradeSession(ctx, payload.tradeId || payload.trade_id);
    this.closeTrade(row.id, "cancelled");
    return { action: "trade_cancel", tradeId: row.id, notify: [this.tradePartnerId(row, ctx)], message: "Ruil afgebroken." };
  }

  decrementVendorStock(vendor, offer, quantity) {
    if (normalizeMode(offer.stockMode, ["inherit", "infinite", "limited"], "infinite") !== "limited") return;
    const scopeKey = "vendor:" + vendor.vendorId;
    const current = this.offerStock(vendor, offer);
    if (current < quantity) {
      const error = new Error("Vendor stock is op.");
      error.status = 409;
      throw error;
    }
    this.db.prepare(`
      INSERT INTO vendor_stock_state (vendor_id, offer_id, scope_key, quantity, next_restock_at, revision, updated_at)
      VALUES (?, ?, ?, ?, NULL, 1, ?)
      ON CONFLICT(vendor_id, offer_id, scope_key) DO UPDATE SET
        quantity = vendor_stock_state.quantity - excluded.quantity,
        revision = vendor_stock_state.revision + 1,
        updated_at = excluded.updated_at
    `).run(vendor.vendorId, offer.offerId, scopeKey, quantity, now());
  }

  // ---- Groep (MMO, 3-11) ----
  // Uitnodigen, meedoen, nee en verlaten. De server beslist alles; partyRuntime stuurt de nieuwe stand live naar de leden.
  partyRuntime() {
    return this.mmoService?.partyRuntime || null;
  }

  partyRules(ctx) {
    return partyRulesFromProject(ctx.project);
  }

  playerOnline(playerId, worldId) {
    if (typeof this.mmoService?.getConnectionForPlayer !== "function") return true;
    return Boolean(this.mmoService.getConnectionForPlayer(playerId, worldId || null));
  }

  playerName(playerId, fallback = "Speler") {
    try { return this.db.prepare("SELECT display_name FROM player_profiles WHERE id = ? LIMIT 1").get(playerId)?.display_name || fallback; } catch { return fallback; }
  }

  partyMemberIds(partyId) {
    return this.db.prepare("SELECT player_id FROM party_members WHERE party_id = ? AND left_at IS NULL ORDER BY joined_at ASC, player_id ASC")
      .all(partyId).map((row) => row.player_id);
  }

  // Lid worden (ook opnieuw: dezelfde groep, dezelfde speler = de oude regel komt terug).
  addPartyMember(partyId, playerId, role) {
    this.db.prepare(`
      INSERT INTO party_members (party_id, player_id, role, joined_at, left_at, contribution_json)
      VALUES (?, ?, ?, ?, NULL, '{}')
      ON CONFLICT(party_id, player_id) DO UPDATE SET role = excluded.role, joined_at = excluded.joined_at, left_at = NULL
    `).run(partyId, playerId, role, now());
  }

  newParty(ctx, leaderPlayerId) {
    const policy = firstPolicy(ctx.project, "party_rules", {});
    const lootPolicy = firstPolicy(ctx.project, "party_loot_policy", {});
    const partyId = randomId("party");
    const stamp = now();
    this.db.prepare(`
      INSERT INTO parties (id, leader_player_id, loot_policy_id, revision, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `).run(partyId, leaderPlayerId, lootPolicy.policyId || policy.partyLootPolicyRef || "policy.party_loot.personal", stamp, stamp);
    this.addPartyMember(partyId, leaderPlayerId, "leader");
    this.node03RuntimeService.recordGameplayEvent(ctx, "party_created", "player", partyId, {});
    return partyId;
  }

  createParty(ctx, operationId) {
    const existing = this.activePartyForPlayer(ctx.profile.id);
    if (existing) return { action: "party_create", party: existing, message: "Je zit al in een groep." };
    const partyId = this.newParty(ctx, ctx.profile.id);
    this.partyRuntime()?.changed(partyId, [ctx.profile.id]);
    return { action: "party_create", party: this.activePartyForPlayer(ctx.profile.id), message: "Groep gemaakt." };
  }

  leaveParty(ctx, operationId) {
    const party = this.activePartyForPlayer(ctx.profile.id);
    if (!party) return { action: "party_leave", message: "Je zit niet in een groep." };
    const stamp = now();
    const me = this.playerName(ctx.profile.id);
    // Quest Builder stap 2: regel per quest bij groep verlaten (vóór het verlaten, dan is het team nog bekend).
    this.node03RuntimeService.questPartyLeaving?.(ctx, ctx.profile.id);
    this.db.prepare("UPDATE party_members SET left_at = ? WHERE party_id = ? AND player_id = ? AND left_at IS NULL")
      .run(stamp, party.partyId, ctx.profile.id);
    const remaining = this.partyMemberIds(party.partyId);
    const runtime = this.partyRuntime();
    if (remaining.length <= 1) {
      this.disbandParty(party.partyId, stamp);
      runtime?.notice(remaining, me + " heeft de groep verlaten. De groep is opgeheven.");
    } else {
      let text = me + " heeft de groep verlaten.";
      if (party.leaderPlayerId === ctx.profile.id) {
        const nextLeader = remaining[0];
        this.db.prepare("UPDATE party_members SET role = CASE WHEN player_id = ? THEN 'leader' ELSE 'member' END WHERE party_id = ? AND left_at IS NULL")
          .run(nextLeader, party.partyId);
        this.db.prepare("UPDATE parties SET leader_player_id = ?, updated_at = ?, revision = revision + 1 WHERE id = ?")
          .run(nextLeader, stamp, party.partyId);
        text += " " + this.playerName(nextLeader) + " is nu de leider.";
      } else {
        this.db.prepare("UPDATE parties SET updated_at = ?, revision = revision + 1 WHERE id = ?").run(stamp, party.partyId);
      }
      runtime?.notice(remaining, text);
    }
    this.node03RuntimeService.recordGameplayEvent(ctx, "party_left", "player", party.partyId, {});
    runtime?.changed(party.partyId, [ctx.profile.id].concat(remaining));
    return { action: "party_leave", message: "Je hebt de groep verlaten." };
  }

  // Alleen nog één speler over: de groep houdt op.
  disbandParty(partyId, stamp = now()) {
    this.db.prepare("UPDATE party_members SET left_at = ? WHERE party_id = ? AND left_at IS NULL").run(stamp, partyId);
    this.db.prepare("UPDATE parties SET disbanded_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ?").run(stamp, stamp, partyId);
    this.db.prepare("UPDATE party_invites SET status = 'cancelled', responded_at = ? WHERE party_id = ? AND status = 'pending'").run(stamp, partyId);
  }

  // De leider zet iemand uit de groep (Kevin 3-11).
  kickFromParty(ctx, payload, operationId) {
    const party = this.activePartyForPlayer(ctx.profile.id);
    if (!party) throw httpError(409, "Je zit niet in een groep.");
    if (party.leaderPlayerId !== ctx.profile.id) throw httpError(403, "Alleen de leider kan iemand uit de groep zetten.");
    const targetPlayerId = safeString(payload.targetPlayerId || payload.playerId, "");
    if (!targetPlayerId || targetPlayerId === ctx.profile.id) throw httpError(400, "Wil je zelf weg? Kies dan Groep verlaten.");
    const name = this.playerName(targetPlayerId, "Die speler");
    if (!party.members.some((member) => member.playerId === targetPlayerId)) throw httpError(404, name + " zit niet in jouw groep.");
    const stamp = now();
    this.node03RuntimeService.questPartyLeaving?.(ctx, targetPlayerId);
    this.db.prepare("UPDATE party_members SET left_at = ? WHERE party_id = ? AND player_id = ? AND left_at IS NULL").run(stamp, party.partyId, targetPlayerId);
    const remaining = this.partyMemberIds(party.partyId);
    const runtime = this.partyRuntime();
    runtime?.notice([targetPlayerId], this.playerName(ctx.profile.id) + " heeft je uit de groep gezet.");
    if (remaining.length <= 1) {
      this.disbandParty(party.partyId, stamp);
      runtime?.notice(remaining, name + " is uit de groep gezet. De groep is opgeheven.");
    } else {
      this.db.prepare("UPDATE parties SET updated_at = ?, revision = revision + 1 WHERE id = ?").run(stamp, party.partyId);
      runtime?.notice(remaining.filter((id) => id !== ctx.profile.id), name + " is uit de groep gezet.");
    }
    this.node03RuntimeService.recordGameplayEvent(ctx, "party_kicked", "player", party.partyId, { targetPlayerId });
    runtime?.changed(party.partyId, [targetPlayerId].concat(remaining));
    return { action: "party_kick", message: name + " is uit de groep gezet." };
  }

  // De leider kiest of de leden mogen uitnodigen: "all" (iedereen) of "leader" (alleen de leider).
  setPartyInviteRule(ctx, payload, operationId) {
    const party = this.activePartyForPlayer(ctx.profile.id);
    if (!party) throw httpError(409, "Je zit niet in een groep.");
    if (party.leaderPlayerId !== ctx.profile.id) throw httpError(403, "Alleen de leider kan dit veranderen.");
    const rule = payload.rule === "leader" ? "leader" : payload.rule === "all" ? "all" : "";
    if (!rule) throw httpError(400, "Kies aan of uit.");
    const stamp = now();
    this.db.prepare("UPDATE parties SET invite_rule = ?, updated_at = ?, revision = revision + 1 WHERE id = ?").run(rule, stamp, party.partyId);
    const text = rule === "all" ? "Iedereen in de groep mag nu uitnodigen." : "Alleen de leider mag nu uitnodigen.";
    const runtime = this.partyRuntime();
    runtime?.notice(this.partyMemberIds(party.partyId).filter((id) => id !== ctx.profile.id), text);
    runtime?.changed(party.partyId, []);
    return { action: "party_invite_rule", message: text };
  }

  inviteToParty(ctx, payload, operationId) {
    const targetPlayerId = safeString(payload.targetPlayerId || payload.playerId || payload.player_id, "");
    if (!targetPlayerId || targetPlayerId === ctx.profile.id) throw httpError(400, "Kies een andere speler om uit te nodigen.");
    const target = this.db.prepare("SELECT id, display_name FROM player_profiles WHERE id = ? LIMIT 1").get(targetPlayerId);
    if (!target) throw httpError(404, "Speler niet gevonden.");
    const name = target.display_name || "Die speler";
    if (!this.playerOnline(targetPlayerId, ctx.worldId)) throw httpError(409, name + " is niet online.");
    // MMO stap 2 (3-11): blokkeren geldt ook voor uitnodigingen.
    const chat = this.mmoService?.chatRuntime || null;
    if (chat && chat.hasBlocked(targetPlayerId, ctx.profile.id)) throw httpError(403, name + " wil geen uitnodigingen van jou.");
    if (chat && chat.hasBlocked(ctx.profile.id, targetPlayerId)) throw httpError(409, "Je hebt " + name + " geblokkeerd. Deblokkeer eerst (spelermenu).");
    if (this.activePartyForPlayer(targetPlayerId)) throw httpError(409, name + " zit al in een groep.");
    const rules = this.partyRules(ctx);
    const party = this.activePartyForPlayer(ctx.profile.id);
    if (party) {
      if ((party.inviteRule || rules.whoCanInvite) === "leader" && party.leaderPlayerId !== ctx.profile.id) throw httpError(403, "Alleen de leider van de groep mag uitnodigen.");
      if (party.members.length >= rules.maxMembers) throw httpError(409, "De groep is vol (" + rules.maxMembers + " spelers).");
    }
    // Een oudere uitnodiging van jou (of je groep) aan dezelfde speler vervalt: de nieuwe telt.
    const stamp = now();
    this.db.prepare(`
      UPDATE party_invites SET status = 'cancelled', responded_at = ?
      WHERE invitee_player_id = ? AND status = 'pending' AND (inviter_player_id = ? OR (party_id IS NOT NULL AND party_id = ?))
    `).run(stamp, targetPlayerId, ctx.profile.id, party?.partyId || "");
    const inviteId = randomId("party_invite");
    this.db.prepare(`
      INSERT INTO party_invites (id, party_id, inviter_player_id, invitee_player_id, status, created_at, expires_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `).run(inviteId, party?.partyId || null, ctx.profile.id, targetPlayerId, stamp, addSeconds(rules.inviteTimeoutS));
    this.partyRuntime()?.inviteSent(inviteId);
    return { action: "party_invite", inviteId, message: "Uitnodiging gestuurd naar " + name + "." };
  }

  pendingInvite(ctx, payload) {
    const inviteId = safeString(payload.inviteId || payload.invite_id, "");
    const row = inviteId
      ? this.db.prepare("SELECT * FROM party_invites WHERE id = ? AND invitee_player_id = ? LIMIT 1").get(inviteId, ctx.profile.id)
      : this.db.prepare("SELECT * FROM party_invites WHERE invitee_player_id = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at DESC LIMIT 1").get(ctx.profile.id, now());
    if (!row || row.status !== "pending" || Date.parse(row.expires_at) <= Date.now()) throw httpError(404, "Deze uitnodiging is verlopen.");
    return row;
  }

  acceptPartyInvite(ctx, payload, operationId) {
    const row = this.pendingInvite(ctx, payload);
    if (this.activePartyForPlayer(ctx.profile.id)) throw httpError(409, "Je zit al in een groep. Verlaat die eerst.");
    const rules = this.partyRules(ctx);
    // De groep van de uitnodiging; bestaat die niet meer, dan de groep van wie uitnodigde; anders een nieuwe met hem als leider.
    let partyId = null;
    if (row.party_id && this.db.prepare("SELECT id FROM parties WHERE id = ? AND disbanded_at IS NULL LIMIT 1").get(row.party_id)) partyId = row.party_id;
    if (!partyId) partyId = this.activePartyForPlayer(row.inviter_player_id)?.partyId || null;
    if (!partyId) partyId = this.newParty(ctx, row.inviter_player_id);
    const before = this.partyMemberIds(partyId);
    if (before.length >= rules.maxMembers) throw httpError(409, "De groep is vol (" + rules.maxMembers + " spelers).");
    const stamp = now();
    this.addPartyMember(partyId, ctx.profile.id, "member");
    this.db.prepare("UPDATE party_invites SET status = 'accepted', responded_at = ? WHERE id = ?").run(stamp, row.id);
    this.db.prepare("UPDATE parties SET updated_at = ?, revision = revision + 1 WHERE id = ?").run(stamp, partyId);
    const runtime = this.partyRuntime();
    runtime?.notice(before, this.playerName(ctx.profile.id) + " doet mee met de groep.");
    runtime?.changed(partyId, before.concat([ctx.profile.id]));
    return { action: "party_accept", message: "Je zit nu in de groep met " + this.playerName(row.inviter_player_id) + "." };
  }

  declinePartyInvite(ctx, payload, operationId) {
    const row = this.pendingInvite(ctx, payload);
    this.db.prepare("UPDATE party_invites SET status = 'declined', responded_at = ? WHERE id = ?").run(now(), row.id);
    this.partyRuntime()?.notice([row.inviter_player_id], this.playerName(ctx.profile.id) + " doet nu niet mee.");
    return { action: "party_decline", message: "Uitnodiging afgeslagen." };
  }

  // Lichte route voor de game: alleen groepsacties, het antwoord is alleen de groep (geen hele handels-snapshot).
  partyActionForRequest(req, payload = {}) {
    const short = { invite: "party_invite", accept: "party_accept", decline: "party_decline", leave: "party_leave", kick: "party_kick", invite_rule: "party_invite_rule" };
    const raw = safeString(payload.action, "").toLowerCase();
    const action = short[raw] || (Object.values(short).includes(raw) ? raw : "");
    if (!action) throw httpError(400, "Onbekende groepsactie: " + (raw || "-"));
    const ctx = this.getRequestContext(req);
    const operationId = operationIdFromPayload(payload) || randomId("party_operation");
    return runOperation(this.db, {
      operationId,
      playerId: ctx.profile.id,
      operationType: action,
      requestHash: normalizedActionPayloadHash(action, payload),
      label: "Deze groepsactie",
      faultHook: this.operationFaultHook || null,
      perform: () => this.performAction(ctx, action, payload, operationId),
      buildResponse: (result) => ({ ok: true, operationId, action, message: result.message || "", party: this.partyRuntime()?.viewFor(ctx.profile.id) ?? null })
    });
  }

  createMarketOrder(ctx, payload, operationId) {
    const access = this.findMarketAccess(ctx, payload.marketId);
    if (!access) throw httpError(404, "Hier is geen markt. Zet bij een NPC 'Markt' aan.");
    if (access.remoteAccessAllowed !== true) this.assertInRange(access, "De markt");
    // Fase 8b: de marktregels komen uit Instellingen > 🤝 Handel.
    const rules = this.tradeRules(ctx);
    if (rules.marketOn === false) throw httpError(403, "De markt staat uit (Instellingen > 🤝 Handel).");
    this.assertTradePace(ctx, rules);
    this.expireMarketOrders(ctx);
    const itemId = safeString(payload.itemId || payload.item_id, "");
    const item = catalogSection(ctx.catalogs, "items")[itemId] || null;
    const name = displayForItem(ctx.catalogs, itemId);
    if (!item) throw httpError(400, "Kies iets uit je tas.");
    if (!itemMarketOk(item)) throw httpError(403, name + " mag niet op de markt.");
    const quantity = normalizeQuantity(payload.quantity, 1);
    if (this.bagCount(ctx.profile.id, itemId) < quantity) throw httpError(400, "Zoveel " + name + " heb je niet in je tas.");
    const mineActive = safeInteger(this.db.prepare("SELECT COUNT(*) AS total FROM market_orders WHERE seller_player_id = ? AND status IN ('active', 'partially_filled')")
      .get(ctx.profile.id)?.total, 0);
    const maxListings = Math.max(1, safeInteger(rules.marketMaxPerPlayer, 20));
    if (mineActive >= maxListings) throw httpError(409, "Je hebt al " + mineActive + " dingen op de markt staan (grens: " + maxListings + ").");
    const currencyId = safeString(payload.currencyId || payload.currency_id, "") || firstCurrencyId(ctx.catalogs);
    if (!catalogSection(ctx.catalogs, "currencies")[currencyId]) throw httpError(400, "Die valuta bestaat niet.");
    const unitPrice = safeInteger(payload.unitPriceMinor || payload.unit_price_minor, 0);
    if (unitPrice < 1) throw httpError(400, "Vul een prijs in (minstens 1).");
    const days = Math.max(1, safeInteger(rules.marketDays, 1));
    const expiresAt = addDays(days);
    this.removeItem(ctx, itemId, quantity, "market_listing_escrow", access.marketAccessId, operationId);
    const orderId = randomId("market_order");
    const stamp = now();
    this.db.prepare(`
      INSERT INTO market_orders (id, seller_player_id, item_kind, item_id, item_instance_id, quantity_total, quantity_remaining, currency_id, unit_price_minor, status, created_at, expires_at, updated_at, metadata_json)
      VALUES (?, ?, 'item_stack', ?, NULL, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(orderId, ctx.profile.id, itemId, quantity, quantity, currencyId, unitPrice, stamp, expiresAt, stamp, stableJson({ marketAccessId: access.marketAccessId }));
    this.db.prepare(`
      INSERT INTO asset_reservations (id, owner_player_id, reservation_kind, reservation_ref, asset_kind, asset_id, quantity_minor, status, created_at, expires_at)
      VALUES (?, ?, 'market', ?, 'item_stack', ?, ?, 'active', ?, ?)
    `).run(randomId("reservation"), ctx.profile.id, orderId, itemId, quantity, stamp, expiresAt);
    return { action: "market_list", orderId,
      message: "Op de markt: " + quantity + "× " + name + " voor " + unitPrice + " " + displayForCurrency(ctx.catalogs, currencyId) + " per stuk." };
  }

  buyMarketOrder(ctx, payload, operationId) {
    const access = this.findMarketAccess(ctx, payload.marketId);
    if (!access) throw httpError(404, "Hier is geen markt. Zet bij een NPC 'Markt' aan.");
    if (access.remoteAccessAllowed !== true) this.assertInRange(access, "De markt");
    const rules = this.tradeRules(ctx);
    if (rules.marketOn === false) throw httpError(403, "De markt staat uit (Instellingen > 🤝 Handel).");
    this.assertTradePace(ctx, rules);
    const orderId = safeString(payload.orderId || payload.order_id, "");
    const order = this.db.prepare("SELECT * FROM market_orders WHERE id = ? LIMIT 1").get(orderId);
    if (!order || !["active", "partially_filled"].includes(order.status)) throw httpError(404, "Dat staat niet meer op de markt.");
    if (Date.parse(order.expires_at) <= Date.now()) throw httpError(409, "Dat staat niet meer op de markt (de tijd is om).");
    if (order.seller_player_id === ctx.profile.id) throw httpError(400, "Je eigen aanbod koop je niet; neem het terug bij Mijn aanbod.");
    const quantity = Math.min(normalizeQuantity(payload.quantity, 1), safeInteger(order.quantity_remaining, 0));
    if (quantity <= 0) throw httpError(409, "Dat is net uitverkocht.");
    const gross = safeInteger(order.unit_price_minor, 0) * quantity;
    this.spendCurrency(ctx, order.currency_id, gross, "market_buy", order.id, operationId);
    // Fase 8b: de marktbelasting staat op één plek: Instellingen > 💰 Geld.
    const taxPct = Math.max(0, safeInteger(economyRules(ctx.project).marketTaxPct, 0));
    const tax = Math.min(gross, Math.round(gross * taxPct / 100));
    const sellerAmount = Math.max(0, gross - tax);
    this.node03RuntimeService.grantItem(ctx, order.item_id, quantity, "market_buy", order.id, operationId);
    this.creditMarketSeller(ctx, order.seller_player_id, order.currency_id, sellerAmount, order, operationId, tax);
    const remaining = safeInteger(order.quantity_remaining, 0) - quantity;
    const status = remaining > 0 ? "partially_filled" : "filled";
    this.db.prepare(`
      UPDATE market_orders
      SET quantity_remaining = ?, status = ?, updated_at = ?, closed_at = CASE WHEN ? = 0 THEN ? ELSE closed_at END, revision = revision + 1
      WHERE id = ?
    `).run(remaining, status, now(), remaining, now(), order.id);
    this.db.prepare(`
      UPDATE asset_reservations
      SET quantity_minor = CASE WHEN quantity_minor > ? THEN quantity_minor - ? ELSE quantity_minor END,
          status = CASE WHEN quantity_minor <= ? THEN 'consumed' ELSE status END,
          released_at = CASE WHEN quantity_minor <= ? THEN ? ELSE released_at END
      WHERE reservation_kind = 'market' AND reservation_ref = ? AND status = 'active'
    `).run(quantity, quantity, quantity, quantity, now(), order.id);
    this.db.prepare(`
      INSERT INTO market_trades (id, operation_id, order_id, buyer_player_id, seller_player_id, quantity, currency_id, unit_price_minor, gross_amount_minor, tax_amount_minor, seller_amount_minor, created_at, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')
    `).run(randomId("market_trade"), operationId, order.id, ctx.profile.id, order.seller_player_id, quantity, order.currency_id, safeInteger(order.unit_price_minor, 0), gross, tax, sellerAmount, now());
    return { action: "market_buy", orderId: order.id, notify: [order.seller_player_id],
      message: "Gekocht op de markt: " + quantity + "× " + displayForItem(ctx.catalogs, order.item_id) + " voor " + gross + " " + displayForCurrency(ctx.catalogs, order.currency_id) + "." };
  }

  // amount = wat de verkoper krijgt, taxMinor = wat de markt eraf haalde (dat geld verdwijnt uit het spel).
  creditMarketSeller(ctx, sellerPlayerId, currencyId, amount, order, operationId, taxMinor = 0) {
    const tax = Math.max(0, safeInteger(taxMinor, 0));
    if (tax > 0) this.node03RuntimeService.recordLedger(operationId, sellerPlayerId, "currency", currencyId, -tax, amount + tax, amount, "market_tax", order.id);
    if (amount <= 0) return;
    const sellerOnline = this.mmoService.countConnectedPlayerSessions ? this.mmoService.countConnectedPlayerSessions(sellerPlayerId) > 0 : false;
    if (sellerOnline) {
      const existing = this.db.prepare("SELECT amount_minor FROM player_currencies WHERE player_id = ? AND currency_id = ? LIMIT 1")
        .get(sellerPlayerId, currencyId);
      const before = safeInteger(existing?.amount_minor, 0);
      this.db.prepare(`
        INSERT INTO player_currencies (player_id, currency_id, amount_minor, revision, updated_at)
        VALUES (?, ?, ?, 1, ?)
        ON CONFLICT(player_id, currency_id) DO UPDATE SET
          amount_minor = player_currencies.amount_minor + excluded.amount_minor,
          revision = player_currencies.revision + 1,
          updated_at = excluded.updated_at
      `).run(sellerPlayerId, currencyId, amount, now());
      this.node03RuntimeService.recordLedger(operationId, sellerPlayerId, "currency", currencyId, amount, before, before + amount, "market_sale", order.id);
      return;
    }
    this.createSystemMail(sellerPlayerId, "market_sale", "Verkocht op de markt",
      "Iemand kocht je " + displayForItem(ctx.catalogs, order.item_id) + " op de markt. Dit is je geld" + (tax > 0 ? " (de markt hield " + tax + " in)." : "."), [
      { kind: "currency", assetId: currencyId, quantityMinor: amount }
    ], order.id, Math.max(1, safeInteger(this.tradeRules(ctx).mailKeepDays, 30)));
  }

  cancelMarketOrder(ctx, payload, operationId) {
    const orderId = safeString(payload.orderId || payload.order_id, "");
    const order = this.db.prepare("SELECT * FROM market_orders WHERE id = ? LIMIT 1").get(orderId);
    if (!order || !["active", "partially_filled"].includes(order.status) || order.seller_player_id !== ctx.profile.id) {
      throw httpError(404, "Dat staat niet (meer) van jou op de markt.");
    }
    const remaining = safeInteger(order.quantity_remaining, 0);
    if (remaining > 0) this.node03RuntimeService.grantItem(ctx, order.item_id, remaining, "market_cancel_return", order.id, operationId);
    this.db.prepare(`
      UPDATE market_orders
      SET status = 'cancelled', quantity_remaining = 0, closed_at = ?, updated_at = ?, revision = revision + 1
      WHERE id = ?
    `).run(now(), now(), order.id);
    this.db.prepare(`
      UPDATE asset_reservations
      SET status = 'released', released_at = ?
      WHERE reservation_kind = 'market' AND reservation_ref = ? AND status = 'active'
    `).run(now(), order.id);
    return { action: "market_cancel", orderId: order.id, message: "Teruggenomen van de markt: " + displayForItem(ctx.catalogs, order.item_id) + "." };
  }

  createSystemMail(playerId, type, subject, body, attachments, sourceRef = null, keepDays = 30) {
    const mailId = randomId("mail");
    const stamp = now();
    this.db.prepare(`
      INSERT INTO player_mail (id, player_id, mail_type, subject, body, state, source_ref, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, 'unread', ?, ?, ?)
    `).run(mailId, playerId, type, subject, body, sourceRef, stamp, addDays(keepDays));
    for (const attachment of attachments || []) {
      this.db.prepare(`
        INSERT INTO player_mail_attachments (id, mail_id, asset_kind, asset_id, quantity_minor, payload_json, state)
        VALUES (?, ?, ?, ?, ?, '{}', 'available')
      `).run(randomId("mail_attachment"), mailId, attachment.kind, attachment.assetId, normalizeQuantity(attachment.quantityMinor, 1));
    }
    return mailId;
  }

  // Alle characters van je account delen één postbus.
  mailOwnerIds(ctx) {
    const userId = ctx.profile?.user_id || null;
    if (!userId) return [ctx.profile.id];
    const ids = this.db.prepare("SELECT id FROM player_profiles WHERE user_id = ?").all(userId).map((row) => row.id);
    return ids.length ? ids : [ctx.profile.id];
  }

  ownedMail(ctx, mailId) {
    const owners = this.mailOwnerIds(ctx);
    const mail = this.db.prepare(`SELECT * FROM player_mail WHERE id = ? AND player_id IN (${owners.map(() => "?").join(", ")}) LIMIT 1`)
      .get(safeString(mailId, ""), ...owners);
    if (!mail) throw httpError(404, "Dat bericht is er niet (meer).");
    return mail;
  }

  claimMail(ctx, payload, operationId) {
    return this.claimMailRow(ctx, this.ownedMail(ctx, payload.mailId || payload.mail_id), operationId);
  }

  claimAllMail(ctx, operationId) {
    const owners = this.mailOwnerIds(ctx);
    const rows = this.db.prepare(`
      SELECT *
      FROM player_mail
      WHERE player_id IN (${owners.map(() => "?").join(", ")}) AND state IN ('unread', 'read', 'partially_claimed') AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY created_at ASC
      LIMIT 50
    `).all(...owners, now());
    const grants = [];
    const kept = [];
    for (const row of rows) {
      const result = this.claimMailRow(ctx, row, operationId + ":" + row.id);
      grants.push.apply(grants, result.grants || []);
      kept.push.apply(kept, result.kept || []);
    }
    const note = kept.length ? " Bleef liggen (heb je al, mag maar 1×): " + kept.join(", ") + "." : "";
    return { action: "mail_claim_all", grants, message: (grants.length ? "Alles uit de post gehaald." : "Er lag niets om op te halen.") + note };
  }

  claimMailRow(ctx, mail, operationId) {
    const attachments = this.db.prepare("SELECT * FROM player_mail_attachments WHERE mail_id = ? AND state = 'available'").all(mail.id);
    const grants = [];
    const kept = [];
    for (const attachment of attachments) {
      if (attachment.asset_kind === "currency") {
        const grant = this.node03RuntimeService.grantCurrency(ctx, attachment.asset_id, safeInteger(attachment.quantity_minor, 0), "mail_claim", mail.id, operationId);
        if (grant) grants.push(grant);
      } else {
        // Een uniek item dat je al hebt blijft in de post liggen (anders zou het verdwijnen).
        const item = catalogSection(ctx.catalogs, "items")[attachment.asset_id] || {};
        if (item.unique === true && this.node03RuntimeService.ownedItemCount(ctx.profile.id, attachment.asset_id) >= 1) {
          kept.push(displayForItem(ctx.catalogs, attachment.asset_id));
          continue;
        }
        grants.push.apply(grants, this.node03RuntimeService.grantItem(ctx, attachment.asset_id, safeInteger(attachment.quantity_minor, 1), "mail_claim", mail.id, operationId));
      }
      this.db.prepare("UPDATE player_mail_attachments SET state = 'claimed', claimed_operation_id = ?, claimed_at = ? WHERE id = ?")
        .run(operationId, now(), attachment.id);
    }
    this.db.prepare("UPDATE player_mail SET state = ?, read_at = COALESCE(read_at, ?), claimed_at = ?, revision = revision + 1 WHERE id = ?")
      .run(kept.length ? "partially_claimed" : "claimed", now(), now(), mail.id);
    const note = kept.length ? " Bleef liggen (heb je al, mag maar 1×): " + kept.join(", ") + "." : "";
    return { action: "mail_claim", mailId: mail.id, grants, kept, message: (grants.length ? "Uit de post gehaald." : "Er zat niets (meer) bij.") + note };
  }

  readMail(ctx, payload) {
    const mail = this.ownedMail(ctx, payload.mailId || payload.mail_id);
    if (mail.state === "unread") {
      this.db.prepare("UPDATE player_mail SET state = 'read', read_at = ?, revision = revision + 1 WHERE id = ?").run(now(), mail.id);
    }
    return { action: "mail_read", mailId: mail.id, message: "" };
  }

  deleteMail(ctx, payload) {
    const mail = this.ownedMail(ctx, payload.mailId || payload.mail_id);
    const open = this.db.prepare("SELECT COUNT(*) AS total FROM player_mail_attachments WHERE mail_id = ? AND state = 'available'").get(mail.id);
    if (safeInteger(open?.total, 0) > 0) throw httpError(409, "Haal eerst op wat erbij zit.");
    this.db.prepare("UPDATE player_mail SET state = 'claimed', claimed_at = COALESCE(claimed_at, ?), revision = revision + 1 WHERE id = ?").run(now(), mail.id);
    return { action: "mail_delete", mailId: mail.id, message: "Bericht weggegooid." };
  }

  // Aan wie: een spelers-ID (uit het spelermenu) of een naam. Een naam hoort bij een account; de post gaat naar
  // het character waarmee die speler nu speelt (en elk character van dat account ziet hem).
  findMailTarget(payload) {
    const byId = safeString(payload.targetPlayerId || payload.target_player_id, "");
    const name = playerText(payload.toName || payload.to_name, 60);
    let row = null;
    if (byId) row = this.db.prepare("SELECT id, user_id, display_name FROM player_profiles WHERE id = ? LIMIT 1").get(byId) || null;
    else if (name) {
      row = this.db.prepare(`
        SELECT p.id, p.user_id, p.display_name FROM player_profiles p
        LEFT JOIN users u ON u.id = p.user_id
        WHERE lower(p.display_name) = lower(?)
        ORDER BY CASE WHEN u.active_profile_id = p.id THEN 0 ELSE 1 END, p.updated_at DESC
        LIMIT 1
      `).get(name) || null;
    }
    if (!row) throw httpError(404, name ? "Er is geen speler die " + name + " heet." : "Aan wie? Vul een naam in.");
    return row;
  }

  // Fase 8 herstel: post naar een andere speler, met een item en/of geld erbij als je wilt.
  // Wat je meestuurt gaat in dezelfde transactie uit je tas en zit dan in de post: nooit dubbel, nooit kwijt.
  sendMail(ctx, payload, operationId) {
    const rules = this.tradeRules(ctx);
    if (rules.mailOn === false) throw httpError(403, "Post sturen staat uit (Instellingen > 🤝 Handel).");
    this.assertTradePace(ctx, rules);
    const target = this.findMailTarget(payload);
    const name = target.display_name || "Die speler";
    const myUser = ctx.profile?.user_id || null;
    if (target.id === ctx.profile.id || (myUser && target.user_id === myUser)) throw httpError(400, "Post naar jezelf hoeft niet: al je characters zien dezelfde postbus.");
    const chat = this.mmoService?.chatRuntime || null;
    if (chat && chat.hasBlocked(target.id, ctx.profile.id)) throw httpError(403, name + " wil geen post van jou.");
    if (chat && chat.hasBlocked(ctx.profile.id, target.id)) throw httpError(409, "Je hebt " + name + " geblokkeerd. Deblokkeer eerst (spelermenu).");
    const owners = this.mailOwnerIds({ profile: { id: target.id, user_id: target.user_id } });
    const full = safeInteger(this.db.prepare(`
      SELECT COUNT(*) AS total FROM player_mail
      WHERE player_id IN (${owners.map(() => "?").join(", ")}) AND state IN ('unread', 'read', 'partially_claimed') AND (expires_at IS NULL OR expires_at > ?)
    `).get(...owners, now())?.total, 0);
    const max = Math.max(1, safeInteger(rules.mailMax, 100));
    if (full >= max) throw httpError(409, "De postbus van " + name + " is vol (" + max + " berichten).");
    const itemId = safeString(payload.itemId || payload.item_id, "");
    const itemQty = itemId ? normalizeQuantity(payload.quantity, 1) : 0;
    const currencyId = safeString(payload.currencyId || payload.currency_id, "");
    const amount = currencyId ? Math.max(0, safeInteger(payload.amountMinor || payload.amount_minor, 0)) : 0;
    if (itemId) {
      const item = catalogSection(ctx.catalogs, "items")[itemId] || null;
      if (!item) throw httpError(400, "Dat item bestaat niet (meer).");
      if (!itemIsTradable(item)) throw httpError(403, displayForItem(ctx.catalogs, itemId) + " kun je niet versturen.");
      if (this.bagCount(ctx.profile.id, itemId) < itemQty) throw httpError(400, "Zoveel " + displayForItem(ctx.catalogs, itemId) + " heb je niet in je tas.");
    }
    if (amount > 0 && !catalogSection(ctx.catalogs, "currencies")[currencyId]) throw httpError(400, "Die valuta bestaat niet.");
    const text = playerText(payload.text, 500);
    if (!text && !itemId && amount <= 0) throw httpError(400, "Schrijf iets, of stuur een item of geld mee.");
    const me = this.playerName(ctx.profile.id);
    const subject = playerText(payload.subject, 60) || "Post van " + me;
    const attachments = [];
    if (itemId) attachments.push({ kind: "item_stack", assetId: itemId, quantityMinor: itemQty });
    if (amount > 0) attachments.push({ kind: "currency", assetId: currencyId, quantityMinor: amount });
    const mailId = this.createSystemMail(target.id, "system_delivery", subject, text, attachments, "player:" + ctx.profile.id,
      Math.max(1, safeInteger(rules.mailKeepDays, 30)));
    if (itemId) this.removeItem(ctx, itemId, itemQty, "mail_send", mailId, operationId);
    if (amount > 0) this.spendCurrency(ctx, currencyId, amount, "mail_send", mailId, operationId);
    this.node03RuntimeService.recordGameplayEvent(ctx, "mail_send", "player", target.id, { mailId, itemId: itemId || null, quantity: itemQty, currencyId: amount > 0 ? currencyId : null, amount });
    const parts = [itemId ? itemQty + "× " + displayForItem(ctx.catalogs, itemId) : "", amount > 0 ? amount + " " + displayForCurrency(ctx.catalogs, currencyId) : ""].filter(Boolean);
    return { action: "mail_send", mailId, notify: [target.id], message: "Post verstuurd naar " + name + (parts.length ? " met " + parts.join(" en ") : "") + "." };
  }

  // Fase 8 herstel: wat te lang op de markt stond, gaat met de post terug naar de verkoper.
  expireMarketOrders(ctx) {
    const due = this.db.prepare(`
      SELECT * FROM market_orders WHERE status IN ('active', 'partially_filled') AND expires_at <= ? ORDER BY expires_at ASC LIMIT 20
    `).all(now());
    if (!due.length) return 0;
    const own = this.db.isTransaction !== true;
    if (own) this.db.exec("BEGIN IMMEDIATE");
    try {
      const keepDays = Math.max(1, safeInteger(this.tradeRules(ctx).mailKeepDays, 30));
      for (const order of due) {
        const stamp = now();
        const changed = this.db.prepare("UPDATE market_orders SET status = 'expired', closed_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND status IN ('active', 'partially_filled')")
          .run(stamp, stamp, order.id);
        if (!safeInteger(changed?.changes, 0)) continue;
        const remaining = safeInteger(order.quantity_remaining, 0);
        if (remaining > 0) {
          this.createSystemMail(order.seller_player_id, "market_return", "Terug van de markt",
            "Niemand kocht dit op tijd. Hier is het terug: " + remaining + "× " + displayForItem(ctx.catalogs, order.item_id) + ".",
            [{ kind: "item_stack", assetId: order.item_id, quantityMinor: remaining }], order.id, keepDays);
        }
        this.db.prepare("UPDATE asset_reservations SET status = 'released', released_at = ? WHERE reservation_kind = 'market' AND reservation_ref = ? AND status = 'active'")
          .run(stamp, order.id);
      }
      if (own) this.db.exec("COMMIT");
    } catch (error) {
      if (own) { try { this.db.exec("ROLLBACK"); } catch {} }
      throw error;
    }
    return due.length;
  }

  resetNode05(ctx, operationId) {
    this.db.prepare("DELETE FROM player_crafting_jobs WHERE player_id = ?").run(ctx.profile.id);
    this.db.prepare("DELETE FROM party_invites WHERE inviter_player_id = ? OR invitee_player_id = ?").run(ctx.profile.id, ctx.profile.id);
    const party = this.activePartyForPlayer(ctx.profile.id);
    if (party) this.leaveParty(ctx, operationId + ":party_leave");
    for (const row of this.db.prepare("SELECT * FROM market_orders WHERE seller_player_id = ? AND status IN ('active', 'partially_filled')").all(ctx.profile.id)) {
      this.node03RuntimeService.grantItem(ctx, row.item_id, safeInteger(row.quantity_remaining, 0), "node05_reset_market_return", row.id, operationId);
      this.db.prepare("UPDATE market_orders SET status = 'cancelled', quantity_remaining = 0, closed_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), row.id);
    }
    this.db.prepare("DELETE FROM player_mail_attachments WHERE mail_id IN (SELECT id FROM player_mail WHERE player_id = ?)").run(ctx.profile.id);
    this.db.prepare("DELETE FROM player_mail WHERE player_id = ?").run(ctx.profile.id);
    return { action: "reset_node05", message: "Handelsgegevens opnieuw ingesteld." };
  }

  currencyAmount(playerId, currencyId) {
    const row = this.db.prepare("SELECT amount_minor FROM player_currencies WHERE player_id = ? AND currency_id = ? LIMIT 1")
      .get(playerId, currencyId);
    return safeInteger(row?.amount_minor, 0);
  }

  itemCount(playerId, itemId) {
    return this.node03RuntimeService.ownedItemCount(playerId, itemId);
  }

  // Fase 8 herstel: alleen wat echt in je tas zit (niet wat je draagt, niet wat op de markt of in de post ligt).
  bagCount(playerId, itemId) {
    const stack = this.db.prepare("SELECT COALESCE(SUM(quantity), 0) AS qty FROM player_inventory_stacks WHERE player_id = ? AND item_id = ?").get(playerId, itemId);
    const loose = this.db.prepare("SELECT COUNT(*) AS total FROM player_item_instances WHERE player_id = ? AND item_id = ? AND location_type = 'inventory'").get(playerId, itemId);
    return safeInteger(stack?.qty, 0) + safeInteger(loose?.total, 0);
  }

  bagItems(playerId) {
    return this.db.prepare(`
      SELECT item_id, SUM(qty) AS qty FROM (
        SELECT item_id, quantity AS qty FROM player_inventory_stacks WHERE player_id = ? AND quantity > 0
        UNION ALL
        SELECT item_id, 1 AS qty FROM player_item_instances WHERE player_id = ? AND location_type = 'inventory'
      ) GROUP BY item_id ORDER BY item_id LIMIT 200
    `).all(playerId, playerId).map((row) => ({ itemId: row.item_id, quantity: safeInteger(row.qty, 0) })).filter((row) => row.quantity > 0);
  }

  spendCurrency(ctx, currencyId, amountMinor, reason, sourceRef, operationId) {
    const amount = Math.max(0, safeInteger(amountMinor, 0));
    if (!currencyId || amount <= 0) return;
    const row = this.db.prepare("SELECT amount_minor FROM player_currencies WHERE player_id = ? AND currency_id = ? LIMIT 1")
      .get(ctx.profile.id, currencyId);
    const before = safeInteger(row?.amount_minor, 0);
    if (before < amount) {
      const error = new Error("Niet genoeg " + displayForCurrency(ctx.catalogs, currencyId) + ".");
      error.status = 400;
      throw error;
    }
    const after = before - amount;
    this.db.prepare(`
      INSERT INTO player_currencies (player_id, currency_id, amount_minor, revision, updated_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(player_id, currency_id) DO UPDATE SET
        amount_minor = ?,
        revision = player_currencies.revision + 1,
        updated_at = excluded.updated_at
    `).run(ctx.profile.id, currencyId, after, now(), after);
    this.node03RuntimeService.recordLedger(operationId, ctx.profile.id, "currency", currencyId, -amount, before, after, reason, sourceRef);
  }

  removeItem(ctx, itemId, quantity, reason, sourceRef, operationId) {
    let remaining = normalizeQuantity(quantity, 1);
    const rows = this.db.prepare(`
      SELECT * FROM player_inventory_stacks
      WHERE player_id = ? AND item_id = ? AND quantity > 0
      ORDER BY updated_at ASC
    `).all(ctx.profile.id, itemId);
    for (const row of rows) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, safeInteger(row.quantity, 0));
      const before = safeInteger(row.quantity, 0);
      const after = before - take;
      this.db.prepare(`
        UPDATE player_inventory_stacks
        SET quantity = ?, revision = revision + 1, updated_at = ?
        WHERE stack_id = ?
      `).run(after, now(), row.stack_id);
      this.node03RuntimeService.recordLedger(operationId, ctx.profile.id, "item_stack", itemId, -take, before, after, reason, sourceRef);
      remaining -= take;
    }
    if (remaining > 0) {
      const instances = this.db.prepare(`
        SELECT * FROM player_item_instances
        WHERE player_id = ? AND item_id = ? AND location_type = 'inventory'
        ORDER BY updated_at ASC
        LIMIT ?
      `).all(ctx.profile.id, itemId, remaining);
      for (const instance of instances) {
        this.db.prepare(`
          UPDATE player_item_instances
          SET location_type = 'deleted', locked_by_operation_id = ?, revision = revision + 1, updated_at = ?
          WHERE id = ?
        `).run(operationId, now(), instance.id);
        this.node03RuntimeService.recordLedger(operationId, ctx.profile.id, "item_instance", itemId, -1, 1, 0, reason, sourceRef);
        remaining -= 1;
      }
    }
    if (remaining > 0) {
      const error = new Error("Niet genoeg " + displayForItem(ctx.catalogs, itemId) + ".");
      error.status = 400;
      throw error;
    }
  }
}
