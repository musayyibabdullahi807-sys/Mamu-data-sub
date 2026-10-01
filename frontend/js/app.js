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

function showPage(page) {
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

  target.classList.add("active");

  document.querySelectorAll("[data-page]").forEach((element) => {
    let buttonPage = element.dataset.page || "";

    if (buttonPage.endsWith("Page")) {
      buttonPage = buttonPage.slice(0, -4);
    }

    element.classList.toggle("active", buttonPage === page);
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function setupNavigation() {
  document.querySelectorAll("[data-page]").forEach((element) => {
    element.addEventListener("click", () => {
      let page = element.dataset.page || "";

      if (page.endsWith("Page")) {
        page = page.slice(0, -4);
      }

      if (!page) return;

      showPage(page);

      if (page === "home") refreshHome();
      if (page === "data") loadDataPlans();
      if (page === "transactions") loadTransactions();
      if (page === "referral") loadReferral();
      if (page === "profile") loadProfile();
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
function setupDataNetworkCards() {
  const cards = document.querySelectorAll("[data-network]");

  if (!cards.length) return;

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const network = card.dataset.network || "";

      selectedDataNetwork = network.toUpperCase();

      cards.forEach((item) => {
        item.classList.remove("selected");
      });

      card.classList.add("selected");

      populateDataPlanSelect();
    });
  });
}

function populateDataPlanSelect() {
  const select = $("dataPlan");
  const cardsContainer = $("dataPlanCards");

  if (!select) return;

  select.innerHTML = `
    <option value="">Select a plan</option>
  `;

  if (cardsContainer) {
    cardsContainer.innerHTML = "";
  }

  const filteredPlans = selectedDataNetwork
    ? allDataPlans.filter(
        (plan) =>
          networkName(plan).toLowerCase() ===
          selectedDataNetwork.toLowerCase()
      )
    : [];

  if (!filteredPlans.length) {
    if (cardsContainer) {
      cardsContainer.innerHTML = `
        <div class="data-plan-empty">
          Select a network to view available plans.
        </div>
      `;
    }
    return;
  }

  filteredPlans.forEach((plan) => {
    const option = document.createElement("option");

    option.value = plan._id;

    option.textContent =
      `${plan.plan || "Data"} - ` +
      `${plan.validity || "Data"} - ` +
      `${money(plan.sellingPrice)}`;

    select.appendChild(option);

    if (cardsContainer) {
      const card = document.createElement("button");

      card.type = "button";
      card.className = "data-plan-card";
      card.dataset.planId = plan._id;

      card.innerHTML = `
        <span class="plan-check">✓</span>
        <div class="plan-name">${plan.plan || "Data"}</div>
        <div class="plan-validity">${plan.validity || "Data"}</div>
        <div class="plan-price">${money(plan.sellingPrice)}</div>
      `;

      card.addEventListener("click", () => {
        select.value = plan._id;

        document
          .querySelectorAll(".data-plan-card")
          .forEach((item) => {
            item.classList.remove("selected");
          });

        card.classList.add("selected");
      });

      cardsContainer.appendChild(card);
    }
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

function setupPurchaseReceipt() {
  $("doneReceiptBtn")?.addEventListener(
    "click",
    closePurchaseReceipt
  );

  $("shareReceiptBtn")?.addEventListener("click", async () => {
    if (!currentReceipt) return;

    const receiptText = `
MAMU DATA SUB
Transaction Receipt

Status: ${
      currentReceipt.status === "successful"
        ? "Purchase Successful"
        : currentReceipt.status === "failed"
        ? "Purchase Failed"
        : "Transaction Pending"
    }

Phone: ${currentReceipt.phone}
Network: ${currentReceipt.network}
Plan: ${currentReceipt.plan}
Amount: ${money(currentReceipt.amount)}
Reference: ${currentReceipt.reference}
Provider Reference: ${currentReceipt.providerReference || "—"}
Date & Time: ${currentReceipt.date}
Wallet Balance: ${money(currentReceipt.walletBalance)}

Thank you for using MAMU DATA SUB.
`.trim();

    if (navigator.share) {
      try {
        await navigator.share({
          title: "MAMU DATA SUB Receipt",
          text: receiptText,
        });
      } catch (error) {
        if (error.name !== "AbortError") {
          showToast("Unable to share receipt.", "error");
        }
      }
    } else {
      showToast(
        "Sharing is not supported on this device.",
        "error"
      );
    }
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

    const selectedPlan = allDataPlans.find(
      (plan) => String(plan._id) === String(planId)
    );

    if (!phone || !planId || !pin) {
      showToast(
        "Please enter your phone, select a plan, and enter your PIN.",
        "error"
      );
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

      showPurchaseReceipt({
        status: data.status || "successful",
        phone,
        network: selectedPlan
          ? networkName(selectedPlan)
          : "—",
        plan: selectedPlan
          ? selectedPlan.plan || "Data Plan"
          : "Data Plan",
        amount: selectedPlan
          ? Number(selectedPlan.sellingPrice || 0)
          : 0,
        reference: data.reference || "",
        providerReference: data.providerReference || "",
        walletBalance: Number(data.walletBalance || 0),
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

      showPurchaseReceipt({
        status: error.status || "failed",
        phone,
        network: selectedPlan
          ? networkName(selectedPlan)
          : "—",
        plan: selectedPlan
          ? selectedPlan.plan || "Data Plan"
          : "Data Plan",
        amount: selectedPlan
          ? Number(selectedPlan.sellingPrice || 0)
          : 0,
        reference: error.reference || "",
        providerReference: error.providerReference || "",
        walletBalance: Number(error.walletBalance || 0),
      });

      showToast(
        error.message || "Data purchase failed.",
        "error"
      );

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

  let selectedNetwork = "";

  document.querySelectorAll("[data-airtime-network]").forEach((card) => {
    card.addEventListener("click", () => {
      selectedNetwork = card.dataset.airtimeNetwork || "";

      document
        .querySelectorAll("[data-airtime-network]")
        .forEach((item) => item.classList.remove("selected"));

      card.classList.add("selected");
    });
  });

  button.addEventListener("click", async () => {
    const phone = $("airtimePhone")?.value.trim();
    const amount = Number($("airtimeAmount")?.value);
    const pin = $("airtimePin")?.value.trim();

    if (!selectedNetwork || !phone || !amount || !pin) {
      showToast(
        "Please select a network and complete all airtime fields.",
        "error"
      );
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

    if (amount < 100 || amount > 50000) {
      showToast(
        "Airtime amount must be between ₦100 and ₦50,000.",
        "error"
      );
      return;
    }

    try {
      setButtonLoading(button, true);

      const data = await apiRequest("/airtime/purchase", {
        method: "POST",
        body: JSON.stringify({
          serviceID: selectedNetwork,
          phone,
          amount,
          pin,
        }),
      });

      showToast(
        data.message || "Airtime purchase submitted successfully.",
        "success"
      );

      $("airtimePhone").value = "";
      $("airtimeAmount").value = "";
      $("airtimePin").value = "";

      selectedNetwork = "";

      document
        .querySelectorAll("[data-airtime-network]")
        .forEach((item) => item.classList.remove("selected"));

      await refreshHome();
      await loadTransactions();

    } catch (error) {
      showToast(
        error.message || "Airtime purchase failed.",
        "error"
      );
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
async function loadProfile() {
  try {
    const data = await apiRequest("/profile/me");

    if (!data.user) {
      throw new Error("Profile data not found.");
    }

    currentUser = data.user;

updateProfileUI(currentUser);
updateDashboardHeader();
  } catch (error) {
    console.error("Load profile error:", error);
    showToast(
      error.message || "Unable to load profile.",
      "error"
    );
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

function setupComingSoonServices() {
  document.querySelectorAll(".service-card[data-service]").forEach((card) => {
    card.addEventListener("click", () => {
      const name = card.querySelector("strong")?.textContent || "This service";
      showToast(`${name} is coming soon.`, "success");
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
   TRANSACTION PIN SETUP
   ========================================================= */

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

  setupDataPurchase();
  setupPurchaseReceipt();  
  setupDataNetworkCards();
  setupAirtimePurchase();
  setupElectricityPayment();
  setupTVPayment();

  setupProfileUpdate();
  setupProfilePhoto();
  setupReferralCopy();
 
async function handlePaystackCallback() {
  const params = new URLSearchParams(window.location.search);
  const reference =
  params.get("reference") ||
  params.get("trxref");

if (!reference) {
  return;
}

  showToast("Verifying your payment...", "success");

  try {
    const result = await apiRequest(
      `/payment/verify/${encodeURIComponent(reference)}`
    );

    if (result.success) {
      showToast(
        `Wallet funded successfully: ₦${Number(result.amount || 0).toLocaleString()}`,
        "success"
      );

      await loadProfile();

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
} setupFundWallet();
handlePaystackCallback().catch((error) => {
  console.error("Paystack callback error:", error);
});
loadProfile().catch((error) => {
  console.error("Profile load error:", error);
});

  setupComingSoonServices();
  setupQuickButtons();
  setupWhatsApp();
  setupWhatsAppFloating();
  setupSignOut();
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
    currentUser?.username || "User";

  const greeting =
    $("headerGreeting");

  const welcomeName =
    $("welcomeName");

  const accountType =
    $("headerAccountType");

  if (greeting) {
    greeting.textContent = "Welcome back";
  }

  if (welcomeName) {
    welcomeName.textContent = username;
  }

  if (accountType) {
    accountType.textContent =
      currentUser?.accountType || "Smart Earner";
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
