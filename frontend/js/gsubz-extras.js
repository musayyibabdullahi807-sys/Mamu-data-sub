(() => {
  const root = document.getElementById("quickServicePage");
  if (!root) return;
  const token = () => localStorage.getItem("mamu_token");
  const node = (id) => document.getElementById(id);
  const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const money = (value) => new Intl.NumberFormat("en-NG", { style:"currency", currency:"NGN", maximumFractionDigits:2 }).format(Number(value || 0));
  const serviceInfo = {
    education:{ title:"Education", description:"Buy an exam PIN from GSUBZ.", kind:"education" },
    "recharge-pin":{ title:"Recharge PIN", description:"Generate recharge card PINs for resale.", kind:"recharge" },
    "bulk-sms":{ title:"Bulk SMS", description:"Send a message to Nigerian phone numbers.", kind:"sms" },
    esim:{ title:"eSIM", description:"Choose a country and data package.", kind:"esim" },
    "social-media":{ title:"Social Media", description:"Choose an available promotion package.", kind:"social" },
    "premium-apps":{ title:"Premium Apps", description:"Purchase available app subscriptions.", kind:"apps" },
    games:{ title:"Games", description:"Choose a game, region and product. Player details are checked before purchase.", kind:"games" },
  };
  let current = null;
  let catalog = [];
  let timer = null;
  let gameLines = [];

  async function request(path, options = {}) {
    const response = await fetch(path, { ...options, headers:{ ...(options.body ? { "Content-Type":"application/json" } : {}), Authorization:`Bearer ${token()}`, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.message || "Could not complete your request.");
    return data;
  }
  function selectOptions(items, placeholder, value, label) {
    return `<option value="">${safe(placeholder)}</option>${items.map((item) => `<option value="${safe(value(item))}">${safe(label(item))}</option>`).join("")}`;
  }
  function planSelect(services, serviceID) {
    const selected = services.find((x) => x.serviceID === serviceID);
    const plans = selected?.plans || [];
    return selectOptions(plans, plans.length ? "Choose a plan" : "No plans available", (x) => x.id, (x) => `${x.name} — ${money(x.price)}`);
  }

  async function loadPlanCatalog(kind) {
    const data = await request(`/api/services/gsubz/catalog/${kind}`);
    catalog = data.services || [];
    const service = node("extraServiceId");
    const plan = node("extraPlan");
    if (service) service.innerHTML = selectOptions(catalog.filter((x) => x.plans.length), "Choose service", (x) => x.serviceID, (x) => x.label);
    if (plan) plan.innerHTML = planSelect(catalog, service?.value || "");
  }

  function formMarkup(service) {
    if (service.kind === "education") return `<label>Exam service<select id="extraServiceId" required>${selectOptions([], "Loading services...", x=>x.serviceID, x=>x.label)}</select></label><label>Exam PIN plan<select id="extraPlan" required><option value="">Choose a service first</option></select></label><label>Phone number<input id="extraPhone" type="tel" inputmode="numeric" maxlength="15" placeholder="08030000000" required></label><button class="primary-btn full-btn" type="submit">Continue</button>`;
    if (service.kind === "social") return `<label>Promotion package<select id="extraPlan" required><option value="">Loading packages...</option></select></label><label>Public post/profile URL<input id="extraLink" type="url" placeholder="https://..." required></label><label>Quantity<input id="extraQuantity" type="number" min="1" step="1" placeholder="e.g. 100" required></label><button class="primary-btn full-btn" type="submit">Continue</button>`;
    if (service.kind === "games") return `<label>Game<select id="extraGame" required><option value="">Loading games...</option></select></label><label>Game region / product line<select id="extraGameLine" required disabled><option value="">Choose a game first</option></select></label><label>Game product<select id="extraGameProduct" required disabled><option value="">Choose a product line first</option></select></label><div id="extraGameRequirements"></div><p id="extraGameNote" class="quick-service-note"></p><button class="primary-btn full-btn" type="submit">Continue</button>`;
    if (service.kind === "apps") return `<label>App subscription<select id="extraPlan" required><option value="">Loading packages...</option></select></label><label>Phone number<input id="extraPhone" type="tel" inputmode="numeric" maxlength="15" placeholder="08030000000" required></label><button class="primary-btn full-btn" type="submit">Continue</button>`;
    if (service.kind === "recharge") return `<label>Network<select id="extraNetwork" required>${selectOptions([{id:"mtn"},{id:"airtel"},{id:"glo"},{id:"9mobile"}], "Choose network", x=>x.id, x=>x.id.toUpperCase())}</select></label><label>PIN value<select id="extraValue" required>${selectOptions([100,200,400,500], "Choose value", x=>x, x=>money(x))}</select></label><label>Number of PINs<input id="extraCount" type="number" min="1" max="500" step="1" placeholder="Minimum 10 for values below ₦500" required></label><p class="quick-service-note">PIN orders use your wallet. For values below ₦500, the provider requires at least 10 PINs.</p><button class="primary-btn full-btn" type="submit">Continue</button>`;
    if (service.kind === "sms") return `<label>Sender name (3–11 letters)<input id="extraSender" maxlength="11" pattern="[A-Za-z]{3,11}" placeholder="MyShop" required></label><label>Message<textarea id="extraMessage" maxlength="905" rows="4" placeholder="Write your message" required></textarea></label><label>Recipients (separate numbers with commas or new lines)<textarea id="extraRecipients" rows="5" placeholder="08030000000, 08040000000" required></textarea></label><p class="quick-service-note">Messages can cost ₦5 per page per recipient. Blocked content is rejected by the provider.</p><button class="primary-btn full-btn" type="submit">Continue</button>`;
    return `<label>Country<select id="extraCountry" required><option value="">Loading countries...</option></select></label><label>Data package<select id="extraPlan" required><option value="">Choose a country first</option></select></label><button class="primary-btn full-btn" type="submit">Continue</button>`;
  }

  function getPayload() {
    if (current.kind === "education") return { category:current.kind, serviceID:node("extraServiceId").value, plan:node("extraPlan").value, phone:node("extraPhone").value.trim() };
    if (current.kind === "social") return { category:current.kind, serviceID:"socials", plan:node("extraPlan").value, link:node("extraLink").value.trim(), quantity:Number(node("extraQuantity").value) };
    if (current.kind === "apps") return { category:current.kind, serviceID:"canva", plan:node("extraPlan").value, phone:node("extraPhone").value.trim() };
    if (current.kind === "games") {
      const line = gameLines.find((item) => String(item.lineID) === node("extraGameLine").value);
      const playerFields = {};
      (line?.requirements || []).forEach((item) => { const input = document.querySelector(`[data-game-field="${CSS.escape(item.field)}"]`); if (input) playerFields[item.field] = input.value.trim(); });
      return { category:"games", gameID:Number(node("extraGame").value), productID:node("extraGameProduct").value, playerFields };
    }
    if (current.kind === "recharge") return { category:current.kind, network:node("extraNetwork").value, value:Number(node("extraValue").value), count:Number(node("extraCount").value) };
    if (current.kind === "sms") return { category:current.kind, sender:node("extraSender").value.trim(), message:node("extraMessage").value.trim(), recipients:node("extraRecipients").value };
    return { category:current.kind, locationCode:node("extraCountry").value, packageCode:node("extraPlan").value };
  }

  function installEvents() {
    const form = node("quickServiceForm");
    if (!form) return;
    const ready = () => {
      const isValid = form.checkValidity();
      const payload = isValid ? getPayload() : null;
      if (current.kind === "games" && payload && (!payload.gameID || !payload.productID)) return false;
      if (current.kind === "recharge" && payload && payload.value < 500 && payload.count < 10) return false;
      return !!isValid && !!payload && Object.values(payload).every((x) => x !== "" && x !== null && x !== undefined);
    };
    const schedule = () => {
      clearTimeout(timer);
      if (!ready()) { window.scheduleServicePurchasePrompt?.({ ready:false }); return; }
      const payload = getPayload();
      const description = current.kind === "recharge" ? `Recharge PINs · ${payload.count} × ${money(payload.value)}` : current.kind === "sms" ? `Bulk SMS · ${payload.recipients.split(/[\\s,;]+/).filter(Boolean).length} recipients` : current.kind === "games" ? `Game top-up · ${node("extraGame").selectedOptions[0].text} · ${node("extraGameProduct").selectedOptions[0].text}` : current.title;
      window.scheduleServicePurchasePrompt?.({ ready:true, details:description, onConfirm:async (pin) => {
        const status = node("quickServiceStatus");
        status.className = "quick-service-status";
        status.textContent = "Processing your purchase...";
        try {
          const result = await request("/api/services/gsubz/purchase", { method:"POST", body:JSON.stringify({ ...payload, pin }) });
          const responseText = result.result?.api_response || result.message || "Purchase successful.";
          let extra = "";
          if (current.kind === "recharge" && Array.isArray(result.result?.pins)) extra = `<div class="quick-service-result"><b>Your PINs</b>${result.result.pins.map((p) => `<p>PIN: ${safe(p.pin)}<br>Serial: ${safe(p.sn)}</p>`).join("")}</div>`;
          if (current.kind === "esim" && result.result?.activationCode) extra = `<div class="quick-service-result"><b>eSIM details</b><p>${safe(result.result.activationCode)}</p>${result.result.qrCodeUrl ? `<img src="${safe(result.result.qrCodeUrl)}" alt="eSIM QR code" style="max-width:220px">` : ""}</div>`;
          if (current.kind === "games" && Array.isArray(result.result?.codes) && result.result.codes.length) extra = `<div class="quick-service-result"><b>Gift card codes</b>${result.result.codes.map((code) => `<p>Code: ${safe(code.code)}${code.serial ? `<br>Serial: ${safe(code.serial)}` : ""}${code.expiry ? `<br>Expiry: ${safe(code.expiry)}` : ""}</p>`).join("")}</div>`;
          status.className = `quick-service-status ${result.status === "pending" ? "" : "success"}`;
          status.innerHTML = `${safe(responseText)}<br>Charged ${money(result.amount)} · Reference ${safe(result.reference)}${result.status === "pending" ? '<br><button id="checkGameOrder" class="secondary-btn" type="button">Check game order</button>' : ""}${extra}`;
          if (result.status === "pending" && current.kind === "games") node("checkGameOrder")?.addEventListener("click", async () => {
            try { const check = await request(`/api/services/gsubz/game-orders/${encodeURIComponent(result.reference)}`); status.textContent = check.result?.api_response || (check.status === "successful" ? "Game order completed." : "Game order is still processing."); status.className = `quick-service-status ${check.status === "successful" ? "success" : ""}`; }
            catch (error) { status.textContent = error.message; status.className = "quick-service-status error"; }
          });
          if (typeof window.refreshHome === "function") await window.refreshHome();
          if (typeof window.loadTransactions === "function") await window.loadTransactions();
          form.reset();
          return true;
        } catch (error) {
          status.className = "quick-service-status error";
          status.textContent = error.message;
          const pinMessage = node("servicePurchasePinMessage");
          if (pinMessage) { pinMessage.textContent = error.message; pinMessage.className = "pin-prompt-message error"; }
          return false;
        }
      } });
    };
    form.addEventListener("input", schedule);
    form.addEventListener("change", schedule);
    form.addEventListener("submit", (event) => { event.preventDefault(); schedule(); });
    node("extraGame")?.addEventListener("change", async () => {
      const lineSelect = node("extraGameLine"), productSelect = node("extraGameProduct");
      lineSelect.disabled = true; productSelect.disabled = true;
      lineSelect.innerHTML = '<option value="">Loading game products...</option>';
      node("extraGameRequirements").innerHTML = "";
      try {
        const data = await request(`/api/services/gsubz/catalog/game-products?gameID=${encodeURIComponent(node("extraGame").value)}`);
        gameLines = data.lines || [];
        node("extraGameNote").textContent = data.game?.note || "";
        lineSelect.innerHTML = selectOptions(gameLines, "Choose region / line", (x) => x.lineID, (x) => `${x.name}${x.region ? ` — ${x.region}` : ""}`);
        lineSelect.disabled = !gameLines.length;
      } catch (error) { lineSelect.innerHTML = `<option value="">${safe(error.message)}</option>`; }
      schedule();
    });
    node("extraGameLine")?.addEventListener("change", () => {
      const line = gameLines.find((item) => String(item.lineID) === node("extraGameLine").value);
      const products = (line?.products || []).filter((item) => item.inStock !== false);
      const productSelect = node("extraGameProduct");
      productSelect.innerHTML = selectOptions(products, "Choose game product", (x) => x.productID, (x) => `${x.name} — ${money(x.price)}`);
      productSelect.disabled = !products.length;
      node("extraGameRequirements").innerHTML = (line?.requirements || []).map((field, index) => {
        const attr = safe(field.field), label = safe(field.label || field.field);
        const input = Array.isArray(field.options) && field.options.length ? `<select data-game-field="${attr}" ${field.required ? "required" : ""}>${selectOptions(field.options, `Choose ${label}`, (x) => x.value ?? x.id ?? x.code ?? x.name ?? x, (x) => x.label ?? x.name ?? x.value ?? x.code ?? x.id ?? x)}</select>` : `<input data-game-field="${attr}" type="${field.type === "number" ? "number" : "text"}" ${field.required ? "required" : ""} placeholder="${label}">`;
        return `<label class="quick-service-field">${label}${input}</label>`;
      }).join("");
      schedule();
    });
    node("extraGameProduct")?.addEventListener("change", schedule);
    node("extraServiceId")?.addEventListener("change", () => {
      node("extraPlan").innerHTML = planSelect(catalog, node("extraServiceId").value);
      schedule();
    });
    node("extraCountry")?.addEventListener("change", async () => {
      const select = node("extraPlan");
      select.innerHTML = '<option value="">Loading packages...</option>';
      try {
        const data = await request(`/api/services/gsubz/catalog/esim-packages?locationCode=${encodeURIComponent(node("extraCountry").value)}`);
        const packages = data.packages || [];
        select.innerHTML = selectOptions(packages, "Choose eSIM package", (x) => x.packageCode, (x) => `${x.name} — ${money(x.price)}`);
      } catch (error) { select.innerHTML = `<option value="">${safe(error.message)}</option>`; }
      schedule();
    });
  }

  async function openService(serviceID) {
    const info = serviceInfo[serviceID];
    if (!info) {
      const card = document.querySelector(`[data-service="${CSS.escape(serviceID)}"]`);
      const name = card?.querySelector("strong")?.textContent || serviceID;
      window.showPage?.("quickService");
      node("quickServiceTitle").textContent = name;
      node("quickServiceDescription").textContent = serviceID === "travel" ? "Travel bookings need a flight and hotel provider connection." : "A game top-up provider is not connected yet.";
      node("quickServiceContent").innerHTML = '<p class="quick-service-note">This option will be enabled after its provider is connected.</p>';
      node("quickServiceStatus").textContent = "";
      return;
    }
    current = { ...info };
    node("quickServiceTitle").textContent = info.title;
    node("quickServiceDescription").textContent = info.description;
    node("quickServiceStatus").textContent = "";
    node("quickServiceContent").innerHTML = `<form id="quickServiceForm" class="quick-service-form">${formMarkup(info)}</form>`;
    window.showPage?.("quickService");
    if (!token()) { node("quickServiceStatus").className = "quick-service-status error"; node("quickServiceStatus").textContent = "Sign in to your MAMU account first."; return; }
    installEvents();
    try {
      if (info.kind === "games") {
        const data = await request("/api/services/gsubz/catalog/games");
        const games = data.games || [];
        node("extraGame").innerHTML = selectOptions(games, "Choose a game", (x) => x.gameID, (x) => `${x.name}${x.fromPrice ? ` — from ${money(x.fromPrice)}` : ""}`);
      } else if (["education", "social", "apps"].includes(info.kind)) {
        await loadPlanCatalog(info.kind);
        if (info.kind === "social") node("extraServiceId")?.remove();
      } else if (info.kind === "esim") {
        const data = await request("/api/services/gsubz/catalog/esim-countries");
        const countries = data.countries || [];
        node("extraCountry").innerHTML = selectOptions(countries, "Choose country", (x) => x.locationCodes, (x) => `${x.country} (${x.plans} plans)`);
      }
    } catch (error) { node("quickServiceStatus").className = "quick-service-status error"; node("quickServiceStatus").textContent = error.message; }
  }
  window.openGsubzQuickService = openService;
})();
