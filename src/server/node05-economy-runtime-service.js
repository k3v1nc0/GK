import crypto from "node:crypto";

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function randomId(prefix) {
  return prefix + "_" + crypto.randomUUID();
}

function requestHash(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
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

function itemIsTradable(item) {
  return item && item.tradable !== false && item.bindPolicy !== "quest_bound";
}

function operationIdFromPayload(payload) {
  return safeString(payload?.operationId || payload?.operation_id || "", "");
}

function connectedComponents(zonePackage) {
  const components = Array.isArray(zonePackage?.entityComponents) ? zonePackage.entityComponents.slice() : [];
  for (const entity of Array.isArray(zonePackage?.entities) ? zonePackage.entities : []) {
    if (Array.isArray(entity?.components)) components.push.apply(components, entity.components);
  }
  return components.filter(Boolean);
}

function visibleEntities(zonePackage) {
  return (Array.isArray(zonePackage?.entities) ? zonePackage.entities : []).filter(function (entity) {
    return entity && entity.nodeType === "model_entity";
  });
}

function linkedEntityForComponent(zonePackage, component) {
  const entityId = safeString(component?.linkedEntityId || component?.entityRef || "", "");
  const entities = visibleEntities(zonePackage);
  if (entityId) {
    const found = entities.find(function (entity) {
      return entity.entityId === entityId || entity.nodeId === entityId || entity.id === entityId;
    });
    if (found) return found;
  }
  return null;
}

function positionedComponent(ctx, component) {
  const entity = linkedEntityForComponent(ctx.zonePackage, component);
  const x = safeNumber(entity?.x ?? component?.x, safeNumber(ctx.position?.x, 0));
  const y = safeNumber(entity?.y ?? component?.y, 0);
  const z = safeNumber(entity?.z ?? component?.z, safeNumber(ctx.position?.z, 0));
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
    const hash = requestHash({
      action,
      stationId: payload.stationId || payload.station_id || null,
      recipeId: payload.recipeId || payload.recipe_id || null,
      vendorId: payload.vendorId || payload.vendor_id || null,
      offerId: payload.offerId || payload.offer_id || null,
      orderId: payload.orderId || payload.order_id || null,
      mailId: payload.mailId || payload.mail_id || null,
      quantity: payload.quantity || payload.amount || null,
      targetPlayerId: payload.targetPlayerId || payload.playerId || null
    });
    const existing = this.db.prepare("SELECT * FROM operation_idempotency WHERE operation_id = ? LIMIT 1").get(operationId);
    if (existing) {
      if (existing.status === "completed") {
        return Object.assign({ idempotent: true }, safeJsonParse(existing.result_json, { ok: true, operationId }));
      }
      const error = new Error("Deze NODE-05 actie is al in verwerking.");
      error.status = 409;
      throw error;
    }

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`
        INSERT INTO operation_idempotency (operation_id, player_id, operation_type, request_hash, status, created_at)
        VALUES (?, ?, ?, ?, 'started', ?)
      `).run(operationId, ctx.profile.id, action || "unknown", hash, now());
      this.ensureRuntime(ctx);
      const result = this.performAction(ctx, action, payload, operationId);
      const response = Object.assign({ ok: true, operationId }, result, { snapshot: this.buildSnapshot(ctx) });
      this.db.prepare(`
        UPDATE operation_idempotency
        SET status = 'completed', result_json = ?, completed_at = ?
        WHERE operation_id = ?
      `).run(stableJson(response), now(), operationId);
      this.db.exec("COMMIT");
      return response;
    } catch (error) {
      try {
        this.db.prepare(`
          UPDATE operation_idempotency
          SET status = 'failed', result_json = ?, completed_at = ?
          WHERE operation_id = ?
        `).run(stableJson({ ok: false, message: error.message }), now(), operationId);
      } catch {}
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  performAction(ctx, action, payload, operationId) {
    if (action === "craft" || action === "crafting:start") return this.startCraft(ctx, payload, operationId);
    if (action === "crafting:claim" || action === "claim_craft_job") return this.claimCraftingJob(ctx, payload, operationId);
    if (action === "vendor_buy" || action === "vendor:buy") return this.vendorBuy(ctx, payload, operationId);
    if (action === "vendor_sell" || action === "vendor:sell") return this.vendorSell(ctx, payload, operationId);
    if (action === "party_create" || action === "party:create") return this.createParty(ctx, operationId);
    if (action === "party_leave" || action === "party:leave") return this.leaveParty(ctx, operationId);
    if (action === "party_invite" || action === "party:invite") return this.inviteToParty(ctx, payload, operationId);
    if (action === "party_accept" || action === "party:accept_invite") return this.acceptPartyInvite(ctx, payload, operationId);
    if (action === "market_list" || action === "market:create") return this.createMarketOrder(ctx, payload, operationId);
    if (action === "market_buy" || action === "market:buy") return this.buyMarketOrder(ctx, payload, operationId);
    if (action === "market_cancel" || action === "market:cancel") return this.cancelMarketOrder(ctx, payload, operationId);
    if (action === "mail_claim" || action === "mail:claim") return this.claimMail(ctx, payload, operationId);
    if (action === "mail_claim_all" || action === "mail:claim_all") return this.claimAllMail(ctx, operationId);
    if (action === "reset_node05") return this.resetNode05(ctx, operationId);
    const error = new Error("Onbekende NODE-05 actie: " + (action || "-"));
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

  craftingStations(ctx) {
    return connectedComponents(ctx.zonePackage).filter(function (component) {
      return component.nodeType === "crafting_station_component";
    }).map(function (component) {
      return positionedComponent(ctx, component);
    });
  }

  vendors(ctx) {
    return connectedComponents(ctx.zonePackage).filter(function (component) {
      return component.nodeType === "vendor_component";
    }).map(function (component) {
      return positionedComponent(ctx, component);
    });
  }

  marketAccesses(ctx) {
    return connectedComponents(ctx.zonePackage).filter(function (component) {
      return component.nodeType === "marketplace_access_component";
    }).map(function (component) {
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
    return {
      recipeId: recipe.id,
      displayName: recipe.displayName || recipe.id,
      description: recipe.description || "",
      category: recipe.category || "",
      stationId: station?.stationId || null,
      stationType: recipe.stationType || null,
      craftDurationMs: safeInteger(recipe.craftDurationMs, 0),
      unlocked: this.recipeUnlocked(ctx, recipe),
      canCraft: ingredients.every(function (entry) { return entry.enough; }) && this.recipeUnlocked(ctx, recipe) && (!station || station.inRange === true),
      ingredients,
      outputs: outputItems.map(function (entry) {
        return { kind: "item", itemId: entry.itemRef, displayName: displayForItem(ctx.catalogs, entry.itemRef), amount: normalizeQuantity(entry.amount, 1) };
      }).concat(outputCurrencies.map(function (entry) {
        return { kind: "currency", currencyId: entry.currencyRef, displayName: displayForCurrency(ctx.catalogs, entry.currencyRef), amountMinor: safeInteger(entry.amountMinor, 0) };
      }))
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
        offers
      });
    });
    return {
      policy: firstPolicy(ctx.project, "vendor_policy", null),
      vendors
    };
  }

  vendorOfferSummary(ctx, vendor, offer) {
    const item = catalogSection(ctx.catalogs, "items")[offer.itemRef] || {};
    const sellCurrencyId = offer.sellCurrencyRef || item.vendorCurrencyRef || "currency.gold";
    const buyCurrencyId = offer.buyCurrencyRef || item.vendorCurrencyRef || sellCurrencyId;
    const owned = this.itemCount(ctx.profile.id, offer.itemRef);
    const funds = this.currencyAmount(ctx.profile.id, sellCurrencyId);
    const sellPrice = Math.max(0, safeInteger(offer.sellPriceMinor, 0));
    const buyPrice = Math.max(0, safeInteger(offer.buyPriceMinor || item.vendorBaseValueMinor, 0));
    const stock = this.offerStock(vendor, offer);
    return Object.assign({}, offer, {
      displayName: displayForItem(ctx.catalogs, offer.itemRef),
      sellCurrencyRef: sellCurrencyId,
      buyCurrencyRef: buyCurrencyId,
      sellPriceMinor: sellPrice,
      buyPriceMinor: buyPrice,
      owned,
      stock,
      canBuy: vendor.inRange === true && ["sell_to_player", "both"].includes(offer.mode) && funds >= sellPrice && (stock === null || stock > 0),
      canSell: vendor.inRange === true && ["buy_from_player", "both"].includes(offer.mode) && owned > 0 && buyPrice > 0 && itemIsTradable(item)
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
      SELECT pm.*, p.leader_player_id, p.loot_policy_id, p.revision, p.created_at, p.updated_at
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
      role: membership.role,
      revision: safeInteger(membership.revision, 1),
      members
    };
  }

  buildTradeSnapshot(ctx) {
    const sessions = this.db.prepare(`
      SELECT *
      FROM direct_trade_sessions
      WHERE (player_a_id = ? OR player_b_id = ?)
        AND state NOT IN ('completed', 'cancelled', 'expired', 'failed')
      ORDER BY updated_at DESC
      LIMIT 3
    `).all(ctx.profile.id, ctx.profile.id).map(function (row) {
      return {
        tradeId: row.id,
        playerAId: row.player_a_id,
        playerBId: row.player_b_id,
        state: row.state,
        revision: safeInteger(row.revision, 1),
        expiresAt: row.expires_at
      };
    });
    return {
      policy: firstPolicy(ctx.project, "trade_policy", null),
      sessions,
      message: sessions.length ? "" : "Direct trade UI-basis staat klaar; volledige offer/confirm flow volgt als aparte verdieping."
    };
  }

  buildMarketSnapshot(ctx) {
    const policy = firstPolicy(ctx.project, "market_policy", null);
    const accesses = this.marketAccesses(ctx);
    const orders = this.loadMarketOrders(ctx, false);
    const myOrders = this.loadMarketOrders(ctx, true);
    const sellableItems = this.sellableMarketItems(ctx);
    return {
      policy,
      accesses,
      orders,
      myOrders,
      sellableItems
    };
  }

  loadMarketOrders(ctx, mineOnly) {
    const rows = mineOnly
      ? this.db.prepare(`
        SELECT o.*, pp.display_name AS seller_name
        FROM market_orders o
        LEFT JOIN player_profiles pp ON pp.id = o.seller_player_id
        WHERE o.seller_player_id = ? AND o.status IN ('active', 'partially_filled')
        ORDER BY o.created_at DESC
        LIMIT 8
      `).all(ctx.profile.id)
      : this.db.prepare(`
        SELECT o.*, pp.display_name AS seller_name
        FROM market_orders o
        LEFT JOIN player_profiles pp ON pp.id = o.seller_player_id
        WHERE o.status IN ('active', 'partially_filled')
        ORDER BY o.created_at DESC
        LIMIT 8
      `).all();
    return rows.map((row) => ({
      orderId: row.id,
      sellerPlayerId: row.seller_player_id,
      sellerName: row.seller_name || row.seller_player_id,
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

  sellableMarketItems(ctx) {
    return this.db.prepare(`
      SELECT * FROM player_inventory_stacks
      WHERE player_id = ? AND quantity > 0
      ORDER BY updated_at DESC
      LIMIT 12
    `).all(ctx.profile.id).map((row) => {
      const item = catalogSection(ctx.catalogs, "items")[row.item_id] || {};
      const eligible = item.marketEligible === true && itemIsTradable(item);
      return {
        stackId: row.stack_id,
        itemId: row.item_id,
        displayName: displayForItem(ctx.catalogs, row.item_id),
        quantity: safeInteger(row.quantity, 0),
        bindState: row.bind_state,
        marketEligible: eligible,
        suggestedPriceMinor: Math.max(1, safeInteger(item.vendorBaseValueMinor, 1) * 3)
      };
    }).filter(function (entry) {
      return entry.marketEligible;
    });
  }

  buildMailSnapshot(ctx) {
    const messages = this.db.prepare(`
      SELECT *
      FROM player_mail
      WHERE player_id = ? AND state IN ('unread', 'read', 'partially_claimed')
      ORDER BY created_at DESC
      LIMIT 8
    `).all(ctx.profile.id).map((row) => {
      const attachments = this.db.prepare(`
        SELECT *
        FROM player_mail_attachments
        WHERE mail_id = ?
        ORDER BY id ASC
      `).all(row.id).map((attachment) => ({
        attachmentId: attachment.id,
        kind: attachment.asset_kind,
        assetId: attachment.asset_id,
        displayName: attachment.asset_kind === "currency" ? displayForCurrency(ctx.catalogs, attachment.asset_id) : displayForItem(ctx.catalogs, attachment.asset_id),
        quantityMinor: safeInteger(attachment.quantity_minor, 0),
        state: attachment.state
      }));
      return {
        mailId: row.id,
        mailType: row.mail_type,
        subject: row.subject,
        body: row.body,
        state: row.state,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        attachments,
        canClaim: attachments.some(function (attachment) { return attachment.state === "available"; })
      };
    });
    return {
      policy: firstPolicy(ctx.project, "mail_policy", null),
      unreadCount: messages.filter(function (message) { return message.state === "unread"; }).length,
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

  findMarketAccess(ctx) {
    return this.marketAccesses(ctx).find(function (access) {
      return access.remoteAccessAllowed === true || access.inRange === true;
    }) || this.marketAccesses(ctx)[0] || null;
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
    const summary = this.vendorOfferSummary(ctx, vendor, offer);
    const total = summary.sellPriceMinor * quantity;
    this.spendCurrency(ctx, summary.sellCurrencyRef, total, "vendor_buy", offer.offerId, operationId);
    this.decrementVendorStock(vendor, offer, quantity);
    const grants = this.node03RuntimeService.grantItem(ctx, offer.itemRef, quantity, "vendor_buy", vendor.vendorId, operationId);
    this.node03RuntimeService.recordGameplayEvent(ctx, "vendor_buy", "player", vendor.vendorId, { offerId: offer.offerId, quantity, total });
    return { action: "vendor_buy", grants, message: "Gekocht: " + displayForItem(ctx.catalogs, offer.itemRef) + "." };
  }

  vendorSell(ctx, payload, operationId) {
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
    if (!offer || !["buy_from_player", "both"].includes(offer.mode)) {
      const error = new Error("Vendor koopt dit item niet.");
      error.status = 404;
      throw error;
    }
    const quantity = normalizeQuantity(payload.quantity, 1);
    const summary = this.vendorOfferSummary(ctx, vendor, offer);
    this.removeItem(ctx, offer.itemRef, quantity, "vendor_sell", vendor.vendorId, operationId);
    const grant = this.node03RuntimeService.grantCurrency(ctx, summary.buyCurrencyRef, summary.buyPriceMinor * quantity, "vendor_sell", offer.offerId, operationId);
    this.node03RuntimeService.recordGameplayEvent(ctx, "vendor_sell", "player", vendor.vendorId, { offerId: offer.offerId, quantity });
    return { action: "vendor_sell", grants: [grant].filter(Boolean), message: "Verkocht: " + displayForItem(ctx.catalogs, offer.itemRef) + "." };
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

  createParty(ctx, operationId) {
    const existing = this.activePartyForPlayer(ctx.profile.id);
    if (existing) return { action: "party_create", party: existing, message: "Je zit al in een party." };
    const policy = firstPolicy(ctx.project, "party_rules", {});
    const lootPolicy = firstPolicy(ctx.project, "party_loot_policy", {});
    const partyId = randomId("party");
    const stamp = now();
    this.db.prepare(`
      INSERT INTO parties (id, leader_player_id, loot_policy_id, revision, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `).run(partyId, ctx.profile.id, lootPolicy.policyId || policy.partyLootPolicyRef || "policy.party_loot.personal", stamp, stamp);
    this.db.prepare(`
      INSERT INTO party_members (party_id, player_id, role, joined_at, contribution_json)
      VALUES (?, ?, 'leader', ?, '{}')
    `).run(partyId, ctx.profile.id, stamp);
    this.node03RuntimeService.recordGameplayEvent(ctx, "party_created", "player", partyId, {});
    return { action: "party_create", party: this.activePartyForPlayer(ctx.profile.id), message: "Party aangemaakt." };
  }

  leaveParty(ctx, operationId) {
    const party = this.activePartyForPlayer(ctx.profile.id);
    if (!party) return { action: "party_leave", message: "Je zit niet in een party." };
    const stamp = now();
    this.db.prepare("UPDATE party_members SET left_at = ? WHERE party_id = ? AND player_id = ? AND left_at IS NULL")
      .run(stamp, party.partyId, ctx.profile.id);
    const remaining = this.db.prepare("SELECT COUNT(*) AS count FROM party_members WHERE party_id = ? AND left_at IS NULL")
      .get(party.partyId);
    if (safeInteger(remaining?.count, 0) <= 0) {
      this.db.prepare("UPDATE parties SET disbanded_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ?")
        .run(stamp, stamp, party.partyId);
    } else if (party.leaderPlayerId === ctx.profile.id) {
      const nextLeader = this.db.prepare("SELECT player_id FROM party_members WHERE party_id = ? AND left_at IS NULL ORDER BY joined_at ASC LIMIT 1")
        .get(party.partyId);
      if (nextLeader?.player_id) {
        this.db.prepare("UPDATE party_members SET role = CASE WHEN player_id = ? THEN 'leader' ELSE 'member' END WHERE party_id = ? AND left_at IS NULL")
          .run(nextLeader.player_id, party.partyId);
        this.db.prepare("UPDATE parties SET leader_player_id = ?, updated_at = ?, revision = revision + 1 WHERE id = ?")
          .run(nextLeader.player_id, stamp, party.partyId);
      }
    }
    this.node03RuntimeService.recordGameplayEvent(ctx, "party_left", "player", party.partyId, {});
    return { action: "party_leave", message: "Party verlaten." };
  }

  inviteToParty(ctx, payload, operationId) {
    const targetPlayerId = safeString(payload.targetPlayerId || payload.playerId || payload.player_id, "");
    if (!targetPlayerId || targetPlayerId === ctx.profile.id) {
      const error = new Error("Kies een andere speler om uit te nodigen.");
      error.status = 400;
      throw error;
    }
    const target = this.db.prepare("SELECT * FROM player_profiles WHERE id = ? LIMIT 1").get(targetPlayerId);
    if (!target) {
      const error = new Error("Speler niet gevonden.");
      error.status = 404;
      throw error;
    }
    let party = this.activePartyForPlayer(ctx.profile.id);
    if (!party) {
      this.createParty(ctx, operationId + ":create_party");
      party = this.activePartyForPlayer(ctx.profile.id);
    }
    if (!party || party.leaderPlayerId !== ctx.profile.id) {
      const error = new Error("Alleen de party leader kan uitnodigen.");
      error.status = 403;
      throw error;
    }
    const policy = firstPolicy(ctx.project, "party_rules", {});
    const expiresAt = addSeconds(safeInteger(policy.inviteTimeoutSeconds, 120));
    const inviteId = randomId("party_invite");
    this.db.prepare(`
      INSERT INTO party_invites (id, party_id, inviter_player_id, invitee_player_id, status, created_at, expires_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `).run(inviteId, party.partyId, ctx.profile.id, targetPlayerId, now(), expiresAt);
    return { action: "party_invite", inviteId, message: "Party invite verstuurd naar " + (target.display_name || targetPlayerId) + "." };
  }

  acceptPartyInvite(ctx, payload, operationId) {
    const inviteId = safeString(payload.inviteId || payload.invite_id, "");
    const row = inviteId
      ? this.db.prepare("SELECT * FROM party_invites WHERE id = ? AND invitee_player_id = ? LIMIT 1").get(inviteId, ctx.profile.id)
      : this.db.prepare("SELECT * FROM party_invites WHERE invitee_player_id = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at DESC LIMIT 1").get(ctx.profile.id, now());
    if (!row || row.status !== "pending" || Date.parse(row.expires_at) <= Date.now()) {
      const error = new Error("Party invite is niet geldig.");
      error.status = 404;
      throw error;
    }
    const existing = this.activePartyForPlayer(ctx.profile.id);
    if (existing) {
      const error = new Error("Je zit al in een party.");
      error.status = 409;
      throw error;
    }
    this.db.prepare("UPDATE party_invites SET status = 'accepted', responded_at = ? WHERE id = ?").run(now(), row.id);
    this.db.prepare(`
      INSERT INTO party_members (party_id, player_id, role, joined_at, contribution_json)
      VALUES (?, ?, 'member', ?, '{}')
    `).run(row.party_id, ctx.profile.id, now());
    this.db.prepare("UPDATE parties SET updated_at = ?, revision = revision + 1 WHERE id = ?").run(now(), row.party_id);
    return { action: "party_accept", party: this.activePartyForPlayer(ctx.profile.id), message: "Party invite geaccepteerd." };
  }

  createMarketOrder(ctx, payload, operationId) {
    const access = this.findMarketAccess(ctx);
    if (!access) {
      const error = new Error("Marketplace access niet gevonden.");
      error.status = 404;
      throw error;
    }
    if (access.remoteAccessAllowed !== true) this.assertInRange(access, "Marketplace");
    const itemId = safeString(payload.itemId || payload.item_id, "");
    const quantity = normalizeQuantity(payload.quantity, 1);
    const item = catalogSection(ctx.catalogs, "items")[itemId] || null;
    if (!item || item.marketEligible !== true || !itemIsTradable(item)) {
      const error = new Error("Item mag niet op de market.");
      error.status = 400;
      throw error;
    }
    const policy = firstPolicy(ctx.project, "market_policy", {});
    const currencyId = safeString(payload.currencyId || payload.currency_id || (Array.isArray(policy.allowedCurrencyRefs) ? policy.allowedCurrencyRefs[0] : "") || item.vendorCurrencyRef || "currency.gold", "currency.gold");
    const unitPrice = Math.max(safeInteger(policy.minimumPriceMinor, 1), safeInteger(payload.unitPriceMinor || payload.unit_price_minor, Math.max(1, safeInteger(item.vendorBaseValueMinor, 1) * 3)));
    const durationSeconds = safeInteger(payload.durationSeconds || payload.duration_seconds, safeInteger(policy.defaultDurationSeconds, 86400));
    this.removeItem(ctx, itemId, quantity, "market_listing_escrow", access.marketAccessId, operationId);
    const orderId = randomId("market_order");
    const stamp = now();
    this.db.prepare(`
      INSERT INTO market_orders (id, seller_player_id, item_kind, item_id, item_instance_id, quantity_total, quantity_remaining, currency_id, unit_price_minor, status, created_at, expires_at, updated_at, metadata_json)
      VALUES (?, ?, 'item_stack', ?, NULL, ?, ?, ?, ?, 'active', ?, ?, ?, ?)
    `).run(orderId, ctx.profile.id, itemId, quantity, quantity, currencyId, unitPrice, stamp, addSeconds(durationSeconds), stamp, stableJson({ marketAccessId: access.marketAccessId }));
    this.db.prepare(`
      INSERT INTO asset_reservations (id, owner_player_id, reservation_kind, reservation_ref, asset_kind, asset_id, quantity_minor, status, created_at, expires_at)
      VALUES (?, ?, 'market', ?, 'item_stack', ?, ?, 'active', ?, ?)
    `).run(randomId("reservation"), ctx.profile.id, orderId, itemId, quantity, stamp, addSeconds(durationSeconds));
    return { action: "market_list", orderId, message: "Listing aangemaakt: " + displayForItem(ctx.catalogs, itemId) + "." };
  }

  buyMarketOrder(ctx, payload, operationId) {
    const access = this.findMarketAccess(ctx);
    if (!access) {
      const error = new Error("Marketplace access niet gevonden.");
      error.status = 404;
      throw error;
    }
    if (access.remoteAccessAllowed !== true) this.assertInRange(access, "Marketplace");
    const orderId = safeString(payload.orderId || payload.order_id, "");
    const order = this.db.prepare("SELECT * FROM market_orders WHERE id = ? LIMIT 1").get(orderId);
    if (!order || !["active", "partially_filled"].includes(order.status)) {
      const error = new Error("Market order is niet actief.");
      error.status = 404;
      throw error;
    }
    if (Date.parse(order.expires_at) <= Date.now()) {
      const error = new Error("Market order is verlopen.");
      error.status = 409;
      throw error;
    }
    if (order.seller_player_id === ctx.profile.id) {
      const error = new Error("Je kunt je eigen listing niet kopen.");
      error.status = 400;
      throw error;
    }
    const quantity = Math.min(normalizeQuantity(payload.quantity, 1), safeInteger(order.quantity_remaining, 0));
    if (quantity <= 0) {
      const error = new Error("Market order heeft geen quantity meer.");
      error.status = 409;
      throw error;
    }
    const gross = safeInteger(order.unit_price_minor, 0) * quantity;
    this.spendCurrency(ctx, order.currency_id, gross, "market_buy", order.id, operationId);
    const policy = firstPolicy(ctx.project, "market_policy", {});
    const tax = Math.floor(gross * clamp(safeInteger(policy.saleTaxBasisPoints, 0), 0, 10000) / 10000);
    const sellerAmount = Math.max(0, gross - tax);
    this.node03RuntimeService.grantItem(ctx, order.item_id, quantity, "market_buy", order.id, operationId);
    this.creditMarketSeller(ctx, order.seller_player_id, order.currency_id, sellerAmount, order, operationId);
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
    return { action: "market_buy", orderId: order.id, message: "Market aankoop voltooid: " + displayForItem(ctx.catalogs, order.item_id) + "." };
  }

  creditMarketSeller(ctx, sellerPlayerId, currencyId, amount, order, operationId) {
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
    this.createSystemMail(sellerPlayerId, "market_sale", "Market sale", "Je market verkoop is betaald.", [
      { kind: "currency", assetId: currencyId, quantityMinor: amount }
    ], order.id);
  }

  cancelMarketOrder(ctx, payload, operationId) {
    const orderId = safeString(payload.orderId || payload.order_id, "");
    const order = this.db.prepare("SELECT * FROM market_orders WHERE id = ? LIMIT 1").get(orderId);
    if (!order || !["active", "partially_filled"].includes(order.status) || order.seller_player_id !== ctx.profile.id) {
      const error = new Error("Market order kan niet geannuleerd worden.");
      error.status = 404;
      throw error;
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
    return { action: "market_cancel", orderId: order.id, message: "Listing geannuleerd en item teruggezet." };
  }

  createSystemMail(playerId, type, subject, body, attachments, sourceRef = null) {
    const mailId = randomId("mail");
    const stamp = now();
    this.db.prepare(`
      INSERT INTO player_mail (id, player_id, mail_type, subject, body, state, source_ref, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, 'unread', ?, ?, ?)
    `).run(mailId, playerId, type, subject, body, sourceRef, stamp, addDays(30));
    for (const attachment of attachments || []) {
      this.db.prepare(`
        INSERT INTO player_mail_attachments (id, mail_id, asset_kind, asset_id, quantity_minor, payload_json, state)
        VALUES (?, ?, ?, ?, ?, '{}', 'available')
      `).run(randomId("mail_attachment"), mailId, attachment.kind, attachment.assetId, normalizeQuantity(attachment.quantityMinor, 1));
    }
    return mailId;
  }

  claimMail(ctx, payload, operationId) {
    const mailId = safeString(payload.mailId || payload.mail_id, "");
    const mail = this.db.prepare("SELECT * FROM player_mail WHERE id = ? AND player_id = ? LIMIT 1").get(mailId, ctx.profile.id);
    if (!mail) {
      const error = new Error("Mail niet gevonden.");
      error.status = 404;
      throw error;
    }
    return this.claimMailRow(ctx, mail, operationId);
  }

  claimAllMail(ctx, operationId) {
    const rows = this.db.prepare(`
      SELECT *
      FROM player_mail
      WHERE player_id = ? AND state IN ('unread', 'read', 'partially_claimed')
      ORDER BY created_at ASC
      LIMIT 50
    `).all(ctx.profile.id);
    const grants = [];
    for (const row of rows) {
      const result = this.claimMailRow(ctx, row, operationId + ":" + row.id);
      grants.push.apply(grants, result.grants || []);
    }
    return { action: "mail_claim_all", grants, message: grants.length ? "Alle mail attachments geclaimed." : "Geen mail attachments om te claimen." };
  }

  claimMailRow(ctx, mail, operationId) {
    const attachments = this.db.prepare("SELECT * FROM player_mail_attachments WHERE mail_id = ? AND state = 'available'").all(mail.id);
    const grants = [];
    for (const attachment of attachments) {
      if (attachment.asset_kind === "currency") {
        const grant = this.node03RuntimeService.grantCurrency(ctx, attachment.asset_id, safeInteger(attachment.quantity_minor, 0), "mail_claim", mail.id, operationId);
        if (grant) grants.push(grant);
      } else {
        grants.push.apply(grants, this.node03RuntimeService.grantItem(ctx, attachment.asset_id, safeInteger(attachment.quantity_minor, 1), "mail_claim", mail.id, operationId));
      }
      this.db.prepare("UPDATE player_mail_attachments SET state = 'claimed', claimed_operation_id = ?, claimed_at = ? WHERE id = ?")
        .run(operationId, now(), attachment.id);
    }
    this.db.prepare("UPDATE player_mail SET state = 'claimed', claimed_at = ?, revision = revision + 1 WHERE id = ?")
      .run(now(), mail.id);
    return { action: "mail_claim", mailId: mail.id, grants, message: grants.length ? "Mail geclaimed." : "Mail had geen beschikbare attachments." };
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
    return { action: "reset_node05", message: "NODE-05 runtime state reset." };
  }

  currencyAmount(playerId, currencyId) {
    const row = this.db.prepare("SELECT amount_minor FROM player_currencies WHERE player_id = ? AND currency_id = ? LIMIT 1")
      .get(playerId, currencyId);
    return safeInteger(row?.amount_minor, 0);
  }

  itemCount(playerId, itemId) {
    return this.node03RuntimeService.ownedItemCount(playerId, itemId);
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
