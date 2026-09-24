/* =========================================================
   MAMU DATA SUB
   Frontend Application
   ========================================================= */

const API_BASE = "/api";
const TOKEN_KEY = "mamu_token";

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
    localStorage.removeItem(TOKEN_KEY);
    currentUser = null;

    showToast("Session ɗinka ya ƙare. Ka sake login.", "error");

    setTimeout(() => {
      window.location.href = "./login.html";
    }, 900);

    throw new Error("Unauthorized");
  }

  if (!response.ok || data.success === false) {
    throw new Error(
      data.message || `Request failed (${response.status})`
    );
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

function showPage(pageName) {
  const pages = document.querySelectorAll(".page");

  pages.forEach((page) => {
    page.classList.remove("active");
  });

  const target = $(`${pageName}Page`);

  if (target) {
    target.classList.add("active");
  }

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.remove("active");

    if (item.dataset.page === pageName) {
      item.classList.add("active");
    }
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

function setupNavigation() {
  document.querySelectorAll("[data-page]").forEach((element) => {
    element.addEventListener("click", () => {
      let page = element.dataset.page || "";

      if (page.endsWith("Page")) {
        page = page.slice(0, -4);
      }

      if (page) {
        showPage(page);

        if (page === "home") {
          refreshHome();
        }

        if (page === "data") {
          loadDataPlans();
        }

        if (page === "transactions") {
          loadTransactions();
        }

        if (page === "referral") {
          loadReferral();
        }

        if (page === "profile") {
          loadProfile();
        }
      }
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
  } catch (error) {
    if (error.message !== "Unauthorized") {
      console.error("Wallet error:", error.message);
    }
  }
}

function updateWalletBalance(balance) {
  const formatted = money(balance);

  if ($("walletBalance")) {
    $("walletBalance").textContent = formatted;
  }
}
function setupBalanceToggle() {
  const button = $("toggleBalance");

  if (!button) return;

  let visible = true;

  button.addEventListener("click", () => {
    const balance = currentUser?.walletBalance ?? 0;

    visible = !visible;

    if ($("walletBalance")) {
      $("walletBalance").textContent = visible
        ? money(balance)
        : "₦••••••";
    }

    button.textContent = visible ? "👁" : "🙈";
  });
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
    bill_payment: "Bill Payment",
    refund: "Refund",
    withdrawal: "Withdrawal",
    transfer: "Transfer",
  };

  return labels[type] || "Transaction";
}

function transactionIcon(type) {
  const icons = {
    wallet_funding: "💰",
    data_purchase: "📱",
    airtime_purchase: "📞",
    bill_payment: "⚡",
    refund: "↩️",
    withdrawal: "💸",
    transfer: "🔄",
  };

  return icons[type] || "💳";
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
  const status = transaction.status || "pending";

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
          ${escapeHtml(status)}
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
        <div class="empty-state-icon">💳</div>
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
        <div class="empty-state-icon">📜</div>
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
      ? data.plans
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

      const select = $("dataPlan");

      if (select) {
        select.value = plan._id;
      }
    });
  });
}

let selectedDataNetwork = "";

function populateDataPlanSelect() {
  const select = $("dataPlan");

  if (!select) return;

  select.innerHTML = `
    <option value="">Select data plan</option>
  `;

  const filteredPlans = selectedDataNetwork
    ? allDataPlans.filter(
        (plan) =>
          networkName(plan).toLowerCase() ===
          selectedDataNetwork.toLowerCase()
      )
    : [];

  filteredPlans.forEach((plan) => {
    const option = document.createElement("option");

    option.value = plan._id;

    option.textContent =
      `${plan.plan || "Data"} - ` +
      `${plan.validity || "Data"} - ` +
      `${money(plan.sellingPrice)}`;

    select.appendChild(option);
  });
}

function setupDataNetworkCards() {
  const cards = document.querySelectorAll("[data-network]");

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      selectedDataNetwork = card.dataset.network || "";

      cards.forEach((item) => {
        item.classList.remove("selected");
      });

      card.classList.add("selected");

      populateDataPlanSelect();
    });
  });
}

/* =========================================================
   DATA PURCHASE
   ========================================================= */

