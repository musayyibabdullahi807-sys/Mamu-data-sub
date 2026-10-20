(() => {
  const tokenKey = "mamu_token";
  const lockedAtKey = "mamu_app_locked_at";
  const lockedStateKey = "mamu_app_is_locked";
  const token = () => localStorage.getItem(tokenKey);
  try {
    const account = JSON.parse(localStorage.getItem("mamu_user") || "null");
    const accountId = account?._id || account?.id || account?.userId || account?.phone;
    const savedTheme = accountId ? localStorage.getItem(`mamu_theme_${encodeURIComponent(String(accountId))}`) : null;
    document.documentElement.dataset.theme = savedTheme === "dark" ? "dark" : "light";
  } catch (_) { document.documentElement.dataset.theme = "light"; }
  if (!token()) return;
  let initialAwayAt = Number(localStorage.getItem(lockedAtKey)) || 0;
  const shouldStartLocked = localStorage.getItem(lockedStateKey) === "1" || initialAwayAt > 0;
  if (!shouldStartLocked && initialAwayAt) localStorage.removeItem(lockedAtKey);

  const style = document.createElement("style");
  style.textContent = `
    html[data-app-lock-required="true"] body > :not(#standaloneAppLock){visibility:hidden!important}
    #standaloneAppLock{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:0 18px 28px;background:var(--mamu-bg,#f6f8fc);color:var(--mamu-text,#111827);font:16px Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
    #standaloneAppLock .lock-brand{position:absolute;inset:0 0 auto;height:330px;padding:48px 20px 115px;background:linear-gradient(135deg,var(--mamu-primary-dark,#1d4ed8),var(--mamu-primary,#2563eb));color:#fff;text-align:center}
    #standaloneAppLock .lock-mark{width:76px;height:76px;margin:0 auto 17px;display:grid;place-items:center;border:2px solid #fff;border-radius:22px;background:var(--mamu-primary-dark,#1d4ed8);color:#fff;font-size:30px;font-weight:900}
    #standaloneAppLock .lock-brand h1{margin:0;color:#fff;font-size:25px;font-weight:900;letter-spacing:-.7px}#standaloneAppLock .lock-brand p{margin:8px 0;color:#aaa;font-size:13px}
    #standaloneAppLock .lock-card{position:relative;z-index:1;width:min(100%,394px);margin:275px auto 0;padding:28px 21px 24px;border:1px solid var(--mamu-border,#e5e7eb);border-radius:26px;background:var(--mamu-surface,#fff);color:var(--mamu-text,#111827);text-align:center;box-shadow:0 15px 45px #0002}
    #standaloneAppLock .lock-card h2{margin:0 0 7px;font-size:23px;font-weight:900;color:var(--mamu-text,#111827)}#standaloneAppLock .lock-card p{margin:0 0 14px;color:var(--mamu-muted,#6b7280);font-size:14px}
    #standaloneAppLock .dots{display:flex;justify-content:center;gap:13px;margin:10px 0 14px}#standaloneAppLock .dots i{width:11px;height:11px;border:2px solid var(--mamu-muted,#6b7280);border-radius:50%}#standaloneAppLock .dots i.on{border-color:var(--mamu-primary,#2563eb);background:var(--mamu-primary,#2563eb)}
    #standaloneAppLock .keys{display:grid;grid-template-columns:repeat(3,58px);justify-content:center;gap:11px 20px;margin:14px 0}
    #standaloneAppLock button{width:58px;height:58px;padding:0;border:1px solid var(--mamu-border,#e5e7eb);border-radius:50%;background:var(--mamu-surface,#fff);color:var(--mamu-text,#111827);font:700 21px system-ui,sans-serif;cursor:pointer;box-shadow:0 3px 10px #0001}
    #standaloneAppLock button:active{background:var(--mamu-primary,#2563eb);color:#fff}#standaloneAppLock button.action{font-size:12px}
    #standaloneAppLock button.logout,#standaloneAppLock button.biometric{width:100%;height:auto;min-height:44px;margin:0 0 10px;border-radius:12px;font-size:14px}
    #standaloneAppLock .error{min-height:20px;margin:4px 0!important;color:#c62828!important;font-size:13px!important}
    :root[data-theme="dark"] #standaloneAppLock{--mamu-bg:#0b1220;--mamu-surface:#111c2e;--mamu-text:#e5e7eb;--mamu-muted:#a0aec0;--mamu-border:#29364a;--mamu-primary:#2563eb;--mamu-primary-dark:#1e40af}
    #standaloneAppLock .lock-card{box-shadow:0 15px 45px rgba(0,0,0,.18)}
    @media(max-height:700px){#standaloneAppLock .lock-brand{height:260px;padding-top:24px}#standaloneAppLock .lock-card{margin-top:215px;padding-top:20px}#standaloneAppLock .keys{gap:7px 18px;margin:10px 0}#standaloneAppLock button{width:50px;height:50px}}
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "standaloneAppLock";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "standaloneLockTitle");
  root.innerHTML = `<div class="lock-brand"><div class="lock-mark">M</div><h1>MAMU DATA SUB</h1><p>Secure access to your account</p></div><section class="lock-card" role="dialog" aria-modal="true" aria-labelledby="standaloneLockTitle"><h2 id="standaloneLockTitle">Welcome back</h2><p>Enter your 4-digit transaction PIN to continue.</p><div class="dots"><i></i><i></i><i></i><i></i></div><p class="error" aria-live="polite"></p><div class="keys"><button data-digit="1">1</button><button data-digit="2">2</button><button data-digit="3">3</button><button data-digit="4">4</button><button data-digit="5">5</button><button data-digit="6">6</button><button data-digit="7">7</button><button data-digit="8">8</button><button data-digit="9">9</button><button class="action" data-action="clear">Clear</button><button data-digit="0">0</button><button class="action" data-action="delete" aria-label="Delete last digit">⌫</button></div><button class="biometric" data-action="biometric" hidden>Enable fingerprint or Face ID</button><button class="action logout" data-action="logout">Log out</button></section>`;
  root.hidden = true;
  document.body.appendChild(root);

  const dots = [...root.querySelectorAll(".dots i")];
  const error = root.querySelector(".error");
  let pin = "";
  let busy = false;
  let biometricEnabled = false;
  const biometricButton = root.querySelector('[data-action="biometric"]');
  const fromBase64Url = (value) => {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  };
  const toBase64Url = (buffer) => {
    let binary = "";
    new Uint8Array(buffer).forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };
  const serializeCredential = (credential) => {
    const response = credential.response;
    const serialized = { id: credential.id, rawId: toBase64Url(credential.rawId), type: credential.type, response: {} };
    ["clientDataJSON", "attestationObject", "authenticatorData", "signature", "userHandle"].forEach((key) => {
      if (response[key]) serialized.response[key] = toBase64Url(response[key]);
    });
    if (response.getTransports) serialized.response.transports = response.getTransports();
    return serialized;
  };
  const prepareOptions = (options) => {
    options.challenge = fromBase64Url(options.challenge);
    if (options.user?.id) options.user.id = fromBase64Url(options.user.id);
    ["allowCredentials", "excludeCredentials"].forEach((key) => {
      if (options[key]) options[key] = options[key].map((item) => ({ ...item, id: fromBase64Url(item.id) }));
    });
    return options;
  };
  const passkeyFetch = async (path, body) => {
    const response = await fetch(`/api/security${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || "Biometric unlock is unavailable.");
    return data;
  };
  if (biometricButton && window.PublicKeyCredential && navigator.credentials) {
    passkeyFetch("/passkey/status").then((data) => {
      biometricEnabled = data.enabled;
      biometricButton.hidden = !biometricEnabled;
      biometricButton.textContent = "Unlock with fingerprint or Face ID";
    }).catch(() => { biometricButton.hidden = true; });
  }
  const update = () => dots.forEach((dot, index) => dot.classList.toggle("on", index < pin.length));
  const lock = () => {
    document.documentElement.dataset.appLockRequired = "true";
    if (!root.isConnected) document.body.appendChild(root);
    try { localStorage.setItem(lockedAtKey, String(Date.now())); localStorage.setItem(lockedStateKey, "1"); } catch (_) {}
    pin = ""; update(); error.textContent = "";
    root.hidden = false;
  };
  const markAway = () => {
    if (!token() || root.isConnected && !root.hidden) return;
    try { localStorage.setItem(lockedAtKey, String(Date.now())); } catch (_) {}
  };
  const checkAwayAndLock = () => {
    if (document.hidden || !token() || root.isConnected && !root.hidden) return;
    if (localStorage.getItem(lockedStateKey) === "1") lock();
    else localStorage.removeItem(lockedAtKey);
  };
  if (shouldStartLocked) lock();
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || busy) return;
    if (button.dataset.digit && pin.length < 4) { pin += button.dataset.digit; update(); if (pin.length === 4) verifyPin(); return; }
    if (button.dataset.action === "clear") { pin = ""; update(); return; }
    if (button.dataset.action === "delete") { pin = pin.slice(0, -1); update(); return; }
    if (button.dataset.action === "logout") {
      [tokenKey, "mamu_user", lockedAtKey, lockedStateKey].forEach((key) => localStorage.removeItem(key));
      location.href = "/login.html";
      return;
    }
    if (button.dataset.action === "biometric") {
      if (!window.PublicKeyCredential || !navigator.credentials) return;
      busy = true; button.disabled = true;
      try {
        if (biometricEnabled) {
          error.textContent = "Confirm with your device biometrics…";
          const { options } = await passkeyFetch("/passkey/authenticate/options", {});
          const credential = await navigator.credentials.get({ publicKey: prepareOptions(options) });
          await passkeyFetch("/passkey/authenticate/verify", { credential: serializeCredential(credential) });
          localStorage.removeItem(lockedAtKey); localStorage.removeItem(lockedStateKey);
          document.documentElement.dataset.appLockRequired = "false"; root.remove(); return;
        }
        error.textContent = "Set up fingerprint or Face ID in Settings first.";
      } catch (err) {
        if (err.name !== "NotAllowedError" && err.name !== "AbortError") error.textContent = err.message || "Biometric unlock failed. Use your PIN.";
      } finally { busy = false; button.disabled = false; }
      return;
    }
    return;
  });
  async function verifyPin() {
    if (busy || !/^\d{4}$/.test(pin)) return;
    busy = true; error.textContent = "Checking PIN…";
    try {
      const response = await fetch("/api/security/transaction-pin/verify", { method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token()}`}, body:JSON.stringify({pin}) });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        localStorage.removeItem(lockedAtKey); localStorage.removeItem(lockedStateKey);
        document.documentElement.dataset.appLockRequired = "false"; root.remove(); return;
      }
      if (response.status === 400 && /transaction pin has not been created/i.test(data.message || "")) { location.href = "/index.html"; return; }
      if (response.status === 401 && !/incorrect transaction pin/i.test(data.message || "")) {
        [tokenKey, "mamu_user", lockedAtKey, lockedStateKey].forEach((key) => localStorage.removeItem(key));
        location.href = "/login.html"; return;
      }
      pin = ""; update(); error.textContent = response.status === 401 ? "Incorrect PIN. Try again." : (data.message || "Could not verify PIN. Try again.");
    } catch (_) { error.textContent = "Could not connect. Check your connection and try again."; }
    finally { busy = false; }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) markAway();
    else checkAwayAndLock();
  });
  window.addEventListener("pageshow", checkAwayAndLock);
  window.addEventListener("focus", checkAwayAndLock);
  window.addEventListener("blur", markAway);
  window.addEventListener("pagehide", markAway);
})();
