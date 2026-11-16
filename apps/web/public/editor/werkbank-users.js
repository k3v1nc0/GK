// Instellingen > 👥 Gebruikers (alleen admin): naam wijzigen, nieuw wachtwoord, voortgang resetten, verwijderen.
// Werkbank Fase 10: daaronder 🚩 Meldingen: spelers die een andere speler meldden (met de chat die ze kregen).
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
      button("♻️", "Spel volledig resetten (characters, tas, geld, quests, level, plek)", () => {
        if (!window.confirm("Alle spelgegevens en characters van " + user.username + " wissen? Editorwerk en editorinstellingen blijven staan. De speler moet daarna opnieuw een character kiezen. Dit kun je niet terugdraaien.")) return;
        run("Spel van " + user.username + " volledig gereset.", () => api("/api/admin/users/" + encodeURIComponent(user.id) + "/reset", { method: "POST", body: {} }));
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
  await renderReports(host, run);
}

const CHANNEL_LABELS = { near: "Buurt", party: "Groep", whisper: "Fluisteren" };

// Werkbank Fase 10: meldingen van spelers. Open bovenaan; ✓ = afgehandeld (blijft nog even in de lijst staan).
async function renderReports(host, run) {
  let data;
  try {
    data = await api("/api/admin/reports");
  } catch (error) {
    host.append(el("div", { class: "wbdNote", text: "🚩 Meldingen: " + friendlyError(error) }));
    return;
  }
  const open = data.reports.filter((report) => report.status === "open");
  host.append(el("div", { class: "wbdHead" }, [el("span", { class: "wbdHeadIcon", text: "🚩" }),
    el("div", { class: "wbdHeadText" }, [el("div", { class: "wbdHeadKind", text: "Meldingen" }), el("div", { class: "wbdHeadName", text: open.length ? open.length + " open" : "Geen open meldingen" })])]));
  host.append(el("div", { class: "wbdNote", text: "Een speler meldt een ander via het spelermenu (Melden bij de maker). Je ziet de reden en de laatste chatberichten van die speler die de melder kreeg. Iemand weren: geef een nieuw wachtwoord of verwijder het account hierboven." }));
  if (!data.reports.length) return;
  const list = el("div", { class: "wbdBuilds" });
  for (const report of data.reports) {
    const chat = report.chat.length
      ? el("div", { class: "wbdMuted" }, report.chat.map((line) => el("div", { text: "💬 " + (CHANNEL_LABELS[line.channel] || line.channel) + " " + String(line.at || "").slice(11, 16) + ": " + line.text })))
      : el("div", { class: "wbdMuted", text: "Geen chat van deze speler bij de melder (de server onthoudt chat een kwartier)." });
    const done = el("button", { type: "button", class: "wbdGhost", text: "✓", title: "Afgehandeld", disabled: report.status !== "open" });
    done.addEventListener("click", () => run("Melding afgehandeld.", () => api("/api/admin/reports/" + report.id + "/done", { method: "POST", body: {} })));
    list.append(el("div", { class: "wbdBuild" }, [
      el("span", { class: "wbdBuildIcon", text: report.status === "open" ? "🚩" : "✅" }),
      el("div", { class: "wbdBuildText" }, [
        el("div", { text: report.reportedName + ": " + report.reasonText }),
        el("div", { class: "wbdMuted", text: "Gemeld door " + report.reporterName + " · " + ago(report.createdAt) + (report.handledBy ? " · afgehandeld door " + report.handledBy : "") }),
        chat
      ]),
      el("div", { class: "wbdUserActions" }, [done])
    ]));
  }
  host.append(list);
}
