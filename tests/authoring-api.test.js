// Fase 03: authoring-API (F3-E1-T03), rollback-rechten (F3-E2-T03) en de Nodes-blokkade (F3-E3-T01/T07).
// Geen server: de routes krijgen nep-requests, zoals server.js ze doorgeeft na Origin- en CSRF-controle.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AuthoringRoutes } from "../src/server/authoring/routes.js";
import { CutoverGuard } from "../src/server/authoring/cutover-guard.js";
import { GraphRepository } from "../src/server/graph-repository.js";
import { createMigrationDatabase } from "./fixtures.js";
import { authoringDb } from "./authoring-helpers.js";

const USERS = {
  admin: { id: "u-admin", username: "kevin", role: "admin" },
  editor: { id: "u-editor", username: "helper", role: "editor" },
  player: { id: "u-player", username: "speler", role: "player" }
};

function harness() {
  const db = authoringDb();
  const authService = {
    currentUser: (req) => req.user || null,
    requireEditor(req) {
      if (!req.user || !["admin", "editor"].includes(req.user.role)) { const error = new Error("Editor login vereist."); error.status = 401; throw error; }
      return req.user;
    },
    csrfTokenForRequest: () => "csrf-token"
  };
  const world = JSON.parse(fs.readFileSync("tests/fixtures/runtime-compat.json", "utf8"));
  let guard = null;
  const repository = { getPublishedWorld: () => world, setWriteGuard: (value) => { guard = value; } };
  let provider = null;
  const mmoService = { setCanonicalBuildProvider: (fn) => { provider = fn; } };
  const routes = new AuthoringRoutes({
    db, authService, repository, mmoService,
    buildsRoot: fs.mkdtempSync(path.join(os.tmpdir(), "gk-api-builds-")),
    sendJson: (res, status, data, headers) => Object.assign(res, { status, data, headers: headers || {} }),
    readJson: async (req) => {
      if (req.tooLarge) { const error = new Error("Request body is te groot."); error.status = 413; throw error; }
      return req.body || {};
    }
  });
  async function call(method, pathname, { user = USERS.admin, body, ifMatch, tooLarge } = {}) {
    const headers = {};
    if (ifMatch !== undefined) headers["if-match"] = '"' + ifMatch + '"';
    const res = {};
    await routes.handle({ method, headers, user, body, tooLarge }, res, new URL("http://localhost" + pathname));
    return res;
  }
  return { db, routes, call, guard: () => guard, provider: () => provider };
}

let n = 0;
const rid = () => "req-api-" + String(n++).padStart(4, "0");

test("API: rollen, actor uit sessie, If-Match, 413 en geen server.json via HTTP", async function () {
  const { db, call, provider, guard } = harness();
  assert.ok(guard() instanceof CutoverGuard, "Nodes-blokkade is aangezet");

  assert.equal((await call("GET", "/api/authoring/workspace", { user: null })).status, 401);
  assert.equal((await call("POST", "/api/authoring/command", { user: USERS.player, body: {} })).status, 401);
  assert.equal((await call("GET", "/api/authoring/active/client.json", { user: null })).status, 401);
  const workspace = await call("GET", "/api/authoring/workspace", { user: USERS.editor });
  assert.equal(workspace.status, 200);
  assert.equal(workspace.data.zones[0].zoneId, "zone.golden");

  // Actor/project in de body worden genegeerd: updated_by komt uit de sessie.
  const created = await call("POST", "/api/authoring/command", { user: USERS.editor, body: {
    requestId: rid(), command: "create", kind: "item_definition", actor: "u-admin", updatedBy: "u-admin",
    body: { itemId: "item.ore", displayName: "Erts", category: "material", rarity: "common", stackable: true, stackLimit: 10 }
  } });
  assert.equal(created.status, 201);
  assert.equal(created.headers.ETag, '"1"');
  assert.ok(created.data.operationId);
  assert.equal(db.prepare("SELECT updated_by FROM authoring_documents WHERE doc_key = 'item_definition:item.ore'").get().updated_by, "u-editor");

  const update = (ifMatch) => call("POST", "/api/authoring/command", { body: {
    requestId: rid(), command: "update", docKey: "item_definition:item.ore",
    body: { itemId: "item.ore", displayName: "IJzererts", category: "material", rarity: "common", stackable: true, stackLimit: 10 }
  }, ifMatch });
  assert.equal((await update(undefined)).status, 428);
  assert.equal((await update(1)).status, 200);
  const stale = await update(1);
  assert.deepEqual([stale.status, stale.data.code], [409, "STALE_REVISION"]);

  assert.equal((await call("POST", "/api/authoring/command", { tooLarge: true })).status, 413);

  await call("POST", "/api/authoring/command", { body: { requestId: rid(), command: "create", kind: "pickup",
    body: { pickupId: "pickup.ore_1", itemRef: "item_definition:item.ore", zoneRef: "zone.golden", x: 1, y: 0, z: 1, amount: 1 } } });
  const first = await call("POST", "/api/authoring/publish", { user: USERS.editor, body: {} });
  assert.equal(first.status, 200);
  assert.equal(provider()().buildId, first.data.buildId, "game ziet de nieuwe build zonder DB-read per tick");
  const client = await call("GET", "/api/authoring/active/client.json", { user: USERS.player });
  assert.equal(client.data.client.items[0].displayName, "IJzererts");
  assert.equal(JSON.stringify(client.data).includes("amount"), false);
  assert.equal((await call("GET", "/api/authoring/builds/" + first.data.buildId + "/server.json")).status, 404);

  // Fault-injectie werkt alleen in geïsoleerde testmodus.
  const previous = process.env.GK_TEST_ISOLATED;
  delete process.env.GK_TEST_ISOLATED;
  await call("POST", "/api/authoring/command", { body: { requestId: rid(), command: "create", kind: "project_settings", body: { gameName: "GK" } } });
  const second = await call("POST", "/api/authoring/publish", { body: { fault: "after_files" } });
  if (previous !== undefined) process.env.GK_TEST_ISOLATED = previous;
  assert.equal(second.status, 200, "fault genegeerd buiten testmodus");

  // Rollback: alleen admin, met If-Match en reden.
  const revision = (await call("GET", "/api/authoring/workspace")).data.release.revision;
  const body = { buildId: first.data.buildId, reason: "proef" };
  assert.equal((await call("POST", "/api/authoring/rollback", { user: USERS.editor, body, ifMatch: revision })).status, 403);
  assert.equal((await call("POST", "/api/authoring/rollback", { body })).status, 428);
  const rolled = await call("POST", "/api/authoring/rollback", { body, ifMatch: revision });
  assert.equal(rolled.status, 200);
  assert.equal(provider()().buildId, first.data.buildId);
});

