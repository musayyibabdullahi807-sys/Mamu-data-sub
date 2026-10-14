/* =========================================================
   MAMU DATA SUB
   Frontend Application
   ========================================================= */

const API_BASE = "/api";
const TOKEN_KEY = "mamu_token";
const THEME_KEY = "mamu_theme";
const APP_LOCK_KEY = "mamu_app_locked_at";
const APP_LOCK_STATE_KEY = "mamu_app_is_locked";

function getAccountThemeKey(user = null) {
  try {
    const account = user || JSON.parse(localStorage.getItem("mamu_user") || "null");
    const accountId = account?._id || account?.id || account?.userId || account?.phone;
    return accountId ? `${THEME_KEY}_${encodeURIComponent(String(accountId))}` : null;
  } catch (_) { return null; }
}

function applySavedTheme() {
  let dark = false;
  try {
    const accountThemeKey = getAccountThemeKey();
    dark = accountThemeKey ? localStorage.getItem(accountThemeKey) === "dark" : false;
  } catch (_) {}
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const toggle = document.getElementById("settingsDarkModeToggle");
  if (toggle) toggle.checked = dark;
}

applySavedTheme();

let currentUser = null;
let allDataPlans = [];

/* =========================================================
   HELPERS
   ========================================================= */

const $ = (id) => document.getElementById(id);

const getToken = () => localStorage.getItem(TOKEN_KEY);

const money = (amount) => {
  const value = Number(amount || 0);

  return `₦${value.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const getInitial = (name) => {
  const text = String(name || "M").trim();

  return text ? text.charAt(0).toUpperCase() : "M";
};

/* =========================================================
   TOAST
   ========================================================= */

let toastTimer;

function showToast(message, type = "success") {
  const toast = $("toast");

  if (!toast) {
    alert(message);
    return;
  }

  toast.textContent = message;
  toast.className = `toast show ${type}`;

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.className = "toast";
  }, 3000);
}

/* =========================================================
   API REQUEST
   ========================================================= */

async function apiRequest(endpoint, options = {}) {
  const token = getToken();

  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (error) {
    throw new Error(
      "Ba a iya haɗawa da server ba. Ka tabbatar server yana aiki."
    );
  }

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (response.status === 401) {
  const authMessage =
    data.message || "Your session has expired. Please log in again.";

  if (
  authMessage === "Incorrect transaction PIN" ||
  authMessage === "Incorrect account password."
) {
  throw new Error(authMessage);
}

  localStorage.removeItem(TOKEN_KEY);
  currentUser = null;

  showToast(authMessage, "error");

  setTimeout(() => {
    window.location.href = "./login.html";
  }, 900);

  throw new Error(authMessage);
}

  if (!response.ok || data.success === false) {
  const error = new Error(
    data.message || `Request failed (${response.status})`
  );

  Object.assign(error, data);

  throw error;
}

  return data;
}

/* =========================================================
   AUTH CHECK
   ========================================================= */

function checkAuthentication() {
  const token = getToken();

  if (!token) {
    showToast("Ka fara login domin amfani da app.", "error");

    setTimeout(() => {
      window.location.href = "./login.html";
    }, 800);

    return false;
  }

  return true;
}

/* =========================================================
   PAGE NAVIGATION
   ========================================================= */

function showPage(page, { fromHistory = false } = {}) {
  if (!page) return;

  const pages = document.querySelectorAll(".page");

  pages.forEach((section) => {
    section.classList.remove("active");
  });

  const target = document.getElementById(`${page}Page`);

  if (!target) {
    console.warn(`Page not found: ${page}Page`);
    return;
  }

  const currentPage = document.querySelector(".page.active")?.id.replace(/Page$/, "");
  if (currentPage && currentPage !== page && !fromHistory) {
    window.history.pushState({ ...(window.history.state || {}), mamuPage: page }, "", window.location.href);
  }

  target.classList.add("active");

  const primaryNavigationPages = new Set(["home", "marketplace", "marketplaceCart", "transactions", "settings"]);
  const bottomNav = document.querySelector(".bottom-nav");
  const showBottomNav = primaryNavigationPages.has(page);
  bottomNav?.classList.toggle("quick-service-hidden", !showBottomNav);
  bottomNav?.setAttribute("aria-hidden", String(!showBottomNav));

  document.querySelectorAll("[data-page]").forEach((element) => {
    let buttonPage = element.dataset.page || "";

    if (buttonPage.endsWith("Page")) {
      buttonPage = buttonPage.slice(0, -4);
    }

    element.classList.toggle("active", buttonPage === page);
  });

  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function setupNavigation() {
  const activePage = document.querySelector(".page.active")?.id.replace(/Page$/, "") || "home";
  if (!window.history.state?.mamuPage) {
    window.history.replaceState({ ...(window.history.state || {}), mamuPage: activePage }, "", window.location.href);
  }
  window.addEventListener("popstate", (event) => {
    const page = event.state?.mamuPage;
    if (!page || !document.getElementById(`${page}Page`)) return;
    showPage(page, { fromHistory: true });
  });

  document.querySelectorAll("[data-page]").forEach((element) => {
    element.addEventListener("click", () => {
      let page = element.dataset.page || "";

      if (page.endsWith("Page")) {
        page = page.slice(0, -4);
      }

      if (!page) return;

      showPage(page);

      if (page === "home" || page === "fund") refreshHome();
      if (page === "data") loadDataPlans();
      if (page === "transactions") loadTransactions();
      if (page === "referral") loadReferral();
      if (page === "profile") loadProfile();
      if (page === "marketplace") window.refreshMarketplace?.();
    });
  });

  document.querySelectorAll("[data-back]").forEach((button) => {
    button.addEventListener("click", () => {
      let page = button.dataset.back || "home";

      if (page.endsWith("Page")) {
        page = page.slice(0, -4);
      }

      showPage(page);
    });
  });
}


/* =========================================================
   WALLET
   ========================================================= */

async function refreshHome() {
  return loadWallet();
}

async function loadWallet() {
  try {
    const data = await apiRequest("/wallet");

    const balance =
      data.walletBalance ??
      data.wallet?.balance ??
      data.wallet?.walletBalance ??
      data.balance ??
      0;

    if (currentUser) {
      currentUser.walletBalance = Number(balance);
      localStorage.setItem(
        "mamu_user",
        JSON.stringify(currentUser)
      );
    }

    updateWalletBalance(balance);
    return true;
  } catch (error) {
    if (error.message !== "Unauthorized") console.error("Wallet error:", error.message);
    return false;
  }
}

let walletBalanceVisible = true;
function updateWalletBalance(balance) {
  if ($("walletBalance")) {
    $("walletBalance").textContent = walletBalanceVisible ? money(balance) : "₦••••••";
  }
}
function setupBalanceToggle() {
  const button = $("toggleBalance");
  if (!button) return;
  const icon = (visible) => visible
    ? '<svg class="balance-eye-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>'
    : '<svg class="balance-eye-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m3 3 18 18M10.6 6.2A10.8 10.8 0 0 1 12 6c6.1 0 9.5 6 9.5 6a16 16 0 0 1-3.1 3.7M6.2 6.3C3.8 8 2.5 12 2.5 12s3.4 6 9.5 6a10 10 0 0 0 3.6-.7"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  const paint = () => {
    const label = walletBalanceVisible ? "Hide balance" : "Show balance";
    button.innerHTML = icon(walletBalanceVisible);
    button.setAttribute("aria-label", label);
    button.title = label;
  };
  paint();
  button.addEventListener("click", () => {
    walletBalanceVisible = !walletBalanceVisible;
    updateWalletBalance(currentUser?.walletBalance ?? 0);
    paint();
  });
}

function setupPullToRefresh() {
  const home = $("homePage");
  const indicator = $("pullRefreshIndicator");
  const label = $("pullRefreshLabel");
  if (!home || !indicator || !label) return;

  const threshold = 72;
  let startY = 0;
  let distance = 0;
  let pulling = false;
  let refreshing = false;
  const show = (value) => {
    indicator.setAttribute("aria-hidden", String(!value));
    indicator.classList.toggle("visible", value);
  };
  const reset = () => {
    pulling = false;
    distance = 0;
    home.classList.remove("pulling");
    indicator.style.setProperty("--pull-offset", "0px");
    indicator.classList.remove("armed", "refreshing");
    label.textContent = "Pull to refresh";
    show(false);
  };

  const scrollPosition = () => window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  document.addEventListener("touchstart", (event) => {
    if (!home.classList.contains("active") || refreshing || scrollPosition() > 0 || !event.touches.length) return;
    if (event.target.closest("input, textarea, select, button, a, video")) return;
    startY = event.touches[0].clientY;
    pulling = true;
  }, { passive: true, capture: true });

  document.addEventListener("touchmove", (event) => {
    if (!pulling || refreshing || !event.touches.length) return;
    distance = Math.max(0, Math.min(event.touches[0].clientY - startY, 110));
    if (distance <= 0) return;
    event.preventDefault();
    home.classList.add("pulling");
    indicator.style.setProperty("--pull-offset", `${Math.min(distance, 64)}px`);
    indicator.classList.toggle("armed", distance >= threshold);
    label.textContent = distance >= threshold ? "Release to refresh" : "Pull to refresh";
    show(distance > 12);
  }, { passive: false, capture: true });

  const finish = async () => {
    if (!pulling) return;
    const shouldRefresh = distance >= threshold;
    pulling = false;
    if (!shouldRefresh || refreshing) { reset(); return; }
    refreshing = true;
    home.classList.remove("pulling");
    indicator.classList.remove("armed");
    indicator.classList.add("refreshing");
    indicator.style.setProperty("--pull-offset", "56px");
    label.textContent = "Refreshing…";
    show(true);
    const results = await Promise.all([loadWallet(), loadProfile()]);
    label.textContent = results.every(Boolean) ? "Updated" : "Could not refresh";
    setTimeout(() => { refreshing = false; reset(); }, 650);
  };
  document.addEventListener("touchend", finish, { passive: true, capture: true });
  document.addEventListener("touchcancel", () => { if (!refreshing) reset(); }, { passive: true, capture: true });
}

/* =========================================================
   TRANSACTIONS
   ========================================================= */

async function loadTransactions() {
  try {
    const data = await apiRequest("/wallet/transactions");

    const transactions = Array.isArray(data.transactions)
      ? data.transactions
      : [];

    renderRecentTransactions(transactions);
    renderAllTransactions(transactions);
  } catch (error) {
    if (error.message !== "Unauthorized") {
      showToast(error.message, "error");
    }
  }
}

function transactionLabel(type) {
  const labels = {
    wallet_funding: "Wallet Funding",
    data_purchase: "Data Purchase",
    airtime_purchase: "Airtime Purchase",
    gsubz_purchase: "Quick Service Purchase",
    bill_payment: "Bill Payment",
    refund: "Refund",
    withdrawal: "Withdrawal",
    transfer: "Transfer",
  };

  return labels[type] || "Transaction";
}

function transactionIcon(type) {
  const icons = {
    wallet_funding: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v12H4z"/><path d="M4 10h16"/><path d="M16 14h2"/></svg>`,
    data_purchase: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M10 6h4M11 18h2"/></svg>`,
    airtime_purchase: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h4l2 5-3 2a15 15 0 0 0 5 5l2-3 5 2v4c0 1-1 2-2 2C11 20 4 13 4 5c0-1 1-2 2-2z"/></svg>`,
    bill_payment: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18l-5-3-5 3z"/><path d="M9 8h6M9 12h6"/></svg>`,
    refund: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H5l4-4M5 7a8 8 0 1 1-1 9"/></svg>`,
    withdrawal: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v12H5z"/><path d="M8 8V5h8v3M9 13h6"/></svg>`,
    transfer: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10l-3-3M17 17H7l3 3"/></svg>`
  };

  return icons[type] || `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/></svg>`;
}

