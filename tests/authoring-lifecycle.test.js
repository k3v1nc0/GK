// Fase 03 (F3-E3-T08): hele levenscyclus zonder server.
// verhuisrapport -> finalize per domein -> Nodes alleen-lezen -> bewerken -> publiceren -> mislukte publish
// -> rollback -> backup + restore met builds. Steeds gecontroleerd met de runtimevorm die node03 echt gebruikt.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { backup, DatabaseSync } from "node:sqlite";
import { CommandService } from "../src/server/authoring/command-service.js";
import { BuildService } from "../src/server/authoring/build-service.js";
import { CutoverGuard } from "../src/server/authoring/cutover-guard.js";
import { cutoverRows, finalizeDomain, planDomain } from "../src/server/authoring/legacy-import.js";
import { applyCanonicalBuild } from "../src/server/authoring/runtime-overlay.js";
import { GraphRepository } from "../src/server/graph-repository.js";
import { Node03RuntimeService } from "../src/server/node03-runtime-service.js";
import { createDatabaseBackup, verifyBackup } from "../src/server/backup-service.js";
import { restoreDatabaseBackup } from "../src/server/restore-service.js";
import { createMigrationDatabase } from "./fixtures.js";

const fixture = () => JSON.parse(fs.readFileSync("tests/fixtures/runtime-compat.json", "utf8"));
let seq = 0;
const rid = () => "req-life-" + String(seq++).padStart(4, "0");

function pickupStates(world) {
  const states = {};
  const pkg = world.gameProject.zones.packages[0];
  for (const controller of pkg.spawnControllers) {
    for (const set of controller.spawnSets) {
      for (const spawn of set.spawns) {
        const state = Node03RuntimeService.prototype.desiredPickupForSpawn.call({}, { zoneId: pkg.zoneId, catalogs: world.gameProject.catalogs }, controller, set, spawn);
        delete state.updatedAt;
        // Ronde 10: de grootte op de grond komt bewust uit Canoniek (standaard 100 %), niet meer vast 45 %.
        delete state.modelScale;
        states[state.instanceId] = state;
      }
    }
  }
  return states;
}

function setup() {
  const db = createMigrationDatabase();
  db.exec(fs.readFileSync("db/migrations/012_authoring_core.sql", "utf8"));
  db.exec(fs.readFileSync("db/migrations/013_builds.sql", "utf8"));
  const stamp = "2026-10-25T00:00:00.000Z";
  const insertNode = db.prepare("INSERT INTO editor_nodes (id, type, title, x, y, parent_id, values_json, created_at, updated_at) VALUES (?, ?, ?, 0, 0, NULL, ?, ?, ?)");
  insertNode.run("n-item", "item_definition", "Golden Pickup", JSON.stringify({ itemId: "item.golden.pickup", displayName: "Golden Pickup" }), stamp, stamp);
  insertNode.run("n-pickup", "pickup_spawn", "Pickup", JSON.stringify({ spawnEntryId: "spawn.golden.pickup", pickupKind: "item", itemRef: "item.golden.pickup", amount: 1 }), stamp, stamp);
  insertNode.run("n-coins", "pickup_spawn", "Coins", JSON.stringify({ spawnEntryId: "spawn.golden.coins", pickupKind: "currency", currencyRef: "currency.gold", minAmount: 2, maxAmount: 4 }), stamp, stamp);
  const repository = new GraphRepository(db);
  repository.setWriteGuard(new CutoverGuard(db));
  const buildsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gk-life-builds-"));
  const commands = new CommandService(db);
  const builds = new BuildService(db, { buildsRoot });
  return { db, repository, commands, builds, buildsRoot };
}

const finalize = (ctx, world, domain, extra = {}) => finalizeDomain(ctx.db, Object.assign({
  world, domain, expectedGraphRevision: ctx.repository.getGraphRevision(), worldGraphRevision: ctx.repository.getGraphRevision(),
  existingDocs: ctx.commands.documents.allDocuments(), actor: "kevin"
}, extra));