function setupDataPurchase() {
  const button = $("purchaseDataBtn");

  if (!button) return;

  button.addEventListener("click", async () => {
    const phone = $("dataPhone")?.value.trim();
    const planId = $("dataPlan")?.value;
    const pin = $("dataPin")?.value.trim();

    if (!phone || !planId || !pin) {
      showToast("Please enter your phone, select a plan, and enter your PIN.", "error");
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      showToast("Transaction PIN must be exactly 4 digits.", "error");
      return;
    }

    if (!/^\d{10,15}$/.test(phone)) {
      showToast("Please enter a valid phone number.", "error");
      return;
    }

    try {
      setButtonLoading(button, true);

      const data = await apiRequest("/data/purchase", {
        method: "POST",
        body: JSON.stringify({
          planId,
          phone,
          pin,
        }),
      });

      showToast(
        data.message || "Data purchase request submitted successfully.",
        "success"
      );

      $("dataPhone").value = "";
      $("dataPlan").value = "";
      $("dataPin").value = "";

      await refreshHome();
      await loadDataPlans();
    } catch (error) {
      showToast(error.message || "Data purchase failed.", "error");
    } finally {
      setButtonLoading(button, false);
    }
  });
}
/* =========================================================
   AIRTIME
   ========================================================= */

function setupAirtimePurchase() {
  const button = $("purchaseAirtimeBtn");

  if (!button) return;

  button.addEventListener("click", async () => {
    const network = $("airtimeNetwork")?.value;
    const phone = $("airtimePhone")?.value.trim();
    const amount = Number($("airtimeAmount")?.value);

    if (!network || !phone || !amount) {
      showToast("Please complete all airtime fields.", "error");
      return;
    }

    if (!/^\d{10,15}$/.test(phone)) {
      showToast("Please enter a valid phone number.", "error");
      return;
    }

    if (amount < 100 || amount > 50000) {
      showToast("Airtime amount must be between ₦100 and ₦50,000.", "error");
      return;
    }

    try {
      setButtonLoading(button, true);

      const data = await apiRequest("/airtime/purchase", {
        method: "POST",
        body: JSON.stringify({
          serviceID: String(network).toLowerCase(),
          phone,
          amount,
        }),
      });

      showToast(
        data.message || "Airtime purchase submitted successfully.",
        "success"
      );

      $("airtimePhone").value = "";
      $("airtimeAmount").value = "";

      await refreshHome();
    } catch (error) {
      showToast(error.message || "Airtime purchase failed.", "error");
    } finally {
      setButtonLoading(button, false);
    }
  });
}
/* =========================================================
   ELECTRICITY
   ========================================================= */
   
function setupElectricityPayment() {
  const button = $("payElectricityBtn");

  if (!button) return;

  button.addEventListener("click", async () => {
    const serviceID = $("electricityProvider")?.value;
    const customerID = $("electricityCustomer")?.value.trim();
    const phone = $("electricityPhone")?.value.trim();
    const amount = Number($("electricityAmount")?.value);

    if (!serviceID || !customerID || !phone || !amount) {
      showToast("Please complete all electricity fields.", "error");
      return;
    }

    if (!/^\d{5,30}$/.test(customerID)) {
      showToast("Please enter a valid customer number.", "error");
      return;
    }

    if (!/^\d{10,15}$/.test(phone)) {
      showToast("Please enter a valid phone number.", "error");
      return;
    }

    if (amount < 100) {
      showToast("Electricity amount must be at least ₦100.", "error");
      return;
    }

    try {
      setButtonLoading(button, true);

      const data = await apiRequest("/electricity/purchase", {
        method: "POST",
        body: JSON.stringify({
          serviceID,
          customerID,
          phone,
          amount,
        }),
      });

      showToast(
        data.message || "Electricity payment submitted successfully.",
        "success"
      );

      $("electricityCustomer").value = "";
      $("electricityPhone").value = "";
      $("electricityAmount").value = "";

      await refreshHome();
    } catch (error) {
      showToast(error.message || "Electricity payment failed.", "error");
    } finally {
      setButtonLoading(button, false);
    }
  });
}
/* =========================================================
   TV
   ========================================================= */

function setupTVPayment() {
  const button = $("payTvBtn");

  if (!button) return;

  button.addEventListener("click", async () => {
    const serviceID = $("tvProvider")?.value;
    const customerID = $("tvCustomer")?.value.trim();
    const phone = $("tvPhone")?.value.trim();
    const plan = $("tvPlan")?.value;
    const amount = Number($("tvAmount")?.value);

    if (!serviceID || !customerID || !phone || !plan || !amount) {
      showToast("Please complete all TV fields.", "error");
      return;
    }

    if (!/^\d{5,30}$/.test(customerID)) {
      showToast("Please enter a valid SmartCard or IUC number.", "error");
      return;
    }

    if (!/^\d{10,15}$/.test(phone)) {
      showToast("Please enter a valid phone number.", "error");
      return;
    }

    if (amount <= 0) {
      showToast("Please enter a valid amount.", "error");
      return;
    }

    try {
      setButtonLoading(button, true);

      const data = await apiRequest("/tv/purchase", {
        method: "POST",
        body: JSON.stringify({
          serviceID,
          customerID,
          phone,
          plan,
          amount,
        }),
      });

      showToast(
        data.message || "TV subscription submitted successfully.",
        "success"
      );

      $("tvCustomer").value = "";
      $("tvPhone").value = "";
      $("tvAmount").value = "";

      await refreshHome();
    } catch (error) {
      showToast(error.message || "TV payment failed.", "error");
    } finally {
      setButtonLoading(button, false);
    }
  });
}
/* =========================================================
   PROFILE UPDATE
   ========================================================= */

