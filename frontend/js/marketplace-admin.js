(() => {
  const token = () => localStorage.getItem("mamu_token");
  const list = document.getElementById("applications");
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const date = (value) => value ? new Date(value).toLocaleString() : "—";
  let allApplications = [];
  let usersPage = 1;
  let usersPages = 1;
  let usersSearchTimer;

  async function loadUsers() {
    const userList = document.getElementById("registered-users");
    const query = document.getElementById("user-search").value.trim();
    if (!token()) { userList.innerHTML = '<div class="status error">Sign in to your MAMU account first.</div>'; return; }
    userList.innerHTML = '<div class="status">Loading registered users...</div>';
    try {
      const params = new URLSearchParams({ page:String(usersPage), limit:"25" });
      if (query) params.set("q", query);
      const response = await fetch(`/api/marketplace/admin/users?${params}`, { headers:{ Authorization:`Bearer ${token()}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load registered users.");
      usersPages = Math.max(1, data.pages || 1);
      document.getElementById("users-total").textContent = data.total;
      document.getElementById("users-page").textContent = `Page ${data.page} of ${usersPages}`;
      document.getElementById("users-prev").disabled = data.page <= 1;
      document.getElementById("users-next").disabled = data.page >= usersPages;
      userList.innerHTML = data.users.length ? data.users.map((user) => `<article class="application"><div class="application-head"><h2>${escapeHtml(user.name)}</h2><span class="badge ${escapeHtml(user.accountStatus)}">${escapeHtml(user.accountStatus)}</span></div><div class="details"><b>Account ID:</b> ${escapeHtml(user.id)}<br><b>Phone:</b> ${escapeHtml(user.phone)}<br><b>Email:</b> ${escapeHtml(user.email || "Not provided")}<br><b>Username:</b> ${escapeHtml(user.username || "Not set")}<br><b>Location:</b> ${escapeHtml([user.city, user.state].filter(Boolean).join(", ") || "Not provided")}<br><b>Registered:</b> ${escapeHtml(date(user.registeredAt))}<br><b>Verified:</b> ${user.isVerified ? "Yes" : "No"}</div></article>`).join("") : '<div class="status">No registered users found.</div>';
    } catch (error) { userList.innerHTML = `<div class="status error">${escapeHtml(error.message)}</div>`; }
  }

  async function loadFundingSettings() {
    const status = document.getElementById("funding-account-status");
    try {
      const response = await fetch("/api/wallet/manual-transfer/admin/settings", { headers:{ Authorization:`Bearer ${token()}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load bank account settings.");
      document.getElementById("funding-bank-name").value = data.account?.bankName || "";
      document.getElementById("funding-account-name").value = data.account?.accountName || "";
      document.getElementById("funding-account-number").value = data.account?.accountNumber || "";
    } catch (error) { status.textContent = error.message; status.classList.add("error"); }
  }

  async function loadManualFundingRequests() {
    const section = document.getElementById("manual-funding-requests");
    section.innerHTML = '<div class="status">Loading top-up requests...</div>';
    try {
      const response = await fetch("/api/wallet/manual-transfer/admin/requests", { headers:{ Authorization:`Bearer ${token()}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load top-up requests.");
      const requests = data.requests || [];
      section.innerHTML = requests.length ? requests.map((item) => `<article class="application" data-funding-card="${escapeHtml(item.id)}"><div class="application-head"><h2>${escapeHtml(item.user?.name || "Unknown user")} · ₦${Number(item.amount).toLocaleString()}</h2><span class="badge">Pending</span></div><div class="details"><b>Phone:</b> ${escapeHtml(item.user?.phone || "—")}<br><b>Email:</b> ${escapeHtml(item.user?.email || "—")}<br><b>Sender name:</b> ${escapeHtml(item.senderName)}<br><b>Sender bank:</b> ${escapeHtml(item.senderBank)}<br><b>Bank transfer reference:</b> ${escapeHtml(item.transferReference || "Not supplied")}<br><b>Request ID:</b> ${escapeHtml(item.reference)}<br><b>Submitted:</b> ${escapeHtml(date(item.submittedAt))}</div><div class="actions"><button data-funding-action="approve" data-id="${escapeHtml(item.id)}">Confirm transfer and credit wallet</button><button class="reject" data-funding-action="reject" data-id="${escapeHtml(item.id)}">Reject request</button></div></article>`).join("") : '<div class="status">No pending wallet top-ups.</div>';
    } catch (error) { section.innerHTML = `<div class="status error">${escapeHtml(error.message)}</div>`; }
  }

  async function loadApplications() {
    if (!token()) { list.innerHTML = '<div class="status error">Sign in to your MAMU account first. <a href="/login.html">Login</a></div>'; return; }
    list.innerHTML = '<div class="status">Loading business applications...</div>';
    try {
      const response = await fetch("/api/marketplace/admin/seller-applications?status=all", { headers:{ Authorization:`Bearer ${token()}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load applications.");
      allApplications = data.sellers || [];
      document.getElementById("count-all").textContent = allApplications.length;
      document.getElementById("count-pending").textContent = allApplications.filter((x) => x.status === "pending").length;
      document.getElementById("count-approved").textContent = allApplications.filter((x) => x.status === "approved").length;
      document.getElementById("count-rejected").textContent = allApplications.filter((x) => x.status === "rejected").length;
      renderApplications();
    } catch (error) { list.innerHTML = `<div class="status error">${escapeHtml(error.message)}<br>Make sure this account is configured as the marketplace admin.</div>`; }
  }

  function renderApplications() {
    const filter = document.getElementById("status-filter").value;
    const applications = filter === "all" ? allApplications : allApplications.filter((x) => x.status === filter);
    if (!applications.length) { list.innerHTML = '<div class="status">No applications found for this filter.</div>'; return; }
    list.innerHTML = applications.map((item) => {
      const submissions = (item.applicationHistory || []).map((entry) => `<p>Submitted ${escapeHtml(date(entry.submittedAt))}: ${escapeHtml(entry.businessName)} · ${escapeHtml(entry.city)}, ${escapeHtml(entry.state)}</p>`).join("");
      const reviews = (item.reviewHistory || []).map((entry) => `<p>${escapeHtml(entry.status)} · ${escapeHtml(date(entry.reviewedAt))}${entry.reviewNote ? ` — ${escapeHtml(entry.reviewNote)}` : ""}</p>`).join("");
      const controls = item.status === "pending" ? `<textarea class="review-note" rows="2" maxlength="500" placeholder="Review note (optional)"></textarea><div class="actions"><button data-review="approved" data-id="${escapeHtml(item.id)}">Approve business</button><button class="reject" data-review="rejected" data-id="${escapeHtml(item.id)}">Reject</button></div>` : item.status === "approved" ? `<div class="actions"><button class="suspend" data-review="suspended" data-id="${escapeHtml(item.id)}">Suspend shop</button></div>` : "";
      return `<article class="application"><div class="application-head"><h2>${escapeHtml(item.businessName)}</h2><span class="badge ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></div><div class="details"><b>Business contact:</b> ${escapeHtml(item.phone)}<br><b>Address:</b> ${escapeHtml(item.address)}, ${escapeHtml(item.city)}, ${escapeHtml(item.state)}<br><b>Latest request:</b> ${escapeHtml(date(item.updatedAt || item.createdAt))}${item.reviewNote ? `<br><b>Latest note:</b> ${escapeHtml(item.reviewNote)}` : ""}</div>${controls}<div class="history"><h3>Application history</h3>${submissions || `<p>First application submitted ${escapeHtml(date(item.createdAt))}</p>`}</div><div class="history"><h3>Review history</h3>${reviews || "<p>No decisions recorded yet.</p>"}</div></article>`;
    }).join("");
  }

  document.getElementById("reload").addEventListener("click", loadApplications);
  document.getElementById("funding-requests-reload").addEventListener("click", loadManualFundingRequests);
  document.getElementById("save-funding-account").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const status = document.getElementById("funding-account-status");
    button.disabled = true; button.textContent = "Saving..."; status.textContent = "";
    try {
      const response = await fetch("/api/wallet/manual-transfer/admin/settings", { method:"PUT", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token()}` }, body:JSON.stringify({ bankName:document.getElementById("funding-bank-name").value, accountName:document.getElementById("funding-account-name").value, accountNumber:document.getElementById("funding-account-number").value }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || "Could not save bank details.");
      status.textContent = "Bank transfer details saved."; status.classList.remove("error");
    } catch (error) { status.textContent = error.message; status.classList.add("error"); }
    finally { button.disabled = false; button.textContent = "Save bank details"; }
  });
  document.getElementById("users-reload").addEventListener("click", loadUsers);
  document.getElementById("users-prev").addEventListener("click", () => { if (usersPage > 1) { usersPage--; loadUsers(); } });
  document.getElementById("users-next").addEventListener("click", () => { if (usersPage < usersPages) { usersPage++; loadUsers(); } });
  document.getElementById("user-search").addEventListener("input", () => { clearTimeout(usersSearchTimer); usersSearchTimer = setTimeout(() => { usersPage = 1; loadUsers(); }, 300); });
  document.getElementById("status-filter").addEventListener("change", renderApplications);
  document.getElementById("manual-funding-requests").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-funding-action]"); if (!button) return;
    const action = button.dataset.fundingAction;
    if (action === "approve" && !window.confirm("Have you confirmed this transfer in the bank account? This will credit the user's wallet.")) return;
    button.disabled = true;
    try {
      const response = await fetch(`/api/wallet/manual-transfer/admin/requests/${encodeURIComponent(button.dataset.id)}/${action}`, { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token()}` }, body:JSON.stringify({}) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || "Could not process top-up request.");
      await loadManualFundingRequests();
      if (action === "approve") window.alert(`Wallet credited: ₦${Number(data.amount).toLocaleString()}`);
    } catch (error) { button.disabled = false; window.alert(error.message); }
  });
  list.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-review]"); if (!button) return;
    const card = button.closest(".application");
    const reviewNote = card.querySelector(".review-note")?.value || "";
    button.disabled = true; button.textContent = "Saving...";
    try {
      const response = await fetch(`/api/marketplace/admin/seller-applications/${encodeURIComponent(button.dataset.id)}`, { method:"PATCH", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token()}` }, body:JSON.stringify({ status:button.dataset.review, reviewNote }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || "Could not update application.");
      await loadApplications();
    } catch (error) { button.disabled = false; button.textContent = "Retry"; window.alert(error.message); }
  });
  async function initializeAdminPanel() {
    if (!token()) { window.location.replace("/index.html"); return; }
    try {
      const response = await fetch("/api/marketplace/admin/seller-applications?status=all", { headers:{ Authorization:`Bearer ${token()}` } });
      if (!response.ok) { window.location.replace("/index.html"); return; }
      const data = await response.json();
      allApplications = data.sellers || [];
      document.querySelector(".admin-wrap").hidden = false;
      renderApplications();
      await Promise.all([loadUsers(), loadFundingSettings(), loadManualFundingRequests()]);
      window.setInterval(() => { if (!document.hidden) { loadUsers(); loadManualFundingRequests(); } }, 30000);
    } catch (_) {
      window.location.replace("/index.html");
    }
  }
  initializeAdminPanel();
})();