test("verhuizen: rapport, volgorde, graphrevisie-race, parity per consumer en idempotent", function () {
  const ctx = setup();
  const world = fixture();
  const rows = () => cutoverRows(ctx.db);

  const pickupsFirst = planDomain(world, "pickups", [], rows());
  assert.match(pickupsFirst.blocking[0].reason, /eerst Items/);

  const projectPlan = planDomain(world, "project", [], rows());
  assert.equal(projectPlan.ok, true);
  finalize(ctx, world, "project");
  assert.throws(() => finalize(ctx, world, "project"), { code: "ALREADY_CANONICAL" });

  // Race: de graph verandert tussen rapport en finalize -> geweigerd, niets geschreven.
  const staleRevision = ctx.repository.getGraphRevision();
  ctx.repository.updateNodeValues("n-coins", { maxAmount: 5 }, { returnGraph: false });
  assert.throws(() => finalize(ctx, world, "items", { expectedGraphRevision: staleRevision, worldGraphRevision: staleRevision }), { code: "GRAPH_REVISION_CHANGED" });
  assert.equal(ctx.commands.documents.get("item_definition:item.golden.pickup"), null);

  const itemsPlan = planDomain(world, "items", ctx.commands.documents.allDocuments(), rows());
  assert.equal(itemsPlan.ok, true, JSON.stringify(itemsPlan.blocking.concat(itemsPlan.parity.filter((entry) => entry.diffs.length))));
  assert.equal(itemsPlan.comparedObjects, 2);
  assert.ok(itemsPlan.parity.find((entry) => entry.legacyRef === "items:item.golden.pickup").frozenLegacyKeys.length >= 0);
  finalize(ctx, world, "items");

  const pickupsPlan = planDomain(world, "pickups", ctx.commands.documents.allDocuments(), rows());
  assert.equal(pickupsPlan.ok, true, JSON.stringify(pickupsPlan.parity));
  assert.equal(pickupsPlan.create.length, 1, "alleen de item-pickup; geld-pickup blijft in Nodes");
  assert.equal(pickupsPlan.comparedObjects, 1);
  const result = finalize(ctx, world, "pickups");
  assert.deepEqual(result.created, ["pickup:legacy.spawn.golden.pickup"]);
  assert.deepEqual(Object.values(rows()).map((row) => row.writer), ["canonical", "canonical", "canonical"]);

  // Nodes is nu alleen-lezen voor verhuisde objecten; de geld-pickup niet.
  assert.throws(() => ctx.repository.updateNodeValues("n-item", { displayName: "X" }, { returnGraph: false }), { code: "CANONICAL_OWNED" });
  assert.throws(() => ctx.repository.updateNodeValues("n-pickup", { amount: 9 }, { returnGraph: false }), { code: "CANONICAL_OWNED" });
  assert.throws(() => ctx.repository.createNode("item_definition", { x: 0, y: 0 }, {}), { code: "CANONICAL_DOMAIN" });
  assert.throws(() => ctx.repository.createNode("pickup_spawn", { x: 0, y: 0 }, { pickupKind: "item" }), { code: "CANONICAL_DOMAIN" });
  assert.throws(() => ctx.repository.updateNodeValues("n-coins", { pickupKind: "item" }, { returnGraph: false }), { code: "CANONICAL_DOMAIN" });
  ctx.repository.updateNodeValues("n-coins", { maxAmount: 6 }, { returnGraph: false });

  // Na publish is de runtimevorm van de overgenomen pickup exact gelijk (zelfde instance-ID en waarden).
  ctx.builds.publish("kevin", { knownZoneIds: ["zone.golden"], knownRespawnPolicyIds: ["respawn_policy.quick"] });
  const before = pickupStates(world);
  const after = pickupStates(applyCanonicalBuild(world, ctx.builds.activeServerBuild()));
  assert.deepEqual(after, before);
  // null en "ontbreekt" betekenen voor de consumers hetzelfde (item.iconAssetId || null).
  // Ronde 10: worldModelScale komt bewust uit Canoniek (Grootte op de grond, standaard 100 %).
  const withoutNulls = (items) => JSON.parse(JSON.stringify(items, (key, value) => (value === null || key === "worldModelScale" ? undefined : value)));
  assert.deepEqual(withoutNulls(applyCanonicalBuild(world, ctx.builds.activeServerBuild()).gameProject.catalogs.items), withoutNulls(world.gameProject.catalogs.items));
});

test("parity blokkeert afwijkingen tenzij Kevin ze expliciet accepteert; ongeldige legacy blokkeert altijd", function () {
  const ctx = setup();
  const world = fixture();
  ctx.commands.execute({ requestId: rid(), command: "create", kind: "item_definition", body: { itemId: "item.golden.proof", displayName: "Ander bewijs", category: "quest", rarity: "common", stackable: false, stackLimit: 1, tags: ["item", "golden"], vendorValue: 0 } }, "kevin");
  const plan = planDomain(world, "items", ctx.commands.documents.allDocuments(), {});
  assert.equal(plan.diffCount, 1);
  assert.deepEqual(plan.parity.find((entry) => entry.diffs.length).diffs.map((diff) => diff.key), ["displayName"]);
  assert.throws(() => finalize(ctx, world, "items"), { code: "PARITY_DIFF" });
  const accepted = finalize(ctx, world, "items", { acceptDiffs: true });
  assert.equal(accepted.acceptedDiffs, 1);
  const report = JSON.parse(ctx.db.prepare("SELECT report_json FROM authoring_cutover WHERE domain = 'items'").get().report_json);
  assert.equal(report.acceptedDiffs, true);

  const broken = fixture();
  broken.gameProject.catalogs.items["Item-Raar"] = { id: "Item-Raar", displayName: "Raar", category: "material", rarity: "common", stackLimit: 1 };
  broken.gameProject.catalogs.items["item.vreemd"] = { id: "item.vreemd", displayName: "Vreemd", category: "zwaard", rarity: "common", stackLimit: 1 };
  const brokenPlan = planDomain(broken, "items", [], {});
  assert.equal(brokenPlan.blocking.length, 2);
});