function formatDate(dateValue) {
  if (!dateValue) return "";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function renderTransaction(transaction) {
  const status = String(transaction.status || "pending").toLowerCase();

const statusMap = {
  success: {
    label: "Successful",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m8 12 2.5 2.5L16 9"></path></svg>`
  },
  successful: {
    label: "Successful",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m8 12 2.5 2.5L16 9"></path></svg>`
  },
  pending: {
    label: "Pending",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>`
  },
  failed: {
    label: "Failed",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m9 9 6 6M15 9l-6 6"></path></svg>`
  },
  fail: {
    label: "Failed",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m9 9 6 6M15 9l-6 6"></path></svg>`
  }
};

const statusInfo = statusMap[status] || statusMap.pending;

  return `
    <div class="transaction-item">
      <div class="transaction-icon">
        ${transactionIcon(transaction.type)}
      </div>

      <div class="transaction-info">
        <strong>
          ${escapeHtml(transactionLabel(transaction.type))}
        </strong>

        <span>
          ${escapeHtml(
            transaction.description ||
              formatDate(transaction.createdAt) ||
              "Transaction"
          )}
        </span>
      </div>

      <div class="transaction-right">
        <div class="transaction-amount">
          ${money(transaction.amount)}
        </div>

        <span class="transaction-status status-${escapeHtml(status)}">
  ${statusInfo.icon}
  ${escapeHtml(statusInfo.label)}
</span>
      </div>
    </div>
  `;
}

function renderRecentTransactions(transactions) {
  const container = $("recentTransactions");

  if (!container) return;

  if (!transactions.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M7 15h3"/></svg></div>
        <h4>No transactions yet</h4>
        <p>Your recent transactions will appear here.</p>
      </div>
    `;

    return;
  }

  container.innerHTML = transactions
    .slice(0, 5)
    .map(renderTransaction)
    .join("");
}

function renderAllTransactions(transactions) {
  const container = $("allTransactions");

  if (!container) return;

  if (!transactions.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg></div>
        <h4>No transactions yet</h4>
        <p>Your transaction history will appear here.</p>
      </div>
    `;

    return;
  }

  container.innerHTML = transactions
    .map(renderTransaction)
    .join("");
}

/* =========================================================
   DATA PLANS
   ========================================================= */

async function loadDataPlans() {
  const container = $("popularPlans");

  if (container) {
    container.innerHTML = `
      <div class="loading">
        <span class="spinner"></span>
        Loading data plans...
      </div>
    `;
  }

  try {
    const data = await apiRequest("/data/plans");

    allDataPlans = Array.isArray(data.plans)
      ? uniqueDataPlans(data.plans)
      : [];

    renderPopularPlans();
    populateDataPlanSelect();
  } catch (error) {
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📱</div>
          <h4>Unable to load plans</h4>
          <p>${escapeHtml(error.message)}</p>
        </div>
      `;
    }

    if (error.message !== "Unauthorized") {
      console.error("Data plans error:", error.message);
    }
  }
}

function networkName(plan) {
  return (
    plan.networkName ||
    plan.network_name ||
    String(plan.network || "")
  );
}

function uniqueDataPlans(plans) {
  const seen = new Set();
  return plans.filter((plan) => {
    const normalize = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
    const price = Number(plan.sellingPrice);
    const key = [
      normalize(networkName(plan)),
      normalize(plan.plan || "Data Plan"),
      normalize(plan.validity || "Data"),
      Number.isFinite(price) ? price.toFixed(2) : normalize(plan.sellingPrice),
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderPopularPlans() {
  const container = $("popularPlans");

  if (!container) return;

  if (!allDataPlans.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📱</div>
        <h4>No active plans</h4>
        <p>Data plans are currently unavailable.</p>
      </div>
    `;

    return;
  }

  container.innerHTML = allDataPlans
    .slice(0, 6)
    .map((plan) => {
      return `
        <div class="plan-card">
          <div class="plan-info">
            <div class="plan-network">
              ${escapeHtml(networkName(plan))}
            </div>

            <div class="plan-name">
              ${escapeHtml(plan.plan || "Data Plan")}
            </div>

            <div class="plan-validity">
              ${escapeHtml(plan.validity || "Data")}
            </div>
          </div>

          <div class="plan-price">
            <strong>
              ${money(plan.sellingPrice)}
            </strong>

            <button
              class="plan-buy"
              type="button"
              data-buy-plan="${escapeHtml(plan._id)}"
            >
              Buy
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll("[data-buy-plan]").forEach((button) => {
    button.addEventListener("click", () => {
      const planId = button.dataset.buyPlan;

      const plan = allDataPlans.find(
        (item) => String(item._id) === String(planId)
      );

      if (!plan) return;

      showPage("data");
      selectedDataNetwork = networkName(plan).toUpperCase();
      selectedDataCategory = String(plan.planType || "").toLowerCase();
      document.querySelectorAll("[data-network]").forEach((item) => {
        item.classList.toggle("selected", (item.dataset.network || "").toUpperCase() === selectedDataNetwork);
      });
      populateDataPlanSelect();
      const select = $("dataPlan");
      if (select) {
        select.value = plan._id;
        document.querySelectorAll(".data-plan-card").forEach((item) => item.classList.toggle("selected", item.dataset.planId === String(plan._id)));
        window.queueDataPurchasePinPrompt?.();
      }
    });
  });
}

const DATA_CATEGORIES = {
  MTN: [
    { id: "mtn_sme", label: "MTN SME Data" },
    { id: "mtn_gifting", label: "MTN Gifting Data" },
  ],
  AIRTEL: [
    { id: "airtel_gifting", label: "Airtel Gifting Data" },
    { id: "airtel_sme", label: "Airtel SME Data" },
  ],
  GLO: [
    { id: "glo_data", label: "Glo Corporate Gifting Data" },
    { id: "glo_sme", label: "Glo SME Data" },
  ],
  "9MOBILE": [
    { id: "etisalat_data", label: "9mobile or T2 Data" },
  ],
};

let selectedDataNetwork = "";
let selectedDataCategory = "";
function setupDataNetworkCards() {
  const cards = document.querySelectorAll("[data-network]");
  if (!cards.length) return;

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      selectedDataNetwork = (card.dataset.network || "").toUpperCase();
      const firstCategory = (DATA_CATEGORIES[selectedDataNetwork] || [])[0];
      selectedDataCategory = firstCategory?.id || "";
      cards.forEach((item) => item.classList.toggle("selected", item === card));
      populateDataPlanSelect();
    });
  });
}

function populateDataPlanSelect() {
  const select = $("dataPlan");
  const cardsContainer = $("dataPlanCards");
  const categoryContainer = $("dataPlanCategoryCards");
  const title = $("dataPlanTitle");
  if (!select) return;

  select.innerHTML = '<option value="">Select a plan</option>';
  if (cardsContainer) cardsContainer.innerHTML = "";
  if (categoryContainer) categoryContainer.innerHTML = "";

  if (!selectedDataNetwork) {
    if (cardsContainer) cardsContainer.innerHTML = '<div class="data-plan-empty">Select a network to view available data types.</div>';
    if (title) title.textContent = "Data Plan";
    return;
  }

  const networkPlans = allDataPlans.filter((plan) =>
    networkName(plan).toUpperCase() === selectedDataNetwork
  );
  const categories = DATA_CATEGORIES[selectedDataNetwork] || [];

  if (!categories.length) {
    if (cardsContainer) cardsContainer.innerHTML = '<div class="data-plan-empty">No data types are currently available for this network.</div>';
    if (title) title.textContent = "Data Plan";
    return;
  }

  if (!selectedDataCategory || !categories.some((category) => category.id === selectedDataCategory)) {
    selectedDataCategory = categories[0]?.id || "";
  }

  categories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `data-category-card${selectedDataCategory === category.id ? " selected" : ""}`;
    button.textContent = category.label;
    button.addEventListener("click", () => {
      selectedDataCategory = category.id;
      populateDataPlanSelect();
    });
    categoryContainer?.appendChild(button);
  });

  if (!selectedDataCategory) {
    if (cardsContainer) cardsContainer.innerHTML = '<div class="data-plan-empty">Choose a data type above to view its plans.</div>';
    if (title) title.textContent = "Choose Data Type";
    return;
  }

  const category = categories.find((item) => item.id === selectedDataCategory);
  const filteredPlans = networkPlans.filter((plan) => String(plan.planType || "").toLowerCase() === selectedDataCategory);
  if (title) title.textContent = `${category.label} Plans`;
  if (!filteredPlans.length) {
    if (cardsContainer) cardsContainer.innerHTML = '<div class="data-plan-empty">No plans are currently available in this data type.</div>';
    return;
  }

  filteredPlans.forEach((plan) => {
    const option = document.createElement("option");
    option.value = plan._id;
    option.textContent = `${plan.plan || "Data"} - ${plan.validity || "Data"} - ${money(plan.sellingPrice)}`;
    select.appendChild(option);

    if (!cardsContainer) return;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "data-plan-card";
    card.dataset.planId = plan._id;
    card.innerHTML = `
      <span class="plan-check">✓</span>
      <div class="plan-name">${escapeHtml(plan.plan || "Data")}</div>
      <div class="plan-validity">${escapeHtml(plan.validity || "Data")}</div>
      <div class="plan-price">${money(plan.sellingPrice)}</div>
    `;
    card.addEventListener("click", () => {
      select.value = plan._id;
      cardsContainer.querySelectorAll(".data-plan-card").forEach((item) => item.classList.toggle("selected", item === card));
      window.queueDataPurchasePinPrompt?.();
    });
    cardsContainer.appendChild(card);
  });
}

/* =========================================================
   PURCHASE RECEIPT
   ========================================================= */

let currentReceipt = null;

function showPurchaseReceipt({
  status = "successful",
  phone = "",
  network = "",
  plan = "",
  amount = 0,
  reference = "",
  providerReference = "",
  walletBalance = 0,
}) {
  const modal = $("receiptModal");
  if (!modal) return;

  const statusEl = $("receiptStatus");

  const statusMap = {
    successful: {
      text: "✓ Purchase Successful",
      className: "",
    },
    failed: {
      text: "❌ Purchase Failed",
      className: "failed",
    },
    pending: {
      text: "⏳ Transaction Pending",
      className: "pending",
    },
  };

  const currentStatus = statusMap[status] || statusMap.pending;

  statusEl.textContent = currentStatus.text;
  statusEl.className = `receipt-status ${currentStatus.className}`;

  $("receiptPhone").textContent = phone || "—";
  $("receiptNetwork").textContent = network || "—";
  $("receiptPlan").textContent = plan || "—";
  $("receiptAmount").textContent = money(amount);
  $("receiptReference").textContent = reference || "—";
  $("receiptProviderReference").textContent =
    providerReference || "—";

  $("receiptDate").textContent = new Date().toLocaleString();

  $("receiptBalance").textContent = money(walletBalance);

  currentReceipt = {
    status,
    phone,
    network,
    plan,
    amount,
    reference,
    providerReference,
    walletBalance,
    date: $("receiptDate").textContent,
  };

  modal.classList.add("show");
}

function closePurchaseReceipt() {
  const modal = $("receiptModal");
  if (modal) {
    modal.classList.remove("show");
  }
}

function createPurchaseReceiptImage(receipt) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1040;
    const ctx = canvas.getContext("2d");
    if (!ctx) return reject(new Error("Canvas is not available"));
    const rounded = (x, y, width, height, radius, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, radius);
      ctx.fill();
    };
    ctx.fillStyle = "#eef3fa";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    rounded(52, 44, 796, 952, 30, "#ffffff");
    rounded(52, 44, 796, 220, 30, "#155eef");
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 36px system-ui, sans-serif";
    ctx.fillText("MAMU DATA SUB", 92, 118);
    ctx.font = "500 24px system-ui, sans-serif";
    ctx.fillStyle = "#dbeafe";
    ctx.fillText("Transaction Receipt", 92, 160);
    const statusText = receipt.status === "successful" ? "PURCHASE SUCCESSFUL" : receipt.status === "failed" ? "PURCHASE FAILED" : "TRANSACTION PENDING";
    const statusColor = receipt.status === "successful" ? "#15803d" : receipt.status === "failed" ? "#b91c1c" : "#a16207";
    const statusBg = receipt.status === "successful" ? "#dcfce7" : receipt.status === "failed" ? "#fee2e2" : "#fef3c7";
    rounded(92, 190, 340, 44, 22, statusBg);
    ctx.fillStyle = statusColor;
    ctx.font = "800 17px system-ui, sans-serif";
    ctx.fillText(statusText, 112, 219);
    ctx.fillStyle = "#64748b";
    ctx.font = "600 18px system-ui, sans-serif";
    ctx.fillText("AMOUNT", 96, 326);
    ctx.fillStyle = "#0f172a";
    ctx.font = "800 46px system-ui, sans-serif";
    ctx.fillText(money(receipt.amount), 96, 385);
    const rows = [
      ["Phone", receipt.phone], ["Network", receipt.network], ["Service", receipt.plan],
      ["Reference", receipt.reference], ["Provider reference", receipt.providerReference || "—"],
      ["Date & time", receipt.date], ["Wallet balance", money(receipt.walletBalance)],
    ];
    let y = 452;
    rows.forEach(([label, value]) => {
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(96, y); ctx.lineTo(804, y); ctx.stroke();
      ctx.textAlign = "left";
      ctx.fillStyle = "#64748b";
      ctx.font = "500 19px system-ui, sans-serif";
      ctx.fillText(label, 98, y + 38);
      ctx.textAlign = "right";
      ctx.fillStyle = "#0f172a";
      ctx.font = "700 19px system-ui, sans-serif";
      let text = String(value || "—");
      while (ctx.measureText(text).width > 430 && text.length > 8) text = `${text.slice(0, -5)}…`;
      ctx.fillText(text, 800, y + 38);
      y += 68;
    });
    ctx.textAlign = "center";
    ctx.fillStyle = "#64748b";
    ctx.font = "500 17px system-ui, sans-serif";
    ctx.fillText("Thank you for using MAMU DATA SUB", 450, 958);
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not render receipt image")), "image/png");
  });
}

function setupPurchaseReceipt() {
  $("doneReceiptBtn")?.addEventListener(
    "click",
    closePurchaseReceipt
  );

  $("shareReceiptBtn")?.addEventListener("click", async () => {
    if (!currentReceipt) return;
    try {
      const blob = await createPurchaseReceiptImage(currentReceipt);
      const file = new File([blob], `mamu-receipt-${currentReceipt.reference || Date.now()}.png`, { type: "image/png" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: "MAMU DATA SUB Receipt", files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast("Receipt image downloaded. You can share it from your gallery.", "success");
      }
    } catch (error) {
      if (error.name !== "AbortError") showToast("Could not create or share receipt image.", "error");
    }
  });
}

/* =========================================================
   DATA PURCHASE
   ========================================================= */

function setupDataPurchase() {
  const purchaseButton = $("purchaseDataBtn");
  const modal = $("dataPurchasePinModal");
  const pinInput = $("dataPurchasePinInput");
  const pinMessage = $("dataPurchasePinMessage");
  const confirmButton = $("confirmDataPurchasePin");
  let pendingPurchase = null;

  if (!purchaseButton || !modal || !pinInput || !confirmButton) return;

  const openPinPrompt = () => {
    const phone = $("dataPhone")?.value.trim();
    const planId = $("dataPlan")?.value;
    if (!phone || !planId) {
      showToast("Enter your phone number and select a data plan first.", "error");
      return;
    }
    if (!/^\d{10,15}$/.test(phone)) {
      showToast("Please enter a valid phone number.", "error");
      $("dataPhone")?.focus();
      return;
    }

    const selectedPlan = allDataPlans.find((plan) => String(plan._id) === String(planId));
    pendingPurchase = {
      phone,
      planId,
      selectedPlan,
    };
    const planName = selectedPlan?.plan || "Data Plan";
    const amount = selectedPlan ? money(Number(selectedPlan.sellingPrice || 0)) : "—";
    $("dataPurchasePinDetails").textContent = `${planName} · ${phone} · ${amount}. Enter your transaction PIN to continue.`;
    pinInput.value = "";
    pinMessage.textContent = "";
    pinMessage.className = "pin-prompt-message";
    modal.classList.add("active");
    setTimeout(() => pinInput.focus(), 50);
  };

  const queuePinPrompt = () => {
    const phone = $("dataPhone")?.value.trim() || "";
    const ready = /^\d{10,15}$/.test(phone) && Boolean($("dataPlan")?.value);
    purchaseButton.hidden = false;
    purchaseButton.disabled = !ready;
    purchaseButton.textContent = "Proceed";
    purchaseButton.classList.toggle("is-ready", ready);
  };

  window.queueDataPurchasePinPrompt = queuePinPrompt;
  window.cancelDataPurchasePrompt = () => {
    modal.classList.remove("active");
    pendingPurchase = null;
  };
  purchaseButton.addEventListener("click", openPinPrompt);
  $("dataPhone")?.addEventListener("input", queuePinPrompt);
  $("dataPlan")?.addEventListener("change", queuePinPrompt);

  $("cancelDataPurchasePin")?.addEventListener("click", () => {
    modal.classList.remove("active");
    pinInput.value = "";
    pinMessage.textContent = "";
    pendingPurchase = null;
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.classList.remove("active");
      pinInput.value = "";
      pendingPurchase = null;
    }
  });

  confirmButton.addEventListener("click", async () => {
    const pin = pinInput.value.trim();
    if (!pendingPurchase) return;
    if (!/^\d{4}$/.test(pin)) {
      pinMessage.textContent = "Transaction PIN must be exactly 4 digits.";
      pinMessage.className = "pin-prompt-message error";
      pinInput.focus();
      return;
    }

    const { phone, planId, selectedPlan } = pendingPurchase;
    setButtonLoading(confirmButton, true, "Processing...");
    try {
      const data = await apiRequest("/data/purchase", {
        method: "POST",
        body: JSON.stringify({ planId, phone, pin }),
      });
      modal.classList.remove("active");
      pendingPurchase = null;
      showPurchaseReceipt({
        status: data.status || "successful",
        phone,
        network: selectedPlan ? networkName(selectedPlan) : "—",
        plan: selectedPlan?.plan || "Data Plan",
        amount: selectedPlan ? Number(selectedPlan.sellingPrice || 0) : 0,
        reference: data.reference || "",
        providerReference: data.providerReference || "",
        walletBalance: Number(data.walletBalance || 0),
      });
      showToast(data.message || "Data purchase request submitted successfully.", "success");
      $("dataPhone").value = "";
      $("dataPlan").value = "";
      queuePinPrompt();
      await refreshHome();
      await loadDataPlans();
    } catch (error) {
      modal.classList.remove("active");
      pendingPurchase = null;
      showPurchaseReceipt({
        status: error.status || "failed",
        phone,
        network: selectedPlan ? networkName(selectedPlan) : "—",
        plan: selectedPlan?.plan || "Data Plan",
        amount: selectedPlan ? Number(selectedPlan.sellingPrice || 0) : 0,
        reference: error.reference || "",
        providerReference: error.providerReference || "",
        walletBalance: Number(error.walletBalance || 0),
      });
      showToast(error.message || "Data purchase failed.", "error");
    } finally {
      setButtonLoading(confirmButton, false, "Confirm purchase");
    }
  });
}

let pendingServicePurchaseAction = null;

function scheduleServicePurchasePrompt({ ready, details, onConfirm, button, proceed = false }) {
  const modal = $("servicePurchasePinModal");
  if (!button || !modal) return;
  if (!ready) {
    button.hidden = false;
    button.disabled = true;
    button.classList.remove("is-ready");
    pendingServicePurchaseAction = null;
    return;
  }
  button.hidden = false;
  button.disabled = false;
  button.classList.add("is-ready");
  button.textContent = "Proceed";
  pendingServicePurchaseAction = onConfirm;
  if (!proceed) return;
  $("servicePurchasePinDetails").textContent = details;
  $("servicePurchasePinInput").value = "";
  $("servicePurchasePinMessage").textContent = "";
  $("servicePurchasePinMessage").className = "pin-prompt-message";
  modal.classList.add("active");
  setTimeout(() => $("servicePurchasePinInput")?.focus(), 50);
}

function setupServicePurchasePinPrompt() {
  const modal = $("servicePurchasePinModal");
  const pinInput = $("servicePurchasePinInput");
  const message = $("servicePurchasePinMessage");
  const confirm = $("confirmServicePurchasePin");
  if (!modal || !pinInput || !confirm) return;

  const close = () => {
    modal.classList.remove("active");
    pinInput.value = "";
    pendingServicePurchaseAction = null;
  };
  $("cancelServicePurchasePin")?.addEventListener("click", close);
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  confirm.addEventListener("click", async () => {
    const pin = pinInput.value.trim();
    if (!/^\d{4}$/.test(pin)) {
      message.textContent = "Transaction PIN must be exactly 4 digits.";
      message.className = "pin-prompt-message error";
      pinInput.focus();
      return;
    }
    const action = pendingServicePurchaseAction;
    if (!action) return;
    confirm.disabled = true;
    confirm.textContent = "Processing...";
    try {
      const completed = await action(pin);
      if (completed !== false) close();
    } catch (error) {
      message.textContent = error.message || "Purchase failed. Please try again.";
      message.className = "pin-prompt-message error";
    } finally {
      confirm.disabled = false;
      confirm.textContent = "Confirm purchase";
    }
  });
}

/* =========================================================
   AIRTIME
   ========================================================= */

function setupAirtimePurchase() {
  const button = $("purchaseAirtimeBtn");
  if (!button) return;
  let selectedNetwork = "";

  const maybePrompt = (proceed = false) => {
    const phone = $("airtimePhone")?.value.trim() || "";
    const amount = Number($("airtimeAmount")?.value);
    const ready = !!selectedNetwork && /^\d{10,15}$/.test(phone) && amount >= 100 && amount <= 50000;
    scheduleServicePurchasePrompt({
      ready, details: `Airtime · ${phone} · ${money(amount)}`, button, proceed,
      onConfirm: async (pin) => {
        $("airtimePin").value = pin;
        try {
          setButtonLoading(button, true);
          const data = await apiRequest("/airtime/purchase", { method:"POST", body:JSON.stringify({ serviceID:selectedNetwork, phone, amount, pin }) });
          showPurchaseReceipt({ status:data.status || "successful", phone, network:({ mtn:"MTN", airtel:"Airtel", glo:"Glo", etisalat:"9mobile", "9mobile":"9mobile" })[selectedNetwork] || selectedNetwork, plan:"Airtime Top-up", amount, reference:data.reference || "", providerReference:data.providerReference || "", walletBalance:Number(data.walletBalance || 0) });
          showToast(data.message || "Airtime purchase submitted successfully.", data.status === "pending" ? "error" : "success");
          $("airtimePhone").value = ""; $("airtimeAmount").value = ""; $("airtimePin").value = "";
          selectedNetwork = "";
          document.querySelectorAll("[data-airtime-network]").forEach((item) => item.classList.remove("selected"));
          maybePrompt();
          await refreshHome(); await loadTransactions();
          return true;
        } catch (error) {
          showPurchaseReceipt({ status:error.status || "failed", phone, network:({ mtn:"MTN", airtel:"Airtel", glo:"Glo", etisalat:"9mobile", "9mobile":"9mobile" })[selectedNetwork] || selectedNetwork, plan:"Airtime Top-up", amount, reference:error.reference || "", providerReference:error.providerReference || "", walletBalance:Number(error.walletBalance || 0) });
          showToast(error.message || "Airtime purchase failed.", "error");
          return true;
        }
        finally { setButtonLoading(button, false); }
      },
    });
  };

  button.addEventListener("click", () => maybePrompt(true));
  document.querySelectorAll("[data-airtime-network]").forEach((card) => {
    card.addEventListener("click", () => {
      selectedNetwork = card.dataset.airtimeNetwork || "";
      document.querySelectorAll("[data-airtime-network]").forEach((item) => item.classList.remove("selected"));
      card.classList.add("selected");
      maybePrompt();
    });
  });
  ["airtimePhone", "airtimeAmount"].forEach((id) => $(id)?.addEventListener("input", maybePrompt));
}

/* =========================================================
   ELECTRICITY
   ========================================================= */
function setupElectricityPayment() {
  const button = $("payElectricityBtn");
  if (!button) return;
  const maybePrompt = (proceed = false) => {
    const serviceID = $("electricityProvider")?.value || "";
    const customerID = $("electricityCustomer")?.value.trim() || "";
    const phone = $("electricityPhone")?.value.trim() || "";
    const amount = Number($("electricityAmount")?.value);
    const ready = !!serviceID && /^\d{5,30}$/.test(customerID) && /^\d{10,15}$/.test(phone) && amount >= 100;
    scheduleServicePurchasePrompt({
      ready, details:`Electricity · ${customerID} · ${money(amount)}`, button, proceed,
      onConfirm: async (pin) => {
        $("electricityPin").value = pin;
        try {
          setButtonLoading(button, true);
          const data = await apiRequest("/electricity/purchase", { method:"POST", body:JSON.stringify({ serviceID, customerID, phone, amount, pin }) });
          showToast(data.message || "Electricity payment submitted successfully.", "success");
          $("electricityCustomer").value = ""; $("electricityPhone").value = ""; $("electricityAmount").value = ""; $("electricityPin").value = "";
          maybePrompt();
          await refreshHome();
          return true;
        } catch (error) {
          $("servicePurchasePinMessage").textContent = error.message || "Electricity payment failed.";
          $("servicePurchasePinMessage").className = "pin-prompt-message error";
          return false;
        }
        finally { setButtonLoading(button, false); }
      },
    });
  };
  button.addEventListener("click", () => maybePrompt(true));
  ["electricityProvider", "electricityCustomer", "electricityPhone", "electricityAmount"].forEach((id) => {
    $(id)?.addEventListener(id === "electricityProvider" ? "change" : "input", maybePrompt);
  });
}

/* =========================================================
   TV
   ========================================================= */
function setupTVPayment() {
  const button = $("payTvBtn");
  if (!button) return;
  const maybePrompt = (proceed = false) => {
    const serviceID = $("tvProvider")?.value || "";
    const customerID = $("tvCustomer")?.value.trim() || "";
    const phone = $("tvPhone")?.value.trim() || "";
    const plan = $("tvPlan")?.value || "";
    const amount = Number($("tvAmount")?.value);
    const ready = !!serviceID && /^\d{5,30}$/.test(customerID) && /^\d{10,15}$/.test(phone) && !!plan && amount > 0;
    scheduleServicePurchasePrompt({
      ready, details:`TV subscription · ${customerID} · ${money(amount)}`, button, proceed,
      onConfirm: async (pin) => {
        $("tvPin").value = pin;
        try {
          setButtonLoading(button, true);
          const data = await apiRequest("/tv/purchase", { method:"POST", body:JSON.stringify({ serviceID, customerID, phone, plan, amount, pin }) });
          showToast(data.message || "TV subscription submitted successfully.", "success");
          $("tvCustomer").value = ""; $("tvPhone").value = ""; $("tvAmount").value = ""; $("tvPin").value = "";
          maybePrompt();
          await refreshHome();
          return true;
        } catch (error) {
          $("servicePurchasePinMessage").textContent = error.message || "TV payment failed.";
          $("servicePurchasePinMessage").className = "pin-prompt-message error";
          return false;
        }
        finally { setButtonLoading(button, false); }
      },
    });
  };
  button.addEventListener("click", () => maybePrompt(true));
  ["tvProvider", "tvCustomer", "tvPhone", "tvPlan", "tvAmount"].forEach((id) => {
    $(id)?.addEventListener(["tvProvider", "tvPlan"].includes(id) ? "change" : "input", maybePrompt);
  });
}
/* =========================================================
   PROFILE UPDATE
   ========================================================= */
async function loadProfile() {
  try {
    const data = await apiRequest("/profile/me");

    if (!data.user) {
      throw new Error("Profile data not found.");
    }

    currentUser = data.user;
    updateWalletBalance(currentUser.walletBalance ?? 0);

updateProfileUI(currentUser);
updateDashboardHeader();
    return true;
  } catch (error) {
    console.error("Load profile error:", error);
    showToast(
      error.message || "Unable to load profile.",
      "error"
    );
    return false;
  }
}

function updateProfileUI(user) {
  if (!user) return;

  const username =
    user.username || "User";

  const name =
    user.name || "";

  const phone =
    user.phone || "";

  const email =
    user.email || "";

  const state =
    user.state || "";

  const city =
    user.city || "";

  const address =
    user.address || "";

  const accountType =
    user.accountType || "Smart Earner";

  const usernameInput =
    $("profileUsernameInput");

  const nameInput =
    $("profileNameInput");

  const phoneInput =
    $("profilePhoneInput");

  const emailInput =
    $("profileEmailInput");

  const stateInput =
    $("profileStateInput");

  const cityInput =
    $("profileCityInput");

  const addressInput =
    $("profileAddressInput");

  const accountTypeInput =
    $("profileAccountTypeInput");

  const accountIdInput =
    $("profileAccountIdInput");

  const profileName =
    $("profileName");

  const profileUsername =
    $("profileUsername");

  const profileAvatar =
    $("profileAvatar");

  if (usernameInput) {
    usernameInput.value = username;
    usernameInput.readOnly = true;
  }

  if (nameInput) {
    nameInput.value = name;
    nameInput.readOnly = true;
  }

  if (phoneInput) {
    phoneInput.value = phone;
    phoneInput.readOnly = true;
  }

  if (emailInput) {
    emailInput.value = email;
    emailInput.readOnly = true;
  }

  if (accountTypeInput) {
    accountTypeInput.value = accountType;
    accountTypeInput.readOnly = true;
  }

  if (accountIdInput) {
    accountIdInput.value = user.id || "";
    accountIdInput.readOnly = true;
  }

  if (stateInput) {
    stateInput.value = state;
  }

  if (cityInput) {
    cityInput.value = city;
  }

  if (addressInput) {
    addressInput.value = address;
  }

  if (profileName) {
    profileName.textContent = name || "User";
  }

  if (profileUsername) {
    profileUsername.textContent = `@${username}`;
  }

  const editCount =
    Number(user.profileLocationEditCount || 0);

  const editsRemaining = Math.max(
    0,
    2 - editCount
  );

  const saveButton =
    $("saveProfileBtn");

  if (saveButton) {
    saveButton.style.display =
      editsRemaining > 0
        ? "block"
        : "none";
  }

  [stateInput, cityInput, addressInput].forEach(
    (input) => {
      if (!input) return;

      input.readOnly =
        editsRemaining <= 0;
    }
  );
}

function setupProfileUpdate() {
  const button = $("saveProfileBtn");

  if (!button) return;

  button.addEventListener("click", async () => {
    const state =
      $("profileStateInput")?.value.trim() || "";

    const city =
      $("profileCityInput")?.value.trim() || "";

    const address =
      $("profileAddressInput")?.value.trim() || "";

    const currentState =
      currentUser?.state || "";

    const currentCity =
      currentUser?.city || "";

    const currentAddress =
      currentUser?.address || "";

    if (
      state === currentState &&
      city === currentCity &&
      address === currentAddress
    ) {
      showToast(
        "No changes were made to your profile.",
        "error"
      );
      return;
    }

    setButtonLoading(
      button,
      true,
      "Saving..."
    );

    try {
      const data = await apiRequest("/profile/me", {
        method: "PUT",
        body: JSON.stringify({
          state,
          city,
          address,
        }),
      });

      currentUser = data.user;

      localStorage.setItem(
        "mamu_user",
        JSON.stringify(currentUser)
      );

      updateProfileUI(currentUser);

      showToast(
        data.message ||
          "Profile updated successfully.",
        "success"
      );
    } catch (error) {
      showToast(
        error.message ||
          "Unable to update profile.",
        "error"
      );
    } finally {
      setButtonLoading(
        button,
        false,
        "Save Changes"
      );
    }
  });
}

/* =========================================================
   REFERRAL
   ========================================================= */

async function loadReferral() {
  try {
    const data = await apiRequest("/referral");

    const referral = data.referral || {};

    if ($("referralCode")) {
      $("referralCode").textContent =
        referral.referralCode || "—";
    }

    if ($("totalReferrals")) {
      $("totalReferrals").textContent =
        referral.totalReferrals ?? 0;
    }

    if ($("successfulCommissions")) {
      $("successfulCommissions").textContent =
        referral.successfulCommissions ?? 0;
    }

    if ($("referralEarnings")) {
      $("referralEarnings").textContent =
        money(referral.referralEarnings || 0);
    }
  } catch (error) {
    if (error.message !== "Unauthorized") {
      showToast(error.message, "error");
    }
  }
}

function setupReferralCopy() {
  const button = $("copyReferralBtn");

  if (!button) return;

  button.addEventListener("click", async () => {
    const code =
      $("referralCode")?.textContent.trim() || "";

    if (!code || code === "—") {
      showToast("Referral code bai samu ba.", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(code);

      showToast("Referral code an copy ✅");
    } catch {
      showToast("An kasa copy referral code.", "error");
    }
  });
}

/* =========================================================
   FUND WALLET
   ========================================================= */
function setupGenerateAccountNumber() {
  const button = $("generateAccountNumberBtn");
  const modal = $("paystackTransferModal");
  let activeReference = null;
  let pollingReference = null;
  let checkingReference = null;

  if (!button || !modal) return;

  const closeModal = () => {
    modal.classList.remove("active");
    if (activeReference) {
      const status = $("generateAccountStatus");
      if (status) status.textContent = "Payment popup closed. Paystack status checks will continue until the transfer is confirmed.";
    }
  };
  $("cancelPaystackTransferPayment")?.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  $("copyPaystackTransferAccount")?.addEventListener("click", async () => {
    const number = $("paystackTransferAccount")?.textContent?.trim();
    if (!number || number === "—") return;
    try {
      await navigator.clipboard.writeText(number);
      showToast("Account number copied.", "success");
    } catch (_) {
      showToast("Could not copy account number.", "error");
    }
  });

  const verifyTransferStatus = async (reference, manual = false) => {
    if (activeReference !== reference) return;
    if (checkingReference === reference) {
      if (manual) $("paystackTransferStatus").textContent = "Payment status: Already checking with Paystack…";
      return;
    }

    checkingReference = reference;
    const checkButton = $("paystackTransferSentBtn");
    if (manual && checkButton) {
      checkButton.disabled = true;
      checkButton.textContent = "Checking with Paystack…";
    }

    try {
      const result = await apiRequest(`/payment/verify/${encodeURIComponent(reference)}`);
      if (activeReference !== reference) return;
      if (result.success && !result.pending) {
        $("paystackTransferStatus").textContent = "Payment status: Successful. Your wallet has been credited.";
        await Promise.all([loadWallet(), loadProfile(), loadTransactions()]);
        showToast("Paystack transfer confirmed and wallet funded.", "success");
        activeReference = null;
        return;
      }
      $("paystackTransferStatus").textContent = `Payment status: ${result.paymentStatus === "pending_bank_transfer" ? "Waiting for Paystack confirmation" : result.paymentStatus || "Waiting for transfer"}.`;
      if (manual) showToast("Paystack has not confirmed the transfer yet.", "success");
    } catch (error) {
      if (error.message === "Unauthorized") {
        activeReference = null;
        return;
      }
      if (error.message === "Payment failed") {
        $("paystackTransferStatus").textContent = "Payment status: Failed or expired. Generate a new transfer account to try again.";
        activeReference = null;
        return;
      }
      $("paystackTransferStatus").textContent = "Payment status: Waiting for transfer confirmation. Checking again…";
      if (manual) showToast("Could not check Paystack yet. The app will try again automatically.", "error");
    } finally {
      if (checkingReference === reference) checkingReference = null;
      if (manual && checkButton) {
        checkButton.disabled = activeReference !== reference;
        checkButton.textContent = "I've sent the money";
      }
    }
  };

  $("paystackTransferSentBtn")?.addEventListener("click", () => {
    if (activeReference) verifyTransferStatus(activeReference, true);
  });

  const pollPayment = async (reference) => {
    if (pollingReference === reference) return;
    pollingReference = reference;
    while (activeReference === reference) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      if (activeReference !== reference) break;
      await verifyTransferStatus(reference);
    }
    if (pollingReference === reference) pollingReference = null;
  };

  button.addEventListener("click", async () => {
    const amount = Number($("dashboardFundingAmount")?.value);
    const status = $("generateAccountStatus");
    if (!Number.isFinite(amount) || amount < 100) {
      showToast("Minimum funding amount is ₦100.", "error");
      return;
    }

    setButtonLoading(button, true, "Generating account…");
    if (status) status.textContent = "Requesting transfer details from Paystack…";
    try {
      const result = await apiRequest("/payment/bank-transfer/initialize", {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      const transfer = result.transfer;
      if (!result.success || !result.reference || !transfer?.accountNumber || !transfer?.bankName) {
        throw new Error(result.message || "Paystack did not provide transfer account details.");
      }

      activeReference = result.reference;
      $("paystackTransferBank").textContent = transfer.bankName;
      $("paystackTransferName").textContent = transfer.accountName || "Not provided by Paystack";
      $("paystackTransferAccount").textContent = transfer.accountNumber;
      $("paystackTransferAmount").textContent = `₦${Number(transfer.amount).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
      $("paystackTransferExpiry").textContent = transfer.accountExpiresAt
        ? new Date(transfer.accountExpiresAt).toLocaleString()
        : "Not provided by Paystack";
      $("paystackTransferStatus").textContent = `Payment status: ${result.paymentStatus || "Waiting for transfer"}.`;
      modal.classList.add("active");
      if (status) status.textContent = "Transfer account generated. Complete the transfer shown in the popup.";
      pollPayment(result.reference);
    } catch (error) {
      if (status) status.textContent = error.message || "Could not generate a transfer account.";
      showToast(error.message || "Could not generate a transfer account.", "error");
    } finally {
      setButtonLoading(button, false, "Generate Account Number");
    }
  });
}

function setupFundWallet() {
  const button = $("fundBtn");
  if (!button) return;

  button.addEventListener("click", async () => {
    const amount = Number($("fundAmount")?.value);
    if (!Number.isFinite(amount) || amount < 100) {
      showToast("Minimum funding amount is ₦100.", "error");
      return;
    }

    setButtonLoading(button, true, "Preparing payment...");
    try {
      const result = await apiRequest("/payment/initialize", {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      if (!result.success || !result.reference || !result.authorizationUrl) {
        throw new Error(result.message || "Paystack did not return a checkout URL.");
      }
      showToast("Opening Paystack Checkout…", "success");
      window.location.href = result.authorizationUrl;
    } catch (error) {
      console.error("Wallet funding error:", error);
      if (error.message !== "Unauthorized") {
        showToast(error.message || "Unable to start wallet funding.", "error");
      }
      setButtonLoading(button, false, "Continue with Paystack");
    }
  });
}

/* =========================================================
   BUTTON LOADING
   ========================================================= */

function setButtonLoading(button, loading, text) {
  if (!button) return;

  if (loading) {
    button.dataset.originalText =
      button.textContent;

    button.disabled = true;
    button.textContent = text;
  } else {
    button.disabled = false;

    button.textContent =
      button.dataset.originalText || text;
  }
}

/* =========================================================
   QUICK BUTTONS
   ========================================================= */

function setupAppLock() {
  const screen = $("appLockScreen");
  const input = $("appLockPin");
  const dots = $("appLockDots");
  const message = $("appLockMessage");
  const biometricButton = $("appLockBiometric");
  if (!screen || !input) return;

  const fromBase64Url = (value) => {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  };
  const toBase64Url = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };
  const serializeCredential = (credential) => {
    const response = credential.response;
    const serialized = { id: credential.id, rawId: toBase64Url(credential.rawId), type: credential.type, response: {} };
    if (response.clientDataJSON) serialized.response.clientDataJSON = toBase64Url(response.clientDataJSON);
    if (response.attestationObject) serialized.response.attestationObject = toBase64Url(response.attestationObject);
    if (response.authenticatorData) serialized.response.authenticatorData = toBase64Url(response.authenticatorData);
    if (response.signature) serialized.response.signature = toBase64Url(response.signature);
    if (response.userHandle) serialized.response.userHandle = toBase64Url(response.userHandle);
    if (response.getTransports) serialized.response.transports = response.getTransports();
    return serialized;
  };
  const passkeyRequestOptions = (options) => {
    options.challenge = fromBase64Url(options.challenge);
    if (options.user?.id) options.user.id = fromBase64Url(options.user.id);
    ["allowCredentials", "excludeCredentials"].forEach((key) => {
      if (options[key]) options[key] = options[key].map((credential) => ({ ...credential, id: fromBase64Url(credential.id) }));
    });
    return options;
  };
  const securityFetch = async (path, body) => {
    const response = await fetch(`${API_BASE}/security${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${getToken() || ""}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || "Biometric unlock is unavailable.");
    return data;
  };
  let biometricEnabled = false;
  const refreshBiometricStatus = async () => {
    if (!biometricButton || !window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) {
      if (biometricButton) biometricButton.hidden = true;
      return;
    }
    try {
      const data = await securityFetch("/passkey/status");
      biometricEnabled = data.enabled;
      biometricButton.hidden = !biometricEnabled;
      biometricButton.textContent = "Unlock with fingerprint or Face ID";
    } catch (_) { biometricButton.hidden = true; }
  };
  refreshBiometricStatus();
  window.addEventListener("mamu:passkey-changed", refreshBiometricStatus);

  let locked = document.documentElement.dataset.appLockRequired === "true" && Boolean(getToken());
  let busy = false;
  const updateDots = () => dots?.querySelectorAll("i").forEach((dot, index) => dot.classList.toggle("filled", index < input.value.length));
  const setLocked = (value) => {
    locked = value;
    screen.classList.toggle("active", value);
    screen.setAttribute("aria-hidden", String(!value));
    document.documentElement.classList.toggle("app-is-locked", value);
    document.documentElement.dataset.appLockRequired = String(value);
    if (value) {
      try { localStorage.setItem(APP_LOCK_KEY, String(Date.now())); localStorage.setItem(APP_LOCK_STATE_KEY, "1"); } catch (_) {}
      input.value = "";
      updateDots();
      message.textContent = "";
      message.className = "app-lock-message";
    } else {
      try { localStorage.removeItem(APP_LOCK_KEY); localStorage.removeItem(APP_LOCK_STATE_KEY); } catch (_) {}
    }
  };
  const markAway = () => {
    if (!getToken() || locked) return;
    try { localStorage.setItem(APP_LOCK_KEY, String(Date.now())); } catch (_) {}
  };
  const resumeApp = () => {
    if (document.hidden || !getToken() || locked) return;
    let shouldLock = false;
    try {
      shouldLock = localStorage.getItem(APP_LOCK_STATE_KEY) === "1";
      if (!shouldLock) localStorage.removeItem(APP_LOCK_KEY);
    } catch (_) {}
    if (shouldLock) setLocked(true);
  };

  if (locked) setLocked(true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      markAway();
      return;
    }
    resumeApp();
  });
  window.addEventListener("pagehide", markAway);
  window.addEventListener("pageshow", resumeApp);
  window.addEventListener("focus", resumeApp);

  screen.querySelectorAll("[data-lock-digit]").forEach((button) => {
    button.addEventListener("click", () => {
      if (locked && !busy && input.value.length < 4) {
        input.value += button.dataset.lockDigit; updateDots();
        if (input.value.length === 4) verifyPin();
      }
    });
  });
  screen.querySelector('[data-lock-action="clear"]')?.addEventListener("click", () => { input.value = ""; updateDots(); });
  screen.querySelector('[data-lock-action="delete"]')?.addEventListener("click", () => { input.value = input.value.slice(0, -1); updateDots(); });

  $("appLockLogout")?.addEventListener("click", () => {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem("mamu_user"); localStorage.removeItem(APP_LOCK_KEY); localStorage.removeItem(APP_LOCK_STATE_KEY); } catch (_) {}
    window.location.href = "./login.html";
  });

  biometricButton?.addEventListener("click", async () => {
    if (!locked || busy || !window.PublicKeyCredential || !navigator.credentials) return;
    busy = true;
    biometricButton.disabled = true;
    try {
      if (biometricEnabled) {
        message.textContent = "Confirm with your device biometrics…";
        const { options } = await securityFetch("/passkey/authenticate/options", {});
        const credential = await navigator.credentials.get({ publicKey: passkeyRequestOptions(options) });
        await securityFetch("/passkey/authenticate/verify", { credential: serializeCredential(credential) });
        setLocked(false);
      } else {
        message.textContent = "Set up fingerprint or Face ID in Settings first.";
      }
    } catch (error) {
      if (error.name !== "NotAllowedError" && error.name !== "AbortError") message.textContent = error.message || "Biometric unlock failed. Use your PIN.";
    } finally {
      busy = false;
      biometricButton.disabled = false;
    }
  });

  async function verifyPin() {
    if (!locked || busy || !/^\d{4}$/.test(input.value)) return;
    busy = true;
    message.textContent = "Checking PIN…";
    try {
      const response = await fetch(`${API_BASE}/security/transaction-pin/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() || ""}` },
        body: JSON.stringify({ pin: input.value }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.success) { setLocked(false); return; }
      if (response.status === 400 && /transaction pin has not been created/i.test(result.message || "")) {
        setLocked(false); openTransactionPinModal(); return;
      }
      if (response.status === 401 && !/incorrect transaction pin/i.test(result.message || "")) {
        localStorage.removeItem(TOKEN_KEY); localStorage.removeItem("mamu_user");
        localStorage.removeItem(APP_LOCK_KEY); localStorage.removeItem(APP_LOCK_STATE_KEY);
        window.location.href = "./login.html"; return;
      }
      input.value = ""; updateDots();
      message.textContent = response.status === 401 ? "Incorrect PIN. Try again." : (result.message || "Could not verify PIN. Try again.");
    } catch (_) {
      message.textContent = "Could not connect. Check your connection and try again.";
    } finally { busy = false; }
  }
}

function setupSignOut() {
  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("mamu_user");
    currentUser = null;

    window.location.href = "./login.html";
  };

  $("signOutBtn")?.addEventListener("click", signOut);
  $("sideSignOutBtn")?.addEventListener("click", signOut);
}

function setupSettings() {
  const darkModeToggle = $("settingsDarkModeToggle");
  const applyTheme = (dark) => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      const accountThemeKey = getAccountThemeKey(currentUser);
      if (accountThemeKey) localStorage.setItem(accountThemeKey, dark ? "dark" : "light");
    } catch (_) {}
  };
  if (darkModeToggle) {
    darkModeToggle.checked = document.documentElement.dataset.theme === "dark";
    darkModeToggle.addEventListener("change", () => applyTheme(darkModeToggle.checked));
  }

  $("settingsTransactionPinBtn")?.addEventListener("click", () => {
    $("resetTransactionPinBtn")?.click();
  });

  setupBiometricSettings();

  $("settingsSupportBtn")?.addEventListener("click", () => {
    openWhatsAppSupport();
  });

  $("settingsSignOutBtn")?.addEventListener("click", () => {
    $("signOutBtn")?.click();
  });
}

function setupBiometricSettings() {
  const settingsButton = $("settingsBiometricBtn");
  const status = $("settingsBiometricStatus");
  const modal = $("biometricSetupModal");
  const pinInput = $("biometricSetupPin");
  const message = $("biometricSetupMessage");
  const confirmButton = $("confirmBiometricSetupBtn");
  const closeButton = $("cancelBiometricSetupBtn");
  if (!settingsButton || !modal || !pinInput || !confirmButton) return;

  const setStatus = (text) => {
    if (status) status.textContent = text;
    // Keep the Settings row clickable so the setup dialog can explain any
    // browser or server limitation instead of appearing unresponsive.
    settingsButton.disabled = false;
  };
  const fetchPasskeyStatus = async () => {
    if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) {
      setStatus("Open MAMU in a secure browser that supports device biometrics");
      return false;
    }
    try {
      const data = await apiRequest("/security/passkey/status");
      setStatus(data.enabled ? "Biometric unlock is enabled for this account" : "Not set up on this account");
      return true;
    } catch (error) {
      setStatus(error.message || "Could not check biometric setup");
      return false;
    }
  };
  const fromBase64Url = (value) => {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  };
  const prepareOptions = (options) => {
    options.challenge = fromBase64Url(options.challenge);
    if (options.user?.id) options.user.id = fromBase64Url(options.user.id);
    ["allowCredentials", "excludeCredentials"].forEach((key) => {
      if (options[key]) options[key] = options[key].map((item) => ({ ...item, id: fromBase64Url(item.id) }));
    });
    return options;
  };
  const encodeBase64Url = (buffer) => {
    let binary = "";
    new Uint8Array(buffer).forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };
  const serializeCredential = (credential) => {
    const response = credential.response;
    const serialized = { id: credential.id, rawId: encodeBase64Url(credential.rawId), type: credential.type, response: {} };
    ["clientDataJSON", "attestationObject", "authenticatorData", "signature", "userHandle"].forEach((key) => {
      if (response[key]) serialized.response[key] = encodeBase64Url(response[key]);
    });
    if (response.getTransports) serialized.response.transports = response.getTransports();
    return serialized;
  };
  const closeModal = () => {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
    pinInput.value = "";
    if (message) message.textContent = "";
  };

  settingsButton.addEventListener("click", async () => {
    pinInput.value = "";
    if (message) message.textContent = "";
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    pinInput.focus();
    await fetchPasskeyStatus();
    if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) {
      if (message) message.textContent = "This browser cannot create a device passkey. Open MAMU in Chrome or another secure browser.";
    } else if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function" &&
               !await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) {
      if (message) message.textContent = "This browser cannot access the phone's fingerprint or Face ID. Try opening MAMU directly in Chrome.";
    }
  });
  closeButton?.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => { if (event.target === modal) closeModal(); });
  confirmButton.addEventListener("click", async () => {
    if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials?.create) {
      if (message) message.textContent = "This browser cannot create a device passkey. Open MAMU in Chrome or another secure browser.";
      return;
    }
    if (!/^\d{4}$/.test(pinInput.value)) {
      if (message) message.textContent = "Enter your 4-digit transaction PIN.";
      pinInput.focus();
      return;
    }
    confirmButton.disabled = true;
    if (message) message.textContent = "Waiting for fingerprint or Face ID confirmation…";
    try {
      const optionsResult = await apiRequest("/security/passkey/register/options", {
        method: "POST",
        body: JSON.stringify({ pin: pinInput.value }),
      });
      const credential = await navigator.credentials.create({ publicKey: prepareOptions(optionsResult.options) });
      if (!credential) throw new Error("The device did not return a biometric credential.");
      await apiRequest("/security/passkey/register/verify", {
        method: "POST",
        body: JSON.stringify({ credential: serializeCredential(credential) }),
      });
      closeModal();
      await fetchPasskeyStatus();
      window.dispatchEvent(new Event("mamu:passkey-changed"));
      showToast("Fingerprint or Face ID is ready for app unlock.");
    } catch (error) {
      if (message) {
        message.textContent = error.name === "NotAllowedError" || error.name === "AbortError"
          ? "Biometric setup was cancelled or the device could not confirm. Try again in your device settings."
          : (error.message || "Could not set up biometric unlock.");
      }
    } finally { confirmButton.disabled = false; }
  });
  fetchPasskeyStatus();
}


function setupComingSoonServices() {
  document.querySelectorAll(".service-card[data-service]").forEach((card) => {
    card.addEventListener("click", () => {
      const service = card.dataset.service;
      if (window.openGsubzQuickService) window.openGsubzQuickService(service);
      else showToast("Service page is still loading. Try again.", "error");
    });
  });
}


function setupQuickButtons() {
  $("fundWalletBtn")?.addEventListener("click", () => {
    showPage("fund");
  });

  $("historyBtn")?.addEventListener("click", () => {
    showPage("transactions");
    loadTransactions();
  });

  $("viewDataBtn")?.addEventListener("click", () => {
    showPage("data");
    loadDataPlans();
  });

  $("viewTransactionsBtn")?.addEventListener(
    "click",
    () => {
      showPage("transactions");
      loadTransactions();
    }
  );

  $("profileServiceBtn")?.addEventListener(
    "click",
    () => {
      showPage("profile");
      loadProfile();
    }
  );

  $("supportBtn")?.addEventListener(
    "click",
    openWhatsAppSupport
  );
}

/* =========================================================
   WHATSAPP SUPPORT
   ========================================================= */

/* =========================================================
   SUPPORT
   ========================================================= */

function openWhatsAppSupport() {
  const phone = "2349167765910";

  const message = encodeURIComponent(
    "Hello MAMU DATA SUB Support, I need help."
  );

  window.open(
    `https://wa.me/${phone}?text=${message}`,
    "_blank",
    "noopener,noreferrer"
  );
}

function openSMSSupport() {
  const phone = "+2349167765910";

  const message = encodeURIComponent(
    "Hello MAMU DATA SUB Support, I need help."
  );

  window.location.href = `sms:${phone}?body=${message}`;
}

function setupWhatsApp() {
  const floatingBtn = $("whatsappFloat");
  const overlay = $("whatsappOptionsOverlay");
  const closeBtn = $("closeWhatsappOptions");
  const channelBtn = $("whatsappChannelBtn");
  const supportBtn = $("whatsappSupportOption");

  if (!floatingBtn || !overlay) return;

  const openOptions = () => {
    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");
  };

  const closeOptions = () => {
    overlay.classList.remove("active");
    overlay.setAttribute("aria-hidden", "true");
  };

  floatingBtn.addEventListener("click", openOptions);

  closeBtn?.addEventListener("click", closeOptions);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeOptions();
    }
  });

  channelBtn?.addEventListener("click", () => {
    window.open(
      "https://whatsapp.com/channel/0029Vb9HwQ7JP21081DB8l2g",
      "_blank",
      "noopener,noreferrer"
    );
    closeOptions();
  });

  supportBtn?.addEventListener("click", () => {
    openWhatsAppSupport();
    closeOptions();
  });
}
function openTransactionPinModal() {
  const modal = document.getElementById("transactionPinModal");
  const form = document.getElementById("transactionPinForm");
  const message = document.getElementById("transactionPinMessage");

  if (!modal || !form) return;

  form.reset();

  if (message) {
    message.textContent = "";
    message.className = "";
  }

  modal.classList.add("active");
}

