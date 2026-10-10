(() => {
  const tokenKey = "mamu_token";
  const lockedAtKey = "mamu_app_locked_at";
  const lockedStateKey = "mamu_app_is_locked";
  const delay = 10_000;
  const token = () => localStorage.getItem(tokenKey);
  if (!token()) return;
  let initialAwayAt = Number(localStorage.getItem(lockedAtKey)) || 0;
  const shouldStartLocked = localStorage.getItem(lockedStateKey) === "1" || (initialAwayAt > 0 && Date.now() - initialAwayAt >= delay);
  if (!shouldStartLocked && initialAwayAt) localStorage.removeItem(lockedAtKey);

  const style = document.createElement("style");
  style.textContent = `
    html[data-app-lock-required="true"] body > :not(#standaloneAppLock){visibility:hidden!important}
    #standaloneAppLock{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;background:#f4f7fc;color:#132238;font:16px system-ui,sans-serif}
    #standaloneAppLock .lock-card{width:min(100%,360px);text-align:center;padding:28px 22px;border-radius:24px;background:#fff;box-shadow:0 18px 55px #0f234129}
    #standaloneAppLock .lock-mark{width:58px;height:58px;margin:0 auto 14px;display:grid;place-items:center;border-radius:18px;background:#2563eb;color:#fff;font-size:28px;font-weight:800}
    #standaloneAppLock h1{margin:0 0 7px;font-size:23px}#standaloneAppLock p{margin:0 0 14px;color:#64748b;font-size:14px}
    #standaloneAppLock .dots{display:flex;justify-content:center;gap:13px;margin:10px 0 14px}#standaloneAppLock .dots i{width:11px;height:11px;border:2px solid #94a3b8;border-radius:50%}#standaloneAppLock .dots i.on{border-color:#2563eb;background:#2563eb}
    #standaloneAppLock .keys{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}
    #standaloneAppLock button{min-height:50px;border:1px solid #e1e8f2;border-radius:14px;background:#f8faff;color:#132238;font:700 20px system-ui,sans-serif;cursor:pointer}
    #standaloneAppLock button.action{font-size:14px;color:#475569}#standaloneAppLock button.primary{width:100%;background:#2563eb;color:#fff;border:0;font-size:16px}
    #standaloneAppLock button.logout{width:100%;margin-top:8px;font-size:14px}#standaloneAppLock button.biometric{width:100%;margin:0 0 10px;background:#eef4ff;color:#174ea6;font-size:15px}
    #standaloneAppLock .error{min-height:20px;margin:4px 0!important;color:#d14343!important;font-size:13px!important}
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "standaloneAppLock";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "standaloneLockTitle");
  root.innerHTML = `<section class="lock-card"><div class="lock-mark">M</div><h1 id="standaloneLockTitle">App locked</h1><p>Enter your 4-digit transaction PIN to continue.</p><div class="dots"><i></i><i></i><i></i><i></i></div><p class="error" aria-live="polite"></p><div class="keys"><button data-digit="1">1</button><button data-digit="2">2</button><button data-digit="3">3</button><button data-digit="4">4</button><button data-digit="5">5</button><button data-digit="6">6</button><button data-digit="7">7</button><button data-digit="8">8</button><button data-digit="9">9</button><button class="action" data-action="clear">Clear</button><button data-digit="0">0</button><button class="action" data-action="delete" aria-label="Delete last digit">⌫</button></div><button class="biometric" data-action="biometric" hidden>Enable fingerprint or Face ID</button><button class="primary" data-action="unlock">Unlock</button><button class="action logout" data-action="logout">Log out</button></section>`;
  root.hidden = true;
  document.body.appendChild(root);

  const dots = [...root.querySelectorAll(".dots i")];
  const error = root.querySelector(".error");
  let pin = "";
  let busy = false;
  let timer;
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
      biometricButton.hidden = false;
      biometricButton.textContent = biometricEnabled ? "Unlock with fingerprint or Face ID" : "Enable fingerprint or Face ID";
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
  const schedule = () => {
    clearTimeout(timer);
    if (!token() || root.isConnected && !root.hidden || !document.hidden) return;
    const awayAt = Number(localStorage.getItem(lockedAtKey)) || Date.now();
    timer = setTimeout(() => { if (document.hidden && token()) lock(); }, Math.max(0, delay - (Date.now() - awayAt)));
  };
  const markAway = () => {
    if (!token() || root.isConnected && !root.hidden) return;
    try { localStorage.setItem(lockedAtKey, String(Date.now())); } catch (_) {}
    schedule();
  };
  if (shouldStartLocked) lock();
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || busy) return;
    if (button.dataset.digit && pin.length < 4) { pin += button.dataset.digit; update(); return; }
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
          document.documentElement.dataset.appLockRequired = "false"; root.remove(); schedule(); return;
        }
        if (!/^\d{4}$/.test(pin)) { error.textContent = "Enter your 4-digit transaction PIN to enable biometric unlock."; return; }
        error.textContent = "Setting up device biometrics…";
        const { options } = await passkeyFetch("/passkey/register/options", { pin });
        const credential = await navigator.credentials.create({ publicKey: prepareOptions(options) });
        await passkeyFetch("/passkey/register/verify", { credential: serializeCredential(credential) });
        biometricEnabled = true; pin = ""; update();
        error.textContent = "Biometric unlock is ready on this device.";
        button.textContent = "Unlock with fingerprint or Face ID";
      } catch (err) {
        if (err.name !== "NotAllowedError" && err.name !== "AbortError") error.textContent = err.message || "Biometric unlock failed. Use your PIN.";
      } finally { busy = false; button.disabled = false; }
      return;
    }
    if (button.dataset.action !== "unlock") return;
    if (!/^\\d{4}$/.test(pin)) { error.textContent = "Enter all 4 digits."; return; }
    busy = true; button.disabled = true; error.textContent = "Checking PIN…";
    try {
      const response = await fetch("/api/security/transaction-pin/verify", { method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${token()}`}, body:JSON.stringify({pin}) });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        localStorage.removeItem(lockedAtKey); localStorage.removeItem(lockedStateKey);
        document.documentElement.dataset.appLockRequired = "false"; root.remove(); schedule(); return;
      }
      if (response.status === 400 && /transaction pin has not been created/i.test(data.message || "")) { location.href = "/index.html"; return; }
      if (response.status === 401 && !/incorrect transaction pin/i.test(data.message || "")) {
        [tokenKey, "mamu_user", lockedAtKey, lockedStateKey].forEach((key) => localStorage.removeItem(key));
        location.href = "/login.html"; return;
      }
      pin = ""; update(); error.textContent = response.status === 401 ? "Incorrect PIN. Try again." : (data.message || "Could not verify PIN. Try again.");
    } catch (_) { error.textContent = "Could not connect. Check your connection and try again."; }
    finally { busy = false; button.disabled = false; }
  });
  const checkAwayAndLock = () => {
    if (document.hidden) return;
    clearTimeout(timer);
    const awayAt = Number(localStorage.getItem(lockedAtKey)) || 0;
    const shouldLockNow = localStorage.getItem(lockedStateKey) === "1" || (awayAt > 0 && Date.now() - awayAt >= delay);
    if (shouldLockNow && token()) lock();
    else if (awayAt) localStorage.removeItem(lockedAtKey);
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) markAway();
    else checkAwayAndLock();
  });
  window.addEventListener("pageshow", checkAwayAndLock);
  window.addEventListener("focus", checkAwayAndLock);
  window.addEventListener("blur", markAway);
  window.addEventListener("pagehide", markAway);
})();
