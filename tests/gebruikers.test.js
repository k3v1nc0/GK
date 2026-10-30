// Instellingen > Gebruikers: naam, wachtwoord, voortgang resetten en verwijderen (alleen admin).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { AuthService } from "../src/server/auth-service.js";
import { UserAdminService } from "../src/server/user-admin-service.js";

function setup() {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES ('admin', 'kevin', 'x', 'x', 'admin', ?, ?)").run(stamp, stamp);
  const closed = [];
  return { db, auth: new AuthService(db), admin: new UserAdminService(db, { closeSessionConnections: (id) => closed.push(id) }), closed, stamp };
}

async function player(ctx, name) {
  const result = await ctx.auth.register(name, "wachtwoord1", "pc");
  const profileId = "profile_" + name;
  ctx.db.prepare("INSERT INTO player_profiles (id, user_id, display_name, current_world_id, created_at, updated_at) VALUES (?, ?, ?, 'world.main', ?, ?)")
    .run(profileId, result.user.id, name, ctx.stamp, ctx.stamp);
  ctx.db.prepare("INSERT INTO player_progression (player_id, level, xp, skill_points, revision, updated_at) VALUES (?, 3, 120, 0, 1, ?)").run(profileId, ctx.stamp);
  ctx.db.prepare("INSERT INTO player_currencies (player_id, currency_id, amount_minor, revision, updated_at) VALUES (?, 'currency.goud', 50, 1, ?)").run(profileId, ctx.stamp);
  return { userId: result.user.id, profileId };
}

test("de lijst toont accounts met rol, level en online-status", async () => {
  const ctx = setup();
  await player(ctx, "anna");
  const users = ctx.admin.list();
  const anna = users.find((user) => user.username === "anna");
  assert.equal(anna.role, "player");
  assert.equal(anna.level, 3);
  assert.equal(anna.online, true, "net geregistreerd = online");
  assert.equal(users.find((user) => user.username === "kevin").role, "admin");
});

test("naam en wachtwoord wijzigen; het account wordt uitgelogd", async () => {
  const ctx = setup();
  const anna = await player(ctx, "anna");
  await player(ctx, "bob");
  assert.throws(() => ctx.admin.rename(anna.userId, "bob"), { status: 409 });
  assert.equal(ctx.admin.rename(anna.userId, "Anna Smit").username, "anna_smit");
  assert.equal(ctx.db.prepare("SELECT display_name FROM player_profiles WHERE id = ?").get(anna.profileId).display_name, "anna_smit");
  await assert.rejects(() => ctx.admin.setPassword(anna.userId, "kort", "admin"), { status: 400 });
  await ctx.admin.setPassword(anna.userId, "nieuwwachtwoord", "admin");
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(anna.userId).n, 0, "overal uitgelogd");
  assert.ok(ctx.closed.length >= 1, "live verbinding gesloten");
  assert.equal(await ctx.auth.login("anna_smit", "wachtwoord1", "pc"), null, "oud wachtwoord werkt niet meer");
  assert.ok(await ctx.auth.login("anna_smit", "nieuwwachtwoord", "pc"), "nieuw wachtwoord werkt");
});

test("voortgang resetten wist tas, geld en level, maar houdt het account", async () => {
  const ctx = setup();
  const anna = await player(ctx, "anna");
  const result = ctx.admin.resetProgress(anna.userId);
  assert.ok(result.cleared >= 2);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM player_currencies WHERE player_id = ?").get(anna.profileId).n, 0);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM player_progression WHERE player_id = ?").get(anna.profileId).n, 0);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM users WHERE id = ?").get(anna.userId).n, 1);
});

test("verwijderen: speler weg, maar nooit jezelf of een admin", async () => {
  const ctx = setup();
  const anna = await player(ctx, "anna");
  assert.throws(() => ctx.admin.remove("admin", "admin"), { status: 403 });
  ctx.admin.remove(anna.userId, "admin");
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM users WHERE id = ?").get(anna.userId).n, 0);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM player_profiles WHERE id = ?").get(anna.profileId).n, 0);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) AS n FROM player_currencies WHERE player_id = ?").get(anna.profileId).n, 0);
});
