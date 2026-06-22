const form = document.querySelector("#loginForm");
const statusText = document.querySelector("#statusText");

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  statusText.textContent = "";
  const data = new FormData(form);
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: data.get("username"), password: data.get("password") })
  });
  const result = await response.json();
  if (!response.ok) {
    statusText.textContent = result.message || "Login mislukt.";
    return;
  }
  const next = new URLSearchParams(window.location.search).get("next") || "/editor/";
  window.location.href = next;
});