test("server.js controleert Origin en CSRF vóór de authoringroutes", function () {
  const source = fs.readFileSync("src/server/server.js", "utf8");
  const csrf = source.indexOf("if (!csrfExempt) authService.assertCsrf(req);");
  const authoring = source.indexOf('if (url.pathname.startsWith("/api/authoring/"))');
  assert.ok(csrf > 0 && authoring > csrf);
});

test("Nodes-blokkade: item dat Canoniek beheert is read-only in de graph, de rest niet", function () {
  const db = createMigrationDatabase();
  db.exec(fs.readFileSync("db/migrations/012_authoring_core.sql", "utf8"));
  const stamp = "2026-10-25T00:00:00.000Z";
  const insertNode = db.prepare("INSERT INTO editor_nodes (id, type, title, x, y, parent_id, values_json, created_at, updated_at) VALUES (?, ?, ?, 0, 0, NULL, ?, ?, ?)");
  insertNode.run("n-owned", "item_definition", "Erts", JSON.stringify({ itemId: "item.ore", displayName: "Erts" }), stamp, stamp);
  insertNode.run("n-free", "item_definition", "Hout", JSON.stringify({ itemId: "item.wood", displayName: "Hout" }), stamp, stamp);
  insertNode.run("n-project", "game_project_settings", "Project", JSON.stringify({ projectId: "project.gk", gameName: "GK", startZoneRef: "zone.a" }), stamp, stamp);
  db.prepare("INSERT INTO authoring_documents (doc_key, kind, revision, body_json, archived, legacy_ref, created_at, updated_at) VALUES (?, ?, 1, '{}', 0, ?, ?, ?)")
    .run("item_definition:item.ore", "item_definition", "items:item.ore", stamp, stamp);
  db.prepare("INSERT INTO authoring_documents (doc_key, kind, revision, body_json, archived, created_at, updated_at) VALUES ('project_settings', 'project_settings', 1, '{}', 0, ?, ?)").run(stamp, stamp);
  const repository = new GraphRepository(db);
  repository.setWriteGuard(new CutoverGuard(db));
  const valuesOf = (id) => JSON.parse(db.prepare("SELECT values_json FROM editor_nodes WHERE id = ?").get(id).values_json);

  assert.throws(() => repository.updateNodeValues("n-owned", { displayName: "Anders" }, { returnGraph: false }), { code: "CANONICAL_OWNED", status: 409 });
  assert.throws(() => repository.updateNodeValuesBulk([{ nodeId: "n-owned", values: { displayName: "Anders" } }], { returnGraph: false }), { code: "CANONICAL_OWNED" });
  assert.throws(() => repository.deleteNode("n-owned"), { code: "CANONICAL_OWNED" });
  assert.throws(() => repository.deleteGraphSelection({ nodeIds: ["n-owned"] }), { code: "CANONICAL_OWNED" });
  assert.throws(() => repository.createNode("item_definition", { x: 0, y: 0 }, { itemId: "item.ore" }), { code: "CANONICAL_OWNED" });
  assert.equal(valuesOf("n-owned").displayName, "Erts");

  repository.updateNodeValues("n-free", { displayName: "Eikenhout" }, { returnGraph: false });
  assert.equal(valuesOf("n-free").displayName, "Eikenhout");
  assert.throws(() => repository.updateNodeValues("n-project", { gameName: "Anders" }, { returnGraph: false }), { code: "CANONICAL_OWNED" });
  repository.updateNodeValues("n-project", { startZoneRef: "zone.b" }, { returnGraph: false });
  assert.equal(valuesOf("n-project").startZoneRef, "zone.b", "andere projectvelden blijven bewerkbaar");
});
