// Bots loslaten (Kevin 20-11): accounts hergebruiken, naast de admin zetten, en "alle bots weg" ruimt alles op.
import assert from "node:assert/strict";
import test from "node:test";
import { BotManager } from "../src/server/bot-manager.js";

function fakeDb() {
  const users = new Map();
  return {
    users,
    prepare(sql) {
      return {
        get(name) { return Array.from(users.values()).find((user) => user.username === name) || undefined; },
        run(id, username, email) { if (sql.startsWith("INSERT INTO users")) users.set(id, { id, username, email, role: "player" }); }
      };
    }
  };
}

function setup() {
  const db = fakeDb();
  const loggedOut = [];
  const closed = [];
  const teleports = [];
  const authService = {
    cookieName: "gk_session",
    createSession(userId) { return { sessionId: "s_" + userId, sessionToken: "t_" + userId }; },
    csrfTokenForSessionId(sessionId) { return "csrf_" + sessionId; },
    logout(sessionId) { loggedOut.push(sessionId); }
  };
  const connections = new Map();
  const mmoService = {
    connectionsById: connections,
    connectionsBySessionId: new Map(),
    getPlayerSnapshot() { return { position: { x: 10, z: -4, zoneId: "zone.world" } }; },
    closeSessionConnections(sessionId) { closed.push(sessionId); },
    applyTeleportState(connection, payload) { teleports.push(payload); return { x: payload.position.x, z: payload.position.z }; },
    schedulePersist() {}
  };
  const manager = new BotManager({ db, authService, mmoService, rootDir: "/tmp", host: "127.0.0.1", port: 3001 });
  const sent = [];
  manager.ensureChild = function () { this.child = { connected: true, send(message) { sent.push(message); }, kill() {} }; };
  return { db, manager, sent, loggedOut, closed, teleports, mmoService };
}

test("bots: een groepje komt los met eigen accounts, en een echte speler die bot_001 heet blijft met rust", function () {
  const { db, manager, sent } = setup();
  db.users.set("real", { id: "real", username: "bot_001", email: "iemand@example.com", role: "player" });
  const view = manager.release({}, 3);
  assert.equal(view.running, 3);
  const add = sent.find((message) => message.type === "add");
  assert.deepEqual(add.bots.map((bot) => bot.name), ["bot_002", "bot_003", "bot_004"], "bot_001 is van een echte speler");
  assert.deepEqual(add.anchor, { x: 10, z: -4, zoneId: "zone.world" }, "naast de admin");
  assert.equal(add.bots[0].cookie, "gk_session=t_" + add.bots[0].userId);
  manager.release({}, 2);
  const second = sent.filter((message) => message.type === "add")[1];
  assert.deepEqual(second.bots.map((bot) => bot.name), ["bot_005", "bot_006"], "geen dubbele bots");
});

test("bots: net verbonden bot komt in de kring naast de admin, en alle bots weg ruimt sessies op", function () {
  const { manager, sent, loggedOut, closed, teleports, mmoService } = setup();
  manager.release({}, 2);
  const bot = sent.find((message) => message.type === "add").bots[0];
  mmoService.connectionsById.set("c1", { id: "c1" });
  mmoService.connectionsBySessionId.set(bot.sessionId, new Set(["c1"]));
  manager.onChildMessage({ type: "connected", userId: bot.userId });
  assert.equal(teleports.length, 1);
  assert.ok(Math.hypot(teleports[0].position.x - 10, teleports[0].position.z + 4) < 6, "dicht bij de admin");
  const placed = sent.find((message) => message.type === "placed");
  assert.equal(placed.userId, bot.userId);
  manager.onChildMessage({ type: "status", connected: 2, kills: 4 });
  assert.equal(manager.view().kills, 4);
  const view = manager.stop();
  assert.equal(view.running, 0);
  assert.equal(loggedOut.length, 2);
  assert.equal(closed.length, 2);
  assert.ok(sent.some((message) => message.type === "stop"));
});
