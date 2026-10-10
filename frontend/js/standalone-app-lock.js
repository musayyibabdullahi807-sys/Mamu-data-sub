(() => {
  const tokenKey = "mamu_token";
  const lockedAtKey = "mamu_app_locked_at";
  const lockedStateKey = "mamu_app_is_locked";
  const delay = 6_000;
  const token = () => localStorage.getItem(tokenKey);
  if (!token()) return;

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
    #standaloneAppLock button.logout{width:100%;margin-top:8px;font-size:14px}
    #standaloneAppLock .error{min-height:20px;margin:4px 0!important;color:#d14343!important;font-size:13px!important}
  `;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = "standaloneAppLock";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "standaloneLockTitle");
  root.innerHTML = `<section class="lock-card"><div class="lock-mark">M</div><h1 id="standaloneLockTitle">App locked</h1><p>Enter your 4-digit transaction PIN to continue.</p><div class="dots"><i></i><i></i><i></i><i></i></div><p class="error" aria-live="polite"></p><div class="keys"><button data-digit="1">1</button><button data-digit="2">2</button><button data-digit="3">3</button><button data-digit="4">4</button><button data-digit="5">5</button><button data-digit="6">6</button><button data-digit="7">7</button><button data-digit="8">8</button><button data-digit="9">9</button><button class="action" data-action="clear">Clear</button><button data-digit="0">0</button><button class="action" data-action="delete" aria-label="Delete last digit">⌫</button></div><button class="primary" data-action="unlock">Unlock</button><button class="action logout" data-action="logout">Log out</button></section>`;
  document.body.appendChild(root);

  const dots = [...root.querySelectorAll(".dots i")];
  const error = root.querySelector(".error");
  let pin = "";
  let busy = false;
  let timer;
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
    if (!token()) return;
    timer = setTimeout(lock, delay);
  };
  lock();
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
  ["pointerdown", "keydown", "touchstart"].forEach((name) => document.addEventListener(name, () => { if (!root.isConnected) schedule(); }, { passive:true }));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      try { localStorage.setItem(lockedAtKey, String(Date.now())); localStorage.setItem(lockedStateKey, "1"); } catch (_) {}
    } else if (localStorage.getItem(lockedStateKey) === "1" && token()) lock();
    else schedule();
  });
  window.addEventListener("pagehide", () => {
    try { localStorage.setItem(lockedAtKey, String(Date.now())); localStorage.setItem(lockedStateKey, "1"); } catch (_) {}
  });
})();