function closeTransactionPinModal() {
  const modal = document.getElementById("transactionPinModal");

  if (modal) {
    modal.classList.remove("active");
  }
}

async function checkTransactionPinSetup() {
  try {
    const data = await apiRequest("/profile/me");

    if (data.user && data.user.hasTransactionPin === false) {
      openTransactionPinModal();
    }
  } catch (error) {
    console.error("Transaction PIN check error:", error);
  }
}

function setupTransactionPin() {
  const form = document.getElementById("transactionPinForm");
  const pinInput = document.getElementById("transactionPin");
  const confirmInput = document.getElementById("confirmTransactionPin");
  const message = document.getElementById("transactionPinMessage");
  const button = document.getElementById("saveTransactionPinBtn");

  if (!form || !pinInput || !confirmInput || !message || !button) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const pin = pinInput.value.trim();
    const confirmPin = confirmInput.value.trim();

    message.className = "";
    message.textContent = "";

    if (!/^\d{4}$/.test(pin)) {
      message.textContent = "PIN must contain exactly 4 digits.";
message.className = "show error";
      return;
    }

    if (pin !== confirmPin) {
      message.textContent = "PINs do not match.";
message.className = "show error";
      return;
    }

    button.disabled = true;
    button.textContent = "Saving...";

    try {
      const data = await apiRequest("/auth/transaction-pin", {
  method: "POST",
  body: JSON.stringify({
    pin,
  }),
});

      message.textContent =
  data.message || "Transaction PIN saved successfully.";
message.className = "show success";

      setTimeout(() => {
        closeTransactionPinModal();
      }, 700);
    } catch (error) {
      message.textContent =
        error.message || "Unable to save transaction PIN.";
      message.className = "show";
    } finally {
      button.disabled = false;
      button.textContent = "Save Transaction PIN";
    }
  });
}

