export const GAME_BIBLE_NODE_SAVE_CLIENT_ROUTE = "/editor/game-bible-node/save-client.js";

export function renderGameBibleNodeSaveClient(): string {
  return `(() => {
  const endpoint = "/editor/game-bible-node/save";

  function readCookie(name) {
    const prefix = name + "=";
    return document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) || "";
  }

  function readCsrfToken() {
    return document.querySelector('meta[name="gk-csrf-token"]')?.getAttribute("content") || readCookie("gk_csrf");
  }

  async function saveGameBibleNodeViaProtectedApi() {
    clearTimeout(saveTimeout);
    appData.updatedAt = new Date().toISOString();
    localStorage.setItem("GameBibleNodeBackupV611", JSON.stringify(appData));
    setStatus("Opslaan...", "saving");

    const csrfToken = readCsrfToken();
    const headers = {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest"
    };

    if (csrfToken) {
      headers["X-GK-CSRF-Token"] = csrfToken;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: JSON.stringify(appData, null, 2)
      });

      if (!response.ok) {
        let error = "Opslaan geweigerd";
        try {
          const body = await response.json();
          error = mapSaveError(body?.error, response.status);
        } catch (_error) {
          error = await response.text();
        }

        throw new Error(error);
      }

      setStatus("Opgeslagen", "success");
    } catch (error) {
      setStatus("Lokaal bewaard", "error");
      console.warn("GameBibleNode API save failed", error);
    }
  }

  window.saveGameBibleNodeViaProtectedApi = saveGameBibleNodeViaProtectedApi;
  window.__GK_GAMEBIBLE_SAVE_ENDPOINT = endpoint;

  try {
    saveData = saveGameBibleNodeViaProtectedApi;
  } catch (_error) {
    window.saveData = saveGameBibleNodeViaProtectedApi;
  }

  function mapSaveError(code, status) {
    if (status === 401 || code === "missing_editor_admin") {
      return "Niet ingelogd als editor admin";
    }

    if (code === "csrf_required") {
      return "CSRF-controle mislukt";
    }

    if (code === "origin_not_allowed") {
      return "Origin niet toegestaan";
    }

    if (code === "invalid_json") {
      return "Ongeldige JSON";
    }

    if (code === "game_bible_json_contract_invalid") {
      return "GameBibleNode contract ongeldig";
    }

    if (code === "game_bible_save_locked") {
      return "Opslaan is tijdelijk vergrendeld";
    }

    return code || "Opslaan geweigerd";
  }
})();`;
}
