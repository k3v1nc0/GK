// Instellingen > 👥 Gebruikers (alleen admin): naam wijzigen, nieuw wachtwoord, voortgang resetten, verwijderen.
import { api, el, friendlyError } from "./canonical-api.js";

function ago(iso) {
  if (!iso) return "nooit";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "net";
  if (minutes < 60) return minutes + " min geleden";
  if (minutes < 48 * 60) return Math.round(minutes / 60) + " uur geleden";
  return Math.round(minutes / 1440) + " dagen geleden";
}

const ROLE_LABELS = { admin: "👑 admin", editor: "🛠️ editor", player: "🎮 speler" };

export async function renderUsers(host, { setStatus = () => {}, rerender = () => {} } = {}) {
  host.replaceChildren(el("div", { class: "wbdHead" }, [el("span", { class: "wbdHeadIcon", text: "👥" }),
    el("div", { class: "wbdHeadText" }, [el("div", { class: "wbdHeadKind", text: "Gebruikers" }), el("div", { class: "wbdHeadName", text: "Laden..." })])]));
  let data;
  try {
    data = await api("/api/admin/users");
  } catch (error) {
    host.append(el("div", { class: "wbdNote", text: friendlyError(error) }));
    return;
  }
  host.querySelector(".wbdHeadName").textContent = data.users.length + " accounts";
  host.append(el("div", { class: "wbdNote", text: "🟢 = nu online. Na een wijziging wordt dat account overal uitgelogd." }));
  const run = async (label, request) => {
    try {
      await request();
      setStatus(label, "success");
    } catch (error) {
      setStatus(friendlyError(error), "error");
    }
    rerender();
  };
  const list = el("div", { class: "wbdBuilds" });
  for (const user of data.users) {
    const me = user.id === data.me;
    const button = (text, title, onClick, disabled = false) => {
      const node = el("button", { type: "button", class: "wbdGhost", text, title, disabled });
      node.addEventListener("click", onClick);
      return node;
    };
    const actions = el("div", { class: "wbdUserActions" }, [
      button("✏️", "Naam wijzigen", () => {
        const name = window.prompt("Nieuwe naam voor " + user.username + ":", user.username);
        if (!name || name === user.username) return;
        run("Naam gewijzigd.", () => api("/api/admin/users/" + encodeURIComponent(user.id) + "/name", { method: "POST", body: { name } }));
      }),
      button("🔑", "Nieuw wachtwoord", () => {
        const password = window.prompt("Nieuw wachtwoord voor " + user.username + " (minstens 8 tekens):", "");
        if (!password) return;
        run("Wachtwoord gewijzigd.", () => api("/api/admin/users/" + encodeURIComponent(user.id) + "/password", { method: "POST", body: { password } }));
      }, user.role === "admin" && !me),
      button("♻️", "Voortgang resetten (tas, geld, quests, level, plek)", () => {
        if (!window.confirm("Alle voortgang van " + user.username + " wissen? De speler begint dan opnieuw. Dit kun je niet terugdraaien.")) return;
        run("Voortgang van " + user.username + " gewist.", () => api("/api/admin/users/" + encodeURIComponent(user.id) + "/reset", { method: "POST", body: {} }));
      }, !user.playerId),
      button("🗑️", "Account verwijderen", () => {
        if (!window.confirm("Account " + user.username + " helemaal verwijderen? Dit kun je niet terugdraaien.")) return;
        run("Account " + user.username + " verwijderd.", () => api("/api/admin/users/" + encodeURIComponent(user.id), { method: "DELETE" }));
      }, me || user.role === "admin")
    ]);
    list.append(el("div", { class: "wbdBuild" }, [
      el("span", { class: "wbdBuildIcon", text: user.online ? "🟢" : "⚪" }),
      el("div", { class: "wbdBuildText" }, [
        el("div", { text: user.username + (me ? " (jij)" : "") }),
        el("div", { class: "wbdMuted", text: (ROLE_LABELS[user.role] || user.role) + (user.level ? " · level " + user.level : "") + (user.characters > 1 ? " · " + user.characters + " characters" : "") + " · laatst " + ago(user.lastSeenAt) })
      ]),
      actions
    ]));
  }
  host.append(list);
}