/* =========================================================
   INITIALIZE
   ========================================================= */

async function initApp() {
  if (!checkAuthentication()) {
    return;
  }


  setupNavigation();
  setupBalanceToggle();
  setupSideMenu();
  setupDashboardNotifications();

  setupDataPurchase();
  setupServicePurchasePinPrompt();
  setupPurchaseReceipt();  
  setupDataNetworkCards();
  setupAirtimePurchase();
  setupElectricityPayment();
  setupTVPayment();

  setupProfileUpdate();
  setupProfilePhoto();
  $("copyMarketplaceAccountId")?.addEventListener("click", async () => {
    const input = $("profileAccountIdInput");
    if (!input?.value) { showToast("Account ID is not available yet.", "error"); return; }
    try {
      await navigator.clipboard.writeText(input.value);
      showToast("Account ID copied.", "success");
    } catch (_) {
      input.focus(); input.select();
      showToast("Select and copy your Account ID.", "success");
    }
  });
  setupReferralCopy();
 
async function handlePaystackCallback() {
  const params = new URLSearchParams(window.location.search);
  const reference = params.get("reference") || params.get("trxref");

if (!reference) {
  return;
}

  showToast("Verifying your payment...", "success");

  try {
    const result = await apiRequest(
      `/payment/verify/${encodeURIComponent(reference)}`
    );

    if (result.pending) {
      showToast("Paystack yana tabbatar da biyan. Wallet zai sabunta idan an tabbatar.", "success");
      return;
    }

    if (result.success) {
      showToast(
        `Wallet funded successfully: ₦${Number(result.amount || 0).toLocaleString()}`,
        "success"
      );

      await loadProfile();
      await refreshHome();
      await loadTransactions();

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );
    }
  } catch (error) {
    console.error("Paystack verification error:", error);
    showToast(
      error.message || "Unable to verify payment.",
      "error"
    );
  }
}

