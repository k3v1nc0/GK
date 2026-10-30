import test from "node:test";
import assert from "node:assert/strict";
import { createDocBench } from "../apps/web/public/editor/werkbank-docs.js?test=instance-placement";
import { createDocDrop, DOC_MIME } from "../apps/web/public/editor/werkbank-world.js?test=instance-placement";
import { CommandService } from "../src/server/authoring/command-service.js";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { buildRuntimeWorld } from "../src/server/authoring/world-builder.js";
import { authoringDb } from "./authoring-helpers.js";

function dropEvent(docKey, x, z) {
  return {
    clientX: x,
    clientY: z,
    prevented: false,
    preventDefault() { this.prevented = true; },
    dataTransfer: {
      types: [DOC_MIME],
      getData(type) { return type === DOC_MIME ? docKey : ""; }
    }
  };
}

function dropHarness(sourceDocs) {
  const documents = sourceDocs.map((doc) => structuredClone(doc));
  const saved = [];
  const specs = {
    item_definition: { idField: "itemId" },
    pickup: { idField: "pickupId" },
    placed_model: { idField: "placedModelId" },
    npc: { idField: "npcId" }
  };
  const bench = {
    workspace: { zones: [{ zoneId: "zone.main", bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 } }] },
    spec(kind) { return specs[kind]; },
    docs(kind, includeArchived = false) {
      return documents.filter((doc) => doc.kind === kind && (includeArchived || !doc.archived));
    },
    doc(docKey) { return documents.find((doc) => doc.docKey === docKey) || null; },
    async saveDoc(kind, source, body, label) {
      saved.push({ kind, source, body: structuredClone(body), label });
      const id = body[specs[kind].idField];
      const docKey = kind + ":" + id;
      documents.push({ docKey, kind, body: structuredClone(body), archived: false, revision: 1 });
      return { docKey };
    }
  };
  const drop = createDocDrop({
    bench,
    getRuntime: () => ({ screenToGround: (x, z) => ({ x, y: 0, z }) }),
    getActiveZoneId: () => "zone.main",
    onSelect: () => {},
    setStatus: () => {}
  });
  return { bench, drop, documents, saved };
}

test("losse modelplaatsingen vullen de Werkbank-bibliotheek niet", () => {
  const bench = createDocBench();
  bench.workspace = {
    kinds: { item_definition: {}, placed_model: {} },
    documents: []
  };
  assert.deepEqual(bench.libraryKinds(), ["item_definition"]);
});

test("hetzelfde item twee keer slepen maakt twee pickups en verandert de item-asset niet", async () => {
  const item = {
    docKey: "item_definition:item.brood",
    kind: "item_definition",
    archived: false,
    revision: 1,
    body: { itemId: "item.brood", displayName: "Brood", worldModelAssetId: "asset.brood" }
  };
  const before = structuredClone(item.body);
  const { drop, saved } = dropHarness([item]);

  await drop.handleDrop(dropEvent(item.docKey, 2, 3));
  await drop.handleDrop(dropEvent(item.docKey, 7, 8));

  assert.equal(saved.length, 2);
  assert.ok(saved.every((entry) => entry.kind === "pickup" && entry.source === null));
  assert.deepEqual(saved.map((entry) => entry.body.pickupId), ["pickup.brood_1", "pickup.brood_2"]);
  assert.ok(saved.every((entry) => entry.body.itemRef === item.docKey));
  assert.deepEqual(item.body, before);
});

test("een oude Model-kaart slepen kopieert de plaatsing in plaats van de oude te verplaatsen", async () => {
  const model = {
    docKey: "placed_model:model.boom_1",
    kind: "placed_model",
    archived: false,
    revision: 1,
    body: { placedModelId: "model.boom_1", displayName: "Boom", modelAssetId: "asset.boom", x: 1, y: 0, z: 1 }
  };
  const before = structuredClone(model.body);
  const { drop, saved } = dropHarness([model]);

  await drop.handleDrop(dropEvent(model.docKey, 5, 6));
  await drop.handleDrop(dropEvent(model.docKey, 9, 10));

  assert.deepEqual(model.body, before);
  assert.equal(saved.length, 2);
  assert.ok(saved.every((entry) => entry.kind === "placed_model" && entry.source === null));
  assert.deepEqual(saved.map((entry) => entry.body.placedModelId), ["model.boom_1_1", "model.boom_1_2"]);
  assert.deepEqual(saved.map((entry) => [entry.body.x, entry.body.z]), [[5, 6], [9, 10]]);
});

test("een modelplaatsing weghalen laat de model-asset van het item staan", () => {
  const db = authoringDb();
  const commands = new CommandService(db);
  try {
    commands.execute({ requestId: "req-instance-0001", command: "create", kind: "item_definition", body: {
      itemId: "item.brood", displayName: "Brood", category: "material", rarity: "common", stackable: true, stackLimit: 99,
      worldModelAssetId: "asset.brood"
    } }, "kevin");
    const placed = commands.execute({ requestId: "req-instance-0002", command: "create", kind: "placed_model", body: {
      placedModelId: "model.brood_1", displayName: "Brood los", modelAssetId: "asset.brood", x: 1, y: 0, z: 2
    } }, "kevin");

    commands.execute({ requestId: "req-instance-0003", command: "archive", docKey: "placed_model:model.brood_1", expectedRevision: placed.revision }, "kevin");

    assert.equal(commands.documents.get("placed_model:model.brood_1").archived, true);
    const item = commands.documents.get("item_definition:item.brood");
    assert.equal(item.archived, false);
    assert.equal(item.body.worldModelAssetId, "asset.brood");
  } finally {
    db.close();
  }
});

test("een itemmesh zit zelfstandig in het wereldmanifest zonder los wereldmodel", () => {
  const documents = [
    { docKey: "item_definition:item.brood", kind: "item_definition", archived: false, revision: 1, body: {
      itemId: "item.brood", displayName: "Brood", category: "material", rarity: "common", stackable: true, stackLimit: 99,
      worldModelAssetId: "asset.brood"
    } },
    { docKey: "pickup:pickup.brood_1", kind: "pickup", archived: false, revision: 1, body: {
      pickupId: "pickup.brood_1", itemRef: "item_definition:item.brood", zoneRef: "zone.main", x: 2, y: 0, z: 3, amount: 1
    } }
  ];
  const compiled = compileCanonical(documents);
  assert.deepEqual(compiled.errors, []);
  const asset = { id: "asset.brood", assetType: "model", sourcePath: "/assets/brood.glb" };
  const data = JSON.parse(compiled.files["server.json"].text);
  const world = buildRuntimeWorld(data, {
    editor: true,
    assetService: { manifestForIds: (ids) => ids.includes(asset.id) ? [asset] : [] }
  });

  assert.equal((data.game?.placedModels || []).length, 0, "geen los model nodig");
  assert.ok(world.assets.some((entry) => entry.id === asset.id), "itemmesh wordt zelf geladen");
  assert.equal(world.gameProject.catalogs.items["item.brood"].worldModelAssetId, asset.id);
});
