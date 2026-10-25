// F2-E2-T01: protocol gk-mmo-v1 (schema, sluitcodes, eenmalige join-tickets). Start geen server;
// de echte upgrade (/ws/game) wordt in smoke getest.
import test from "node:test";
import assert from "node:assert/strict";
import { CLOSE_CODES, MAX_MESSAGE_BYTES, PROTOCOL_NAME, selectProtocol, validateClientMessage } from "../apps/web/public/shared/protocol-v1.js";
import { JoinTickets } from "../src/server/runtime/join-tickets.js";

test("AUTH met ticket en versie 1 is geldig; onbekende versie geeft 4406", function () {
  assert.equal(validateClientMessage(JSON.stringify({ type: "auth", v: 1, ticket: "x".repeat(32) })).ok, true);
  const wrongVersion = validateClientMessage(JSON.stringify({ type: "auth", v: 2, ticket: "x".repeat(32) }));
  assert.equal(wrongVersion.code, CLOSE_CODES.UNSUPPORTED_VERSION);
  assert.equal(validateClientMessage(JSON.stringify({ type: "auth", v: 1 })).code, CLOSE_CODES.UNAUTHORIZED);
});

test("payload > 64 KiB, kapotte JSON en onbekende types worden geweigerd", function () {
  const big = JSON.stringify({ type: "ping", pad: "x".repeat(MAX_MESSAGE_BYTES) });
  assert.equal(validateClientMessage(big).code, CLOSE_CODES.MESSAGE_TOO_BIG);
  assert.equal(validateClientMessage("{nope").code, CLOSE_CODES.BAD_MESSAGE);
  assert.equal(validateClientMessage(JSON.stringify({ type: "player:teleport" })).code, CLOSE_CODES.BAD_MESSAGE);
  assert.equal(validateClientMessage(JSON.stringify({ type: "player:input_state", payload: { input: { moveX: "fast" } } })).code, CLOSE_CODES.BAD_MESSAGE);
  assert.equal(validateClientMessage(Buffer.from(JSON.stringify({ type: "player:input_state", payload: { input: { moveX: 1, moveZ: 0 } } }))).ok, true);
});

test("subprotocol: alleen gk-mmo-v1", function () {
  assert.equal(selectProtocol(new Set(["gk-mmo-v1"])), PROTOCOL_NAME);
  assert.equal(selectProtocol(["gk-mmo-v2"]), null);
  assert.equal(selectProtocol([]), null);
});

test("join-ticket is eenmalig, sessiegebonden en 5 s geldig", function () {
  let now = 1000;
  const tickets = new JoinTickets({ clock: () => now });
  const a = tickets.issue("session_a");
  assert.equal(tickets.consume(a.ticket, "session_a"), true);
  assert.equal(tickets.consume(a.ticket, "session_a"), false, "tweede keer geweigerd");
  const b = tickets.issue("session_a");
  assert.equal(tickets.consume(b.ticket, "session_b"), false, "andere sessie geweigerd");
  assert.equal(tickets.consume(b.ticket, "session_a"), false, "ook na een mislukte poging weg");
  const c = tickets.issue("session_a");
  now += 5001;
  assert.equal(tickets.consume(c.ticket, "session_a"), false, "verlopen");
  assert.throws(() => tickets.issue(null), { status: 401 });
});