setupGenerateAccountNumber();
setupFundWallet();
handlePaystackCallback().catch((error) => {
  console.error("Paystack callback error:", error);
});
loadProfile().catch((error) => {
  console.error("Profile load error:", error);
});

  setupComingSoonServices();
  setupQuickButtons();
  setupSettings();
  setupWhatsApp();
  setupWhatsAppFloating();
  setupSignOut();
  setupPullToRefresh();
  setupAppLock();
    showPage("home");
  setupTransactionPin();
  setupTransactionPinReset();  
  setTimeout(() => {
  checkTransactionPinSetup();
}, 2000);

  refreshHome().catch((error) => {
    console.error("Home refresh error:", error);
  });

  loadDataPlans().catch((error) => {
    console.error("Data plans error:", error);
  });

   loadReferral().catch((error) => {
    console.error("Referral error:", error);
  });
}

/* =========================================================
   START APP
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});
function setupSideMenu() {
  const menuBtn = $("menuBtn");
  const menuClose = $("closeMenuBtn");
  const sideMenu = $("sideMenu");
  const menuOverlay = $("menuOverlay");
  const logoutBtn = $("logoutBtn");

logoutBtn?.addEventListener("click", () => {
  localStorage.removeItem("mamu_token");
  localStorage.removeItem("mamu_user");

  window.location.href = "./login.html";
});

  if (!menuBtn || !sideMenu || !menuOverlay) return;

  function openMenu() {
    sideMenu.classList.add("open");
    menuOverlay.classList.add("show");
    menuBtn.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    sideMenu.classList.remove("open");
    menuOverlay.classList.remove("show");
    menuBtn.setAttribute("aria-expanded", "false");
  }

  menuBtn.addEventListener("click", () => {
    if (sideMenu.classList.contains("open")) closeMenu();
    else openMenu();
  });
  menuClose?.addEventListener("click", closeMenu);
  menuOverlay.addEventListener("click", closeMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sideMenu.classList.contains("open")) closeMenu();
  });

  sideMenu.querySelectorAll("[data-page]").forEach((item) => {
    item.addEventListener("click", closeMenu);
  });
}

function setupDashboardNotifications() {
  const button = $("notificationBtn");
  const modal = $("notificationModal");
  const closeButton = $("closeNotificationBtn");
  const list = $("notificationList");
  const historyButton = $("viewAllNotificationsBtn");
  if (!button || !modal || !list) return;

  const close = () => {
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  };
  const loadRecentActivity = async () => {
    list.innerHTML = '<div class="empty-state">Loading recent activity…</div>';
    try {
      const data = await apiRequest("/wallet/transactions");
      const transactions = Array.isArray(data.transactions) ? data.transactions.slice(0, 6) : [];
      if (!transactions.length) {
        list.innerHTML = '<div class="empty-state"><h4>You’re all caught up</h4><p>There is no recent account activity to show.</p></div>';
        return;
      }
      list.innerHTML = transactions.map((transaction) => {
        const status = String(transaction.status || "pending").toLowerCase();
        const statusLabel = status === "success" || status === "successful" ? "Successful" : status === "failed" || status === "fail" ? "Failed" : "Pending";
        const description = transaction.description || formatDate(transaction.createdAt) || "Account activity";
        return `<article class="notification-item"><span class="notification-state notification-state-${escapeHtml(status)}" aria-hidden="true"></span><div class="notification-copy"><strong>${escapeHtml(transactionLabel(transaction.type))}</strong><p>${escapeHtml(description)}</p><small>${statusLabel}${formatDate(transaction.createdAt) ? ` · ${escapeHtml(formatDate(transaction.createdAt))}` : ""}</small></div><strong class="notification-amount">${money(transaction.amount)}</strong></article>`;
      }).join("");
    } catch (error) {
      list.innerHTML = `<div class="empty-state"><h4>Could not load updates</h4><p>${escapeHtml(error.message || "Check your connection and try again.")}</p></div>`;
    }
  };

  button.addEventListener("click", () => {
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    loadRecentActivity();
    closeButton?.focus();
  });
  closeButton?.addEventListener("click", close);
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  historyButton?.addEventListener("click", () => {
    close();
    showPage("transactions");
    loadTransactions();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("active")) close();
  });
}
/* =========================================================
   FLOATING WHATSAPP SUPPORT - DRAGGABLE
   ========================================================= */

