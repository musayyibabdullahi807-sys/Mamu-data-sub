// Keep the main app URL as the single entry point. Verify saved sessions
// with the server so expired or revoked tokens go straight to login.
(() => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  const token = localStorage.getItem("mamu_token");
  if (!token) {
    window.location.replace("/login.html");
    return;
  }

  fetch("/api/auth/session", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  }).then((response) => {
    if (response.ok) {
      window.location.replace("/index.html");
      return;
    }

    if ([401, 403, 404].includes(response.status)) {
      localStorage.removeItem("mamu_token");
      localStorage.removeItem("mamu_user");
      localStorage.removeItem("mamu_app_locked_at");
      localStorage.removeItem("mamu_app_is_locked");
    }

    window.location.replace(response.status >= 500 ? "/index.html" : "/login.html");
  }).catch(() => {
    // Keep a saved session on temporary network errors.
    window.location.replace("/index.html");
  });
})();