test("na verhuizen: bewerken, verwijderen, mislukte publish, rollback en backup/restore met builds", async function () {
  const ctx = setup();
  const world = fixture();
  for (const domain of ["project", "items", "pickups"]) finalize(ctx, world, domain);
  const first = ctx.builds.publish("kevin", { knownZoneIds: ["zone.golden"] });
  const instanceId = "node03:zone.golden:spawn.golden.pickup:pickup";

  // Kevin verplaatst de pickup en hernoemt het item in Canoniek.
  const pickupDoc = ctx.commands.documents.get("pickup:legacy.spawn.golden.pickup");
  ctx.commands.execute({ requestId: rid(), command: "update", docKey: pickupDoc.docKey, expectedRevision: 1, body: Object.assign({}, pickupDoc.body, { x: 30, z: 40 }) }, "kevin");
  const itemDoc = ctx.commands.documents.get("item_definition:item.golden.pickup");
  ctx.commands.execute({ requestId: rid(), command: "update", docKey: itemDoc.docKey, expectedRevision: 1, body: Object.assign({}, itemDoc.body, { displayName: "Gouden Steen" }) }, "kevin");
  const second = ctx.builds.publish("kevin", { knownZoneIds: ["zone.golden"] });
  let live = pickupStates(applyCanonicalBuild(world, ctx.builds.activeServerBuild()));
  assert.deepEqual([live[instanceId].x, live[instanceId].z, live[instanceId].displayName], [30, 40, "Gouden Steen"], "zelfde instance, claimstatus blijft");

  // Verwijderen in Canoniek: de legacy-pickup komt niet stil terug.
  ctx.commands.execute({ requestId: rid(), command: "archive", docKey: pickupDoc.docKey, expectedRevision: 2 }, "kevin");
  ctx.builds.publish("kevin", { knownZoneIds: ["zone.golden"] });
  live = pickupStates(applyCanonicalBuild(world, ctx.builds.activeServerBuild()));
  assert.equal(live[instanceId], undefined);
  assert.ok(live["node03:zone.golden:spawn.golden.coins:pickup"], "geld-pickup uit Nodes blijft");

  // Mislukte publish laat de pointer staan; rollback zet de eerdere build terug.
  ctx.commands.execute({ requestId: rid(), command: "restore", docKey: pickupDoc.docKey, expectedRevision: 3 }, "kevin");
  const activeBefore = ctx.builds.release().activeBuildId;
  assert.throws(() => ctx.builds.publish("kevin", { fault: "after_files" }), { code: "FAULT_INJECTED" });
  assert.equal(ctx.builds.release().activeBuildId, activeBefore);
  ctx.builds.rollback(second.buildId, ctx.builds.release().revision, "terug naar verplaatste pickup", "kevin");
  live = pickupStates(applyCanonicalBuild(world, ctx.builds.activeServerBuild()));
  assert.deepEqual([live[instanceId].x, live[instanceId].z], [30, 40]);

  // Backup + restore: DB en builds samen, actieve build is na restore leesbaar en hash-gelijk.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gk-life-backup-"));
  const dbFile = path.join(tmp, "live", "database.sqlite");
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  await backup(ctx.db, dbFile);
  const fileDb = new DatabaseSync(dbFile);
  try {
    const result = await createDatabaseBackup({ sourceDb: fileDb, sourceDatabasePath: dbFile, assetsPath: path.join(tmp, "assets"), buildsPath: ctx.buildsRoot, targetDir: path.join(tmp, "backup"), rootDir: tmp });
    assert.equal(result.manifest.canonicalRelease.active_build_id, second.buildId);
    assert.ok(result.manifest.builds.some((file) => file.path === second.buildId + "/server.json"));
    verifyBackup(result.targetDir);
    const restored = restoreDatabaseBackup({ backupDir: result.targetDir, targetDir: path.join(tmp, "restored"), rootDir: tmp });
    const restoredDb = new DatabaseSync(restored.databasePath);
    try {
      const restoredBuilds = new BuildService(restoredDb, { buildsRoot: restored.buildsPath });
      assert.equal(restoredBuilds.verifyBuild(second.buildId).buildId, second.buildId);
      assert.equal(restoredBuilds.activeServerBuild().buildId, second.buildId);
      assert.equal(restoredBuilds.readClient(first.buildId).project.gameName, "GK Golden");
    } finally {
      restoredDb.close();
    }
    // Een backup zonder de actieve build wordt geweigerd.
    fs.rmSync(path.join(result.targetDir, "builds", second.buildId), { recursive: true });
    assert.throws(() => verifyBackup(result.targetDir), { code: /BACKUP_BUILD/ });
  } finally {
    fileDb.close();
  }
});