function setupWhatsAppFloating() {
  const button = document.getElementById("whatsappFloat");
  if (!button) return;

  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  button.addEventListener("pointerdown", (event) => {
    dragging = true;
    moved = false;

    startX = event.clientX;
    startY = event.clientY;

    const rect = button.getBoundingClientRect();

    startLeft = rect.left;
    startTop = rect.top;

    button.style.left = `${startLeft}px`;
    button.style.top = `${startTop}px`;
    button.style.right = "auto";
    button.style.bottom = "auto";

    button.setPointerCapture(event.pointerId);
    button.classList.add("dragging");
  });

  button.addEventListener("pointermove", (event) => {
    if (!dragging) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      moved = true;
    }

    let left = startLeft + dx;
    let top = startTop + dy;

    const maxLeft = window.innerWidth - button.offsetWidth;
    const maxTop = window.innerHeight - button.offsetHeight;

    left = Math.max(0, Math.min(left, maxLeft));
    top = Math.max(0, Math.min(top, maxTop));

    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
  });

  button.addEventListener("pointerup", (event) => {
    if (!dragging) return;

    dragging = false;
    button.classList.remove("dragging");

    if (button.hasPointerCapture(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }
  });

  button.addEventListener("click", (event) => {
    if (moved) {
      event.preventDefault();
      event.stopPropagation();
      moved = false;
    }
  });
}
// ===============================
// PROFILE PHOTO
// ===============================

