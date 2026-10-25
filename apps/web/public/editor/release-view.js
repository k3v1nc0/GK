// F3-E2-T02/T03 + F3-E3-T01: publiceren als immutable build, terugzetten, en verhuizen uit Nodes per domein.
import { api, el, friendlyError } from "./canonical-api.js";

const DOMAIN_LABELS = { project: "Projectnaam", items: "Items", pickups: "Item-pickups" };

function cutoverSection(ctx, signal, rerender) {
  const box = el("div", { class: "cwForm" });
  const isAdmin = ctx.workspace.user.role === "admin";
  const load = el("button", { type: "button", class: "ghost", text: "Bekijk verhuisrapport" });
  const output = el("div");
  load.addEventListener("click", async () => {
    load.disabled = true;
    try {
      const report = await api("/api/authoring/cutover");
      renderReport(report);
    } catch (error) {
      ctx.setStatus(friendlyError(error), "error");
    } finally {
      load.disabled = false;
    }
  }, { signal });

  function renderReport(report) {
    const inv = report.inventory;
    output.replaceChildren(
      el("p", { class: "cwHint", text: "Graphrevisie " + report.graphRevision + " · in Nodes: " + inv.items + " items, " + inv.pickups.itemPickups + " item-pickups, " +
        inv.pickups.currencyPickups + " geld-pickups en " + inv.pickups.pickupComponents + " pickup-componenten (die laatste twee blijven in Nodes)." }),
      ...report.plans.map((plan) => {
        const canonical = plan.writer === "canonical";
        const accept = el("input", { type: "checkbox" });
        const finalize = el("button", { type: "button", text: "Verhuis " + DOMAIN_LABELS[plan.domain] + " naar Canoniek", disabled: canonical || !isAdmin || plan.blocking.length > 0 });
        finalize.addEventListener("click", async () => {
          if (!window.confirm("Na verhuizen beheer je " + DOMAIN_LABELS[plan.domain] + " alleen nog in Canoniek. In Nodes wordt het alleen-lezen. Doorgaan?")) return;
          finalize.disabled = true;
          try {
            const result = await api("/api/authoring/cutover/finalize", { method: "POST", body: { domain: plan.domain, acceptDiffs: accept.checked }, revision: report.graphRevision });
            ctx.setStatus(DOMAIN_LABELS[plan.domain] + " verhuisd: " + result.created.length + " nieuw in Canoniek. Publiceer een build om het in de game te zetten.", "ok");
            await rerender();
          } catch (error) {
            finalize.disabled = false;
            ctx.setStatus(friendlyError(error), "error");
          }
        }, { signal });
        const status = canonical ? "in Canoniek" : (plan.ok ? "GO" : (plan.blocking.length ? "NO-GO: blokkerend" : "let op: " + plan.diffCount + " afwijkingen"));
        const details = el("pre", { class: "cwReport" });
        details.textContent = JSON.stringify({
          blokkerend: plan.blocking,
          afwijkingen: plan.parity.filter((entry) => entry.diffs.length),
          nieuw: plan.create.length,
          bestaatAl: plan.keep,
          vergeleken: plan.comparedObjects
        }, null, 2);
        return el("div", {}, [
          el("h4", {}, [el("span", { text: DOMAIN_LABELS[plan.domain] + " " }), el("span", { class: "cwBadge", "data-writer": plan.writer, text: status })]),
          el("p", { class: "cwHint", text: plan.comparedObjects + " objecten vergeleken met de game zoals hij nu draait · " + plan.create.length + " worden aangemaakt" }),
          plan.diffCount > 0 && !canonical ? el("label", { class: "cwCheck" }, [accept, el("span", { text: "Ik heb de afwijkingen bekeken en accepteer ze" })]) : null,
          el("div", { class: "cwRow" }, [finalize]),
          details
        ]);
      })
    );
  }

  box.append(
    el("h3", { text: "Verhuizen uit Nodes" }),
    el("p", { class: "cwHint", text: "Volgorde: Projectnaam, Items, daarna Item-pickups. Het rapport schrijft niets. Verhuizen kan alleen als alles gelijk werkt, of als je afwijkingen bewust accepteert." }),
    el("div", { class: "cwRow" }, [load]),
    output
  );
  return box;
}

export async function mountReleaseView(host, ctx, signal) {
  const { release, builds, audit, user, cutover } = ctx.workspace;
  const rerender = async () => { if (signal.aborted) return; await ctx.refresh(); host.replaceChildren(); await mountReleaseView(host, ctx, signal); };
  const publish = el("button", { type: "button", "data-cw": "publish", text: "Publiceer build" });
  publish.addEventListener("click", async () => {
    publish.disabled = true;
    try {
      const result = await api("/api/authoring/publish", { method: "POST", body: {}, revision: release.revision });
      ctx.setStatus("Build " + result.buildId + " is nu actief. Spelers zien de nieuwe inhoud direct; een open game-tab meldt dat hij kan verversen.", "ok");
      await rerender();
    } catch (error) {
      publish.disabled = false;
      ctx.setStatus(friendlyError(error), "error");
    }
  }, { signal });

  const rows = builds.map((build) => {
    const active = build.buildId === release.activeBuildId;
    const back = el("button", { type: "button", class: "ghost", "data-cw": "rollback", "data-build": build.buildId, text: "Terugzetten naar deze build", disabled: active || user.role !== "admin" });
    back.addEventListener("click", async () => {
      const reason = window.prompt("Reden voor terugzetten?", "Rollback-proef");
      if (!reason) return;
      try {
        await api("/api/authoring/rollback", { method: "POST", body: { buildId: build.buildId, reason }, revision: release.revision });
        ctx.setStatus("Build " + build.buildId + " is weer actief. Inventarissen van spelers blijven zoals ze zijn.", "ok");
        await rerender();
      } catch (error) {
        ctx.setStatus(friendlyError(error), "error");
      }
    }, { signal });
    return el("tr", { class: active ? "cwActive" : "" }, [
      el("td", { text: build.buildId + (active ? " (actief)" : "") }),
      el("td", { text: new Date(build.createdAt).toLocaleString() }),
      el("td", { text: build.provenance.documents.length + " documenten" }),
      el("td", { text: build.rootSha256.slice(0, 12) }),
      el("td", {}, back)
    ]);
  });

  const auditList = el("ul", { class: "cwAudit" }, audit.map((row) => el("li", { text: new Date(row.created_at).toLocaleString() + " · " + row.action + " · " + (row.from_build_id || "-") + " -> " + row.to_build_id + (row.reason ? " · " + row.reason : "") })));
  const writers = ["project", "items", "pickups"].map((domain) => DOMAIN_LABELS[domain] + ": " + (cutover?.[domain]?.writer === "canonical" ? "Canoniek" : "Nodes")).join(" · ");

  host.append(
    el("h2", { text: "Publiceren" }),
    el("p", { class: "cwHint", text: "Actief: " + (release.activeBuildId || "nog geen build") + " · releaserevisie " + release.revision }),
    el("p", { class: "cwHint", text: "Wie beheert wat: " + writers }),
    el("div", { class: "cwRow" }, [publish]),
    el("h3", { text: "Builds" }),
    builds.length ? el("table", { class: "cwTable" }, [el("thead", {}, el("tr", {}, ["Build", "Gemaakt", "Inhoud", "Root-hash", ""].map((text) => el("th", { text })))), el("tbody", {}, rows)]) : el("p", { class: "cwHint", text: "Nog geen builds." }),
    el("h3", { text: "Logboek" }), auditList,
    cutoverSection(ctx, signal, rerender)
  );
}
