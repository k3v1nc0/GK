// Fase 03: immutable build + releasepointer (F3-E2-T02), rollback (F3-E2-T03), runtime-laag en parity (F3-E2-T01).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CommandService } from "../src/server/authoring/command-service.js";
import { BuildService, compileCanonical } from "../src/server/authoring/build-service.js";
import { applyCanonicalBuild } from "../src/server/authoring/runtime-overlay.js";
import { buildRuntimeWorld } from "../src/server/authoring/world-builder.js";
import { authoringDb, graphHash } from "./authoring-helpers.js";

const fixtureWorld = JSON.parse(fs.readFileSync("tests/fixtures/runtime-compat.json", "utf8"));
let seq = 100;
const rid = () => "req-" + String(seq++).padStart(8, "0");

test("losse modellen (kaart Model) gaan via SAVE TO GAME mee als vaste snapshot met hun asset en transform", () => {
  const db = authoringDb();
  const buildsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gk-model-build-"));
  const commands = new CommandService(db);
  const builds = new BuildService(db, { buildsRoot });
  const options = { assetInfo: new Map([["asset_bread", { assetType: "model", sourcePath: "/assets/bread.glb" }]]) };
  const asset = { id: "asset_bread", assetType: "model", sourcePath: "/assets/bread.glb" };
  const runtimeOptions = { assetService: { manifestForIds: (ids) => ids.includes(asset.id) ? [asset] : [] } };
  const placed = (data) => buildRuntimeWorld(data, runtimeOptions).entities.filter((entity) => entity.id.startsWith("placed."));
  try {
    commands.execute({ requestId: rid(), command: "create", kind: "project_settings", body: { gameName: "Modeltest" } }, "kevin");
    const created = commands.execute({ requestId: rid(), command: "create", kind: "placed_model", body: { placedModelId: "model.brood_1", displayName: "Brood", modelAssetId: "asset_bread", x: 3, y: 1, z: -8, rotationY: 45, scale: 2 } }, "kevin");
    const first = builds.publish("kevin", options);
    const world = buildRuntimeWorld(builds.activeServerBuild().data, runtimeOptions);
    const entity = world.entities.find((entry) => entry.id === "placed.model.brood_1");
    assert.deepEqual(entity.transform, { position: { x: 3, y: 1, z: -8 }, rotation: { x: 0, y: 45, z: 0 }, scale: { x: 2, y: 2, z: 2 } });
    assert.ok(world.assets.some((entry) => entry.id === asset.id), "de game krijgt het GLB-bestand mee");
    const preview = compileCanonical(builds.documents.activeDocuments(), options);
    const editorWorld = buildRuntimeWorld(JSON.parse(preview.files["server.json"].text), Object.assign({ editor: true }, runtimeOptions));
    assert.ok(editorWorld.entities.some((entry) => entry.id === "doc:placed_model:model.brood_1"), "in de editor wijst het model naar zijn kaart");
    commands.execute({ requestId: rid(), command: "update", docKey: "placed_model:model.brood_1", expectedRevision: created.revision || 1, body: { placedModelId: "model.brood_1", displayName: "Brood", modelAssetId: "asset_bread", x: 10, y: 1, z: -8, rotationY: 45, scale: 2 } }, "kevin");
    assert.equal(placed(builds.activeServerBuild().data)[0].transform.position.x, 3, "conceptwijzigingen lekken niet naar de game");
    const moved = builds.publish("kevin", options);
    assert.notEqual(moved.buildId, first.buildId);
    assert.equal(placed(builds.activeServerBuild().data)[0].transform.position.x, 10);
    assert.throws(() => builds.publish("kevin", { assetInfo: new Map() }), { code: "BUILD_BLOCKED" }, "onbekend asset houdt publiceren tegen");
    assert.equal(builds.release().activeBuildId, moved.buildId);
    commands.execute({ requestId: rid(), command: "archive", docKey: "placed_model:model.brood_1", expectedRevision: (created.revision || 1) + 1 }, "kevin");
    builds.publish("kevin", options);
    assert.deepEqual(placed(builds.activeServerBuild().data), [], "ook het laatste model weghalen wordt gepubliceerd");
    builds.rollback(first.buildId, builds.release().revision, "test", "kevin");
    assert.deepEqual(placed(builds.activeServerBuild().data), [entity]);
  } finally {
    db.close();
    fs.rmSync(buildsRoot, { recursive: true, force: true });
  }
});