function setupProfilePhoto() {
  const uploadButton = $("uploadProfilePhotoBtn");
  const photoInput = $("profilePhotoInput");
  const cameraInput = $("profileCameraInput");
  const profileAvatar = $("profileAvatar");
  const dashboardProfileBtn = $("dashboardProfileBtn");

  const modal = $("photoChoiceModal");
  const takePhotoBtn = $("takePhotoBtn");
  const chooseGalleryBtn = $("chooseGalleryBtn");
  const cancelPhotoBtn = $("cancelPhotoBtn");

  if (!photoInput || !cameraInput) return;

  const openPhotoChoice = (event) => {
    event?.preventDefault();
    event?.stopPropagation();

    modal?.classList.add("active");
  };

  const closePhotoChoice = () => {
    modal?.classList.remove("active");
  };

  uploadButton?.addEventListener(
    "click",
    openPhotoChoice
  );

  profileAvatar?.addEventListener(
    "click",
    openPhotoChoice
  );

  dashboardProfileBtn?.addEventListener(
    "click",
    openPhotoChoice
  );

  takePhotoBtn?.addEventListener(
    "click",
    () => {
      closePhotoChoice();
      cameraInput.click();
    }
  );

  chooseGalleryBtn?.addEventListener(
    "click",
    () => {
      closePhotoChoice();
      photoInput.click();
    }
  );

  cancelPhotoBtn?.addEventListener(
    "click",
    closePhotoChoice
  );

  modal?.addEventListener(
    "click",
    (event) => {
      if (event.target === modal) {
        closePhotoChoice();
      }
    }
  );

  const handlePhoto = (file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast(
        "Please select an image.",
        "error"
      );
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const photo = reader.result;

      localStorage.setItem(
        "mamu_profile_photo",
        photo
      );

      updateProfilePhotoUI(photo);

      showToast(
        "Profile photo updated successfully.",
        "success"
      );

      photoInput.value = "";
      cameraInput.value = "";
    };

    reader.readAsDataURL(file);
  };

  photoInput.addEventListener(
    "change",
    () => {
      handlePhoto(photoInput.files?.[0]);
    }
  );

  cameraInput.addEventListener(
    "change",
    () => {
      handlePhoto(cameraInput.files?.[0]);
    }
  );

  updateProfilePhotoUI(
    localStorage.getItem("mamu_profile_photo")
  );
}