function setupProfileUpdate() {
  const button = $("saveProfileBtn");

  if (!button) return;

  button.addEventListener("click", async () => {
    const payload = {
      username:
        $("profileUsernameInput")?.value.trim() || "",
      name:
        $("profileNameInput")?.value.trim() || "",
      email:
        $("profileEmailInput")?.value.trim() || "",
      state:
        $("profileStateInput")?.value.trim() || "",
      city:
        $("profileCityInput")?.value.trim() || "",
      address:
        $("profileAddressInput")?.value.trim() || "",
    };

    if (!payload.name) {
      showToast("Saka full name.", "error");
      return;
    }

    setButtonLoading(button, true, "Saving...");

    try {
      const data = await apiRequest("/profile/me", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      currentUser = data.user;

      updateProfileUI(currentUser);

      showToast(
        data.message || "Profile updated successfully."
      );
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setButtonLoading(
        button,
        false,
        "Save Profile"
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
      const result = await apiRequest(
        "/payment/initialize",
        {
          method: "POST",
          body: JSON.stringify({
            amount,
          }),
        }
      );

      if (!result.success) {
        throw new Error(
          result.message ||
          "Unable to initialize payment."
        );
      }

      if (!result.authorizationUrl) {
        throw new Error(
          "Paystack checkout URL was not returned."
        );
      }

      showToast(
        "Opening Paystack Checkout...",
        "success"
      );

      setTimeout(() => {
        window.location.href =
          result.authorizationUrl;
      }, 500);

    } catch (error) {
      console.error(
        "Wallet funding error:",
        error
      );

      if (error.message !== "Unauthorized") {
        showToast(
          error.message ||
          "Unable to start wallet funding.",
          "error"
        );
      }

      setButtonLoading(
        button,
        false,
        "Fund Wallet"
      );
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
  const supportBtn = $("whatsappBtn");
  const supportMenu = $("supportMenu");
  const whatsappSupportBtn = $("whatsappSupportBtn");
  const smsSupportBtn = $("smsSupportBtn");
  const closeSupportBtn = $("closeSupportBtn");

  if (!supportBtn || !supportMenu) return;

  supportBtn.addEventListener("click", () => {
    supportMenu.classList.toggle("active");
  });

  whatsappSupportBtn?.addEventListener(
    "click",
    openWhatsAppSupport
  );

  smsSupportBtn?.addEventListener(
    "click",
    openSMSSupport
  );

  closeSupportBtn?.addEventListener("click", () => {
    supportMenu.classList.remove("active");
  });
}

/* =========================================================
   HOME REFRESH
   ========================================================= */

async function refreshHome() {
  await Promise.all([
    loadWallet(),
    loadTransactions(),
  ]);
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

  setupDataPurchase();
  setupDataNetworkCards();
  setupAirtimePurchase();
  setupElectricityPayment();
  setupTVPayment();

  setupProfileUpdate();
  setupReferralCopy();
  setupFundWallet();

  setupQuickButtons();
  setupWhatsApp();

    showPage("home");

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
  const menuClose = $("menuClose");
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
    sideMenu.classList.add("active");
    menuOverlay.classList.add("active");
  }

  function closeMenu() {
    sideMenu.classList.remove("active");
    menuOverlay.classList.remove("active");
  }

  menuBtn.addEventListener("click", openMenu);
  menuClose?.addEventListener("click", closeMenu);
  menuOverlay.addEventListener("click", closeMenu);

  document.querySelectorAll("[data-menu-page]").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.preventDefault();

      const page = item.dataset.menuPage;

      closeMenu();

      if (page === "home") showPage("home");
      if (page === "data") showPage("data");
      if (page === "airtime") showPage("airtime");
      if (page === "tv") showPage("tv");
      if (page === "electricity") showPage("electricity");
      if (page === "transactions") showPage("transactions");
      if (page === "referral") showPage("referral");
      if (page === "profile") showPage("profile");
    });
  });
}
