// Fase 03: immutable build + releasepointer (F3-E2-T02), rollback (F3-E2-T03), runtime-laag en parity (F3-E2-T01).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CommandService } from "../src/server/authoring/command-service.js";
import { BuildService, compileCanonical } from "../src/server/authoring/build-service.js";
import { applyCanonicalBuild } from "../src/server/authoring/runtime-overlay.js";
import { authoringDb, graphHash } from "./authoring-helpers.js";

const fixtureWorld = JSON.parse(fs.readFileSync("tests/fixtures/runtime-compat.json", "utf8"));
let seq = 100;
const rid = () => "req-" + String(seq++).padStart(8, "0");

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