function updateProfilePhotoUI(photo) {
  const profilePhoto = $("profilePhoto");
  const profileInitial = $("profileInitial");

  const dashboardPhoto =
    $("dashboardProfilePhoto");

  const dashboardInitial =
    $("dashboardProfileInitial");

  if (photo) {
    if (profilePhoto) {
      profilePhoto.src = photo;
      profilePhoto.style.display = "block";
    }

const initial =
  (currentUser?.name ||
    currentUser?.username ||
    "U")
    .charAt(0)
    .toUpperCase();

if (profileInitial) {
  profileInitial.textContent = initial;
}
    if (profileInitial) {
      profileInitial.style.display = "none";
    }

    if (dashboardPhoto) {
      dashboardPhoto.src = photo;
      dashboardPhoto.style.display = "block";
    }
if (dashboardInitial) {
  dashboardInitial.textContent = initial;
}

    if (dashboardInitial) {
      dashboardInitial.style.display = "none";
    }

    return;
  }

  if (profilePhoto) {
    profilePhoto.style.display = "none";
  }

  if (profileInitial) {
    profileInitial.style.display = "block";
  }

  if (dashboardPhoto) {
    dashboardPhoto.style.display = "none";
  }

  if (dashboardInitial) {
    dashboardInitial.style.display = "block";
  }
}
function updateDashboardHeader() {
if (!currentUser) {
  try {
    currentUser =
      JSON.parse(
        localStorage.getItem("mamu_user")
      );
  } catch (error) {
    currentUser = null;
  }
} 
 const username =
    currentUser?.name || currentUser?.username || "User";

  const greeting =
    $("headerGreeting");

  const welcomeName =
    $("welcomeName");

  const accountType =
    $("headerAccountType");

  if (greeting) {
    greeting.textContent = "Welcome back,";
  }

  if (welcomeName) {
    welcomeName.textContent = username;
  }

  if (accountType) {
    accountType.textContent = `MAMU DATA SUB · ${currentUser?.accountType || "Smart Earner"}`;
  }

  updateProfilePhotoUI(
    localStorage.getItem("mamu_profile_photo")
  );
}
function setupTransactionPinReset() {
  const openButton = $("resetTransactionPinBtn");
  const modal = $("resetTransactionPinModal");
  const cancelButton = $("cancelResetTransactionPinBtn");
  const saveButton = $("saveResetTransactionPinBtn");

  if (!openButton || !modal || !cancelButton || !saveButton) return;

  openButton.addEventListener("click", () => {
    modal.classList.add("active");

    $("resetPinPassword").value = "";
    $("newTransactionPin").value = "";
    $("confirmNewTransactionPin").value = "";
    $("resetTransactionPinMessage").textContent = "";
  });

  cancelButton.addEventListener("click", () => {
    modal.classList.remove("active");
  });

  saveButton.addEventListener("click", async () => {
    const password = $("resetPinPassword").value.trim();
    const newPin = $("newTransactionPin").value.trim();
    const confirmPin = $("confirmNewTransactionPin").value.trim();

    if (!password || !newPin || !confirmPin) {
      showToast("Please complete all fields.", "error");
      return;
    }

    if (!/^\d{4}$/.test(newPin)) {
      showToast("Transaction PIN must be exactly 4 digits.", "error");
      return;
    }

    if (newPin !== confirmPin) {
      showToast("The new PINs do not match.", "error");
      return;
    }

    try {
      setButtonLoading(saveButton, true);

      const data = await apiRequest("/security/transaction-pin/reset", {
        method: "POST",
        body: JSON.stringify({
          accountPassword: password,
          newPin,
          confirmPin,
        }),
      });

      showToast(
        data.message || "Transaction PIN reset successfully.",
        "success"
      );

      modal.classList.remove("active");
    } catch (error) {
      showToast(
        error.message || "Failed to reset transaction PIN.",
        "error"
      );
    } finally {
      setButtonLoading(saveButton, false);
    }
  });
}
