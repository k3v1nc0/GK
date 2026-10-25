// Fase 03: kinds (F3-E1-T01) en transactionele commands (F3-E1-T02).
import assert from "node:assert/strict";
import test from "node:test";
import { validateDocument, splitByAudience } from "../src/shared/authoring/kinds.js";
import { CommandService } from "../src/server/authoring/command-service.js";
import { authoringDb, graphHash } from "./authoring-helpers.js";

const ore = { itemId: "item.ore", displayName: "Erts", category: "material", rarity: "common", stackable: true, stackLimit: 99, vendorValue: 3 };

test("kinds: geldige en ongeldige vectors, geen stille defaults, audience-split", function () {
  assert.equal(validateDocument("project_settings", { gameName: "GK" }).ok, true);
  assert.equal(validateDocument("project_settings", {}).issues[0].code, "FIELD_REQUIRED");
  assert.equal(validateDocument("item_definition", ore).ok, true);
  assert.equal(validateDocument("item_definition", Object.assign({}, ore, { rarity: "mythic" })).issues[0].code, "FIELD_OPTION");
  assert.equal(validateDocument("item_definition", Object.assign({}, ore, { script: "alert(1)" })).issues[0].code, "FIELD_UNKNOWN");
  assert.equal(validateDocument("item_definition", Object.assign({}, ore, { stackable: true, stackLimit: 1.5 })).issues[0].code, "FIELD_INTEGER");
  const pickup = { pickupId: "pickup.ore_1", itemRef: "item_definition:item.ore", zoneRef: "zone.a", x: 1, y: 0, z: 2, amount: 2 };
  const result = validateDocument("pickup", pickup);
  assert.deepEqual(result.refs, ["item_definition:item.ore"]);
  assert.equal(validateDocument("pickup", Object.assign({}, pickup, { itemRef: "pickup:x" })).issues[0].code, "REF_KIND");
  assert.equal(validateDocument("unknown_kind", {}).ok, false);
  const split = splitByAudience("item_definition", ore);
  assert.equal(split.client.vendorValue, undefined, "server-veld niet in client");
  assert.equal(split.server.vendorValue, 3);
});

test("commands: revision/If-Match, idempotency, refs en archiveren; graph blijft gelijk", function () {
  const db = authoringDb();
  const before = graphHash(db);
  const service = new CommandService(db);
  const created = service.execute({ requestId: "req-00000001", command: "create", kind: "item_definition", body: ore }, "kevin");
  assert.deepEqual(created, { ok: true, docKey: "item_definition:item.ore", kind: "item_definition", revision: 1 });

  // Retry met zelfde requestId en payload: zelfde antwoord, geen nieuwe write.
  const replay = service.execute({ requestId: "req-00000001", command: "create", kind: "item_definition", body: ore }, "kevin");
  assert.equal(replay.replayed, true);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM authoring_documents").get().n, 1);
  // Zelfde requestId met andere payload: 409.
  assert.throws(() => service.execute({ requestId: "req-00000001", command: "create", kind: "item_definition", body: Object.assign({}, ore, { displayName: "X" }) }, "kevin"), { code: "REQUEST_ID_REUSED", status: 409 });

  // Update zonder If-Match: 428; met oude revision: 409 zonder write.
  const rename = { command: "update", docKey: "item_definition:item.ore", body: Object.assign({}, ore, { displayName: "IJzererts" }) };
  assert.throws(() => service.execute(Object.assign({ requestId: "req-00000002" }, rename), "kevin"), { status: 428 });
  service.execute(Object.assign({ requestId: "req-00000003", expectedRevision: 1 }, rename), "kevin");
  assert.throws(() => service.execute(Object.assign({ requestId: "req-00000004", expectedRevision: 1 }, rename), "kevin"), { code: "STALE_REVISION", status: 409 });
  assert.equal(service.documents.get("item_definition:item.ore").revision, 2);

  // Ref naar ontbrekend item blokkeert; mislukte command wijzigt nul rijen.
  const countOps = () => db.prepare("SELECT COUNT(*) AS n FROM authoring_operations").get().n;
  const opsBefore = countOps();
  const pickup = { pickupId: "pickup.ore_1", itemRef: "item_definition:item.missing", zoneRef: "zone.a", x: 1, y: 0, z: 2, amount: 1 };
  assert.throws(() => service.execute({ requestId: "req-00000005", command: "create", kind: "pickup", body: pickup }, "kevin"), { code: "REF_MISSING" });
  assert.equal(countOps(), opsBefore);
  assert.equal(service.documents.get("pickup:pickup.ore_1"), null);

  // Pickup naar bestaand item; daarna is archiveren van het item geblokkeerd.
  service.execute({ requestId: "req-00000006", command: "create", kind: "pickup", body: Object.assign({}, pickup, { itemRef: "item_definition:item.ore" }) }, "kevin");
  assert.throws(() => service.execute({ requestId: "req-00000007", command: "archive", docKey: "item_definition:item.ore", expectedRevision: 2 }, "kevin"), { code: "REF_IN_USE" });
  service.execute({ requestId: "req-00000008", command: "archive", docKey: "pickup:pickup.ore_1", expectedRevision: 1 }, "kevin");
  service.execute({ requestId: "req-00000009", command: "archive", docKey: "item_definition:item.ore", expectedRevision: 2 }, "kevin");
  // ID wijzigen kan niet.
  service.execute({ requestId: "req-00000010", command: "create", kind: "project_settings", body: { gameName: "GK" } }, "kevin");
  assert.throws(() => service.execute({ requestId: "req-00000011", command: "archive", docKey: "project_settings", expectedRevision: 1 }, "kevin"), { code: "SINGLETON" });

  assert.equal(graphHash(db), before, "editor_nodes/edges onveranderd");
});
