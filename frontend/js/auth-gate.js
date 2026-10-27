// Redirect signed-out visitors before the dashboard markup can render.
(() => {
  try {
    if (!localStorage.getItem("mamu_token")) {
      window.location.replace("/login.html");
    }
  } catch (_) {
    window.location.replace("/login.html");
  }
})();
