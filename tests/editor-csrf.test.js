import test from "node:test";
import assert from "node:assert/strict";

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

test("eerste asset-drop haalt een sessietoken op en bewaart de requestbody", async () => {
  const { csrfFetch } = await import("../apps/web/public/editor/csrf-fetch.js?test=missing");
  const calls = [];
  const send = async (path, options) => {
    calls.push({ path, options });
    return path === "/api/auth/me" ? json({ csrfToken: "fresh" }) : json({ ok: true }, 201);
  };
  const body = JSON.stringify({ assetId: "bread", position: { x: 7, z: 1 } });
  const result = await csrfFetch("/api/editor/place-model-asset", { method: "POST", body }, send);
  assert.equal(result.status, 201);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers["x-gk-csrf"], "fresh");
  assert.equal(calls[1].options.body, body);
});

test("viewport en publiceren herstellen samen een verouderd token, zonder dubbele mutaties", async () => {
  const { csrfFetch, rememberCsrfToken } = await import("../apps/web/public/editor/csrf-fetch.js?test=expired");
  rememberCsrfToken({ csrfToken: "old" });
  let refreshes = 0;
  const applied = [];
  const send = async (path, options) => {
    if (path === "/api/auth/me") {
      refreshes++;
      return json({ csrfToken: "new" });
    }
    if (options.headers["x-gk-csrf"] === "old") return json({ code: "CSRF_FORBIDDEN" }, 403);
    applied.push(path);
    return json({ ok: true });
  };
  const paths = ["/api/editor/place-model-asset", "/api/authoring/publish"];
  const results = await Promise.all(paths.map((path) => csrfFetch(path, { method: "POST", body: "{}" }, send)));
  assert.ok(results.every((result) => result.ok));
  assert.equal(refreshes, 1);
  assert.deepEqual(applied.sort(), paths.sort());
});

test("andere fouten worden niet herhaald en een verlopen login stopt de mutatie", async () => {
  const { csrfFetch, rememberCsrfToken } = await import("../apps/web/public/editor/csrf-fetch.js?test=errors");
  rememberCsrfToken({ csrfToken: "old" });
  let calls = 0;
  const denied = await csrfFetch("/mutation", { method: "POST" }, async () => {
    calls++;
    return json({ code: "FORBIDDEN" }, 403);
  });
  assert.equal(denied.status, 403);
  assert.equal(calls, 1);
  const loggedOut = await csrfFetch("/mutation", { method: "POST" }, async (path) => {
    return path === "/api/auth/me" ? json({}, 401) : json({ code: "CSRF_FORBIDDEN" }, 403);
  });
  assert.equal(loggedOut.status, 401);
});
