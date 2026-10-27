try {
  const awayAt = Number(localStorage.getItem("mamu_app_locked_at")) || 0;
  const mustLock = localStorage.getItem("mamu_app_is_locked") === "1" || awayAt > 0;
  if (localStorage.getItem("mamu_token") && mustLock) document.documentElement.dataset.appLockRequired = "true";
  else if (!localStorage.getItem("mamu_token")) {
    localStorage.removeItem("mamu_app_locked_at");
    localStorage.removeItem("mamu_app_is_locked");
  }
} catch (_) {}