function setup() {
  const db = authoringDb();
  const buildsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gk-builds-"));
  const commands = new CommandService(db);
  const builds = new BuildService(db, { buildsRoot });
  commands.execute({ requestId: rid(), command: "create", kind: "project_settings", body: { gameName: "GK Canoniek", motd: "Welkom" } }, "kevin");
  commands.execute({ requestId: rid(), command: "create", kind: "item_definition", body: { itemId: "item.ore", displayName: "Erts", category: "material", rarity: "common", stackable: true, stackLimit: 99, vendorValue: 7 } }, "kevin");
  commands.execute({ requestId: rid(), command: "create", kind: "pickup", body: { pickupId: "pickup.ore_1", itemRef: "item_definition:item.ore", zoneRef: "zone.golden", x: 10, y: 0, z: 12, amount: 2 } }, "kevin");
  return { db, buildsRoot, commands, builds };
}

test("zelfde input geeft zelfde root-hash; server-only velden niet in client.json", function () {
  const { builds, buildsRoot } = setup();
  const docs = builds.documents.activeDocuments();
  const a = compileCanonical(docs);
  const b = compileCanonical(docs.slice().reverse());
  assert.equal(a.rootSha256, b.rootSha256);
  const published = builds.publish("kevin", { knownZoneIds: ["zone.golden"] });
  assert.equal(published.rootSha256, a.rootSha256);
  const client = fs.readFileSync(path.join(buildsRoot, published.buildId, "client.json"), "utf8");
  assert.equal(client.includes("vendorValue"), false);
  assert.equal(client.includes("\"amount\""), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(buildsRoot, published.buildId, "server.json"), "utf8")).items[0].vendorValue, 7);
  const manifest = JSON.parse(fs.readFileSync(path.join(buildsRoot, published.buildId, "manifest.json"), "utf8"));
  assert.equal(manifest.files["client.json"].audience, "client");
  assert.equal(manifest.provenance.documents.length, 3);
});

test("geforceerde fout en onbekende ref behouden vorige releasepointer; rollback met audit", function () {
  const { db, builds, commands } = setup();
  const graphBefore = graphHash(db);
  const first = builds.publish("kevin", { knownZoneIds: ["zone.golden"] });
  commands.execute({ requestId: rid(), command: "update", docKey: "project_settings", expectedRevision: 1, body: { gameName: "GK v2" } }, "kevin");

  assert.throws(() => builds.publish("kevin", { fault: "after_files" }), { code: "FAULT_INJECTED" });
  assert.equal(builds.release().activeBuildId, first.buildId, "crash voor pointer: oude release blijft");
  assert.throws(() => builds.publish("kevin", { knownZoneIds: ["zone.other"] }), { code: "BUILD_BLOCKED" });
  assert.equal(builds.release().activeBuildId, first.buildId);

  const second = builds.publish("kevin", { knownZoneIds: ["zone.golden"] });
  assert.notEqual(second.buildId, first.buildId);
  const revision = builds.release().revision;
  assert.throws(() => builds.rollback(first.buildId, revision - 1, "test", "kevin"), { code: "STALE_RELEASE" });
  assert.throws(() => builds.rollback("b_000000000000000000000000", revision, "test", "kevin"), { code: "BUILD_NOT_FOUND" });
  assert.equal(builds.release().activeBuildId, second.buildId, "foute rollback verandert pointer niet");
  const started = Date.now();
  builds.rollback(first.buildId, revision, "Rollback-proef", "kevin");
  assert.ok(Date.now() - started < 5 * 60 * 1000);
  assert.equal(builds.release().activeBuildId, first.buildId);
  const audit = builds.audit(1)[0];
  assert.deepEqual([audit.action, audit.from_build_id, audit.to_build_id, audit.reason], ["rollback", second.buildId, first.buildId, "Rollback-proef"]);
  assert.equal(builds.readClient(first.buildId).project.gameName, "GK Canoniek", "oude build is ongewijzigd");
  assert.equal(graphHash(db), graphBefore);
});

test("runtime-laag: canonieke pickup wordt pickup_spawn, item komt in catalogus, legacy blijft staan", function () {
  const { builds } = setup();
  builds.publish("kevin", { knownZoneIds: ["zone.golden"] });
  const world = applyCanonicalBuild(fixtureWorld, builds.activeServerBuild());
  const zone = world.gameProject.zones.packages[0];
  const spawns = zone.spawnControllers.flatMap((controller) => controller.spawnSets.flatMap((set) => set.spawns));
  assert.equal(spawns.length, 3, "twee legacy-pickups plus de canonieke pickup");
  const canonical = spawns.find((spawn) => spawn.spawnEntryId === "canonical.pickup.ore_1");
  assert.deepEqual([canonical.itemRef, canonical.amount, canonical.x, canonical.z], ["item.ore", 2, 10, 12]);
  assert.equal(world.gameProject.catalogs.items["item.ore"].displayName, "Erts");
  assert.equal(world.gameProject.catalogs.items["item.golden.pickup"].displayName, "Golden Pickup");
  assert.equal(world.gameProject.project.gameName, "GK Canoniek");
  assert.equal(fixtureWorld.gameProject.zones.packages[0].spawnControllers.length, 1, "gepubliceerde wereld niet gemuteerd");
});
