// Keep the main app URL as the single entry point.
(() => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  const hasSession = Boolean(localStorage.getItem("mamu_token"));
  window.location.replace(hasSession ? "/index.html" : "/login.html");
})();
