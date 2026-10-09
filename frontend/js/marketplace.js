(() => {
  const productsNode = document.getElementById("marketProducts");
  if (!productsNode) return;
  const token = () => localStorage.getItem("mamu_token");
  let visibleProducts = [];
  let selectedProductImages = [];
  let selectedProductVideo = null;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const money = (kobo) => new Intl.NumberFormat("en-NG", { style:"currency", currency:"NGN", maximumFractionDigits:2 }).format(kobo / 100);
  const authHeaders = (json = false) => ({ ...(json ? { "Content-Type":"application/json" } : {}), ...(token() ? { Authorization:`Bearer ${token()}` } : {}) });

  async function refreshMarketplace() {
    document.getElementById("marketSearchSection").hidden = false;
    productsNode.hidden = false;
    document.getElementById("marketShopPanel").hidden = true;
    document.getElementById("marketMyProductsPanel").hidden = true;
    const query = document.getElementById("marketSearch").value.trim();
    productsNode.innerHTML = '<div class="market-status">Loading products...</div>';
    try {
      const response = await fetch(`/api/marketplace/products${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Could not load products.");
      if (!data.products.length) {
        productsNode.innerHTML = '<div class="market-status">No products have been posted yet. Products will appear here once sellers list them.</div>';
        return;
      }
      visibleProducts = data.products;
      productsNode.innerHTML = visibleProducts.map((product) => `<article class="market-product" data-product-id="${escapeHtml(product.id)}" role="button" tabindex="0" aria-label="View ${escapeHtml(product.name)}">${product.imageUrls?.[0] ? `<img src="${escapeHtml(product.imageUrls[0])}" alt="${escapeHtml(product.name)}" loading="lazy">` : product.videoUrl ? '<div class="market-video-cover">▶</div>' : '<div class="market-no-image">View product</div>'}<div class="market-product-body"><h3>${escapeHtml(product.name)}</h3><div class="market-price">${money(product.priceKobo)}</div><p class="market-meta">${escapeHtml(product.shop.businessName)} · ${escapeHtml(product.shop.city)}, ${escapeHtml(product.shop.state)}</p><p class="market-meta">${escapeHtml(product.category)}</p></div></article>`).join("");
    } catch (error) { productsNode.innerHTML = `<div class="market-status">${escapeHtml(error.message)}</div>`; }
  }
  window.refreshMarketplace = refreshMarketplace;
  const openProductCard = (card) => {
    const product = visibleProducts.find((item) => String(item.id) === card?.dataset.productId);
    if (product) window.openMarketplaceProductDetail?.(product);
  };
  productsNode.addEventListener("click", (event) => openProductCard(event.target.closest("[data-product-id]")));
  productsNode.addEventListener("keydown", (event) => {
    const card = event.target.closest("[data-product-id]");
    if (card && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openProductCard(card); }
  });

  async function loadSellerStatus() {
    const area = document.getElementById("marketSellerStatus"), list = document.getElementById("marketBusinesses");
    if (!token()) { area.textContent = "Sign in to view or register your businesses."; list.innerHTML = ""; return []; }
    try {
      const response = await fetch("/api/marketplace/seller/me", { headers:authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load your businesses.");
      const sellers = data.sellers || (data.seller ? [data.seller] : []);
      area.textContent = sellers.length ? "Business approval status:" : "You have no registered businesses yet.";
      const approved = sellers.filter((seller) => seller.status === "approved");
      const select = document.getElementById("marketBusinessSelect");
      select.innerHTML = approved.map((seller) => `<option value="${escapeHtml(seller.id)}">${escapeHtml(seller.businessName)}</option>`).join("");
      document.getElementById("marketListingSection").hidden = !approved.length;
      list.innerHTML = sellers.map((seller) => {
        const status = seller.status === "approved" ? "Approved" : seller.status === "pending" ? "Pending review" : seller.status[0].toUpperCase() + seller.status.slice(1);
        return `<article class="market-business-card"><div class="market-business-head"><strong>${escapeHtml(seller.businessName)}</strong><span class="market-business-status ${escapeHtml(seller.status)}">${status}</span></div><p>${escapeHtml(seller.address)}, ${escapeHtml(seller.city)}, ${escapeHtml(seller.state)}</p>${seller.reviewNote ? `<p>${escapeHtml(seller.reviewNote)}</p>` : ""}</article>`;
      }).join("");
      return sellers;
    } catch (error) { area.textContent = error.message; return []; }
  }

  async function loadAdminApplications() {
    const section = document.getElementById("marketAdminSection"), area = document.getElementById("marketAdminList");
    if (!token()) { section.hidden = true; return; }
    try {
      const response = await fetch("/api/marketplace/admin/seller-applications", { headers:authHeaders() });
      const data = await response.json();
      if (!response.ok) { section.hidden = true; return; }
      section.hidden = false;
      area.innerHTML = data.sellers.length ? data.sellers.map((seller) => `<div class="market-admin-row"><b>${escapeHtml(seller.businessName)}</b><br>${escapeHtml(seller.phone)} · ${escapeHtml(seller.address)}, ${escapeHtml(seller.city)}, ${escapeHtml(seller.state)}<br><button class="market-button" data-review="approved" data-id="${escapeHtml(seller.id)}">Approve</button><button class="market-button secondary" data-review="rejected" data-id="${escapeHtml(seller.id)}">Reject</button></div>`).join("") : "No pending applications.";
    } catch (_) { section.hidden = true; }
  }

  document.getElementById("marketMenuButton").addEventListener("click", (event) => {
    const menu = document.getElementById("marketMenu"); menu.hidden = !menu.hidden;
    event.currentTarget.setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.getElementById("marketAdminLink").addEventListener("click", () => { window.location.href = "/marketplace-admin.html"; });
  const settingsAdminButton = document.getElementById("settingsMarketplaceAdminBtn");
  if (settingsAdminButton && token()) {
    fetch("/api/marketplace/admin/seller-applications", { headers:authHeaders() })
      .then((response) => { if (response.ok) settingsAdminButton.hidden = false; })
      .catch(() => {});
    settingsAdminButton.addEventListener("click", () => { window.location.href = "/marketplace-admin.html"; });
  }
  window.showMarketplaceMyProducts = async () => {
    document.getElementById("marketMenu").hidden = true;
    document.getElementById("marketSearchSection").hidden = true;
    productsNode.hidden = true;
    document.getElementById("marketShopPanel").hidden = true;
    const panel = document.getElementById("marketMyProductsPanel"), list = document.getElementById("marketMyProducts");
    panel.hidden = false; list.innerHTML = '<div class="market-status">Loading your products...</div>';
    const sellers = await loadSellerStatus();
    const products = sellers.flatMap((seller) => (seller.products || []).map((product) => ({ ...product, shop:product.shop || { businessName:seller.businessName, city:seller.city, state:seller.state } })));
    list._products = products;
    list.innerHTML = products.length ? products.map((product) => `<article class="market-product" data-my-product-id="${escapeHtml(product.id)}" role="button" tabindex="0">${product.imageUrls?.[0] ? `<img src="${escapeHtml(product.imageUrls[0])}" alt="${escapeHtml(product.name)}" loading="lazy">` : product.videoUrl ? '<div class="market-video-cover">▶</div>' : '<div class="market-no-image">No image</div>'}<div class="market-product-body"><h3>${escapeHtml(product.name)}</h3><div class="market-price">${money(product.priceKobo)}</div><p class="market-meta">${escapeHtml(product.shop.businessName)}</p><p class="market-meta">${escapeHtml(product.category)} · Stock: ${product.stock}</p></div></article>`).join("") : '<div class="market-status">You have not listed any products yet.</div>';
    list.scrollIntoView({ behavior:"smooth", block:"start" });
  };
  document.getElementById("marketMyProductsButton").addEventListener("click", () => { document.getElementById("marketMenu").hidden = true; window.showMarketplaceMyProducts(); });
  document.getElementById("marketMyProducts").addEventListener("click", (event) => {
    const card = event.target.closest("[data-my-product-id]"); if (!card) return;
    const item = document.getElementById("marketMyProducts")._products?.find((entry) => String(entry.id) === card.dataset.myProductId);
    if (item) window.openMarketplaceProductDetail?.(item, { allowDelete:true, returnToMyProducts:true });
  });
  document.getElementById("marketBrowseProducts").addEventListener("click", () => { document.getElementById("marketMenu").hidden = true; document.getElementById("marketMenuButton").setAttribute("aria-expanded", "false"); refreshMarketplace(); });
  document.getElementById("marketOpenShop").addEventListener("click", async () => {
    document.getElementById("marketMenu").hidden = true;
    document.getElementById("marketMenuButton").setAttribute("aria-expanded", "false");
    document.getElementById("marketSearchSection").hidden = true;
    productsNode.hidden = true;
    document.getElementById("marketMyProductsPanel").hidden = true;
    document.getElementById("marketShopPanel").hidden = false;
    document.getElementById("marketBusinesses").hidden = false;
    document.getElementById("marketSellerStatus").hidden = false;
    document.getElementById("marketSellerForm").hidden = true;
    document.getElementById("marketListingSection").hidden = true;
    await Promise.all([loadSellerStatus(), loadAdminApplications()]);
    document.getElementById("marketShopPanel").scrollIntoView({ behavior:"smooth", block:"start" });
  });
  document.getElementById("marketAddBusiness").addEventListener("click", async () => {
    document.getElementById("marketMenu").hidden = true;
    document.getElementById("marketSearchSection").hidden = true;
    productsNode.hidden = true;
    document.getElementById("marketMyProductsPanel").hidden = true;
    document.getElementById("marketShopPanel").hidden = false;
    document.getElementById("marketBusinesses").hidden = true;
    document.getElementById("marketSellerStatus").hidden = true;
    document.getElementById("marketSellerForm").hidden = false;
    document.getElementById("marketAdminSection").hidden = true;
    await loadSellerStatus();
    document.getElementById("marketListingSection").hidden = true;
    document.getElementById("marketSellerForm").scrollIntoView({ behavior:"smooth", block:"center" });
  });
  document.getElementById("marketAddProduct").addEventListener("click", async () => {
    document.getElementById("marketMenu").hidden = true;
    document.getElementById("marketSearchSection").hidden = true;
    productsNode.hidden = true;
    document.getElementById("marketMyProductsPanel").hidden = true;
    document.getElementById("marketShopPanel").hidden = false;
    document.getElementById("marketBusinesses").hidden = true;
    document.getElementById("marketSellerStatus").hidden = true;
    document.getElementById("marketSellerForm").hidden = true;
    document.getElementById("marketAdminSection").hidden = true;
    const sellers = await loadSellerStatus();
    const approved = sellers.filter((seller) => seller.status === "approved");
    if (!approved.length) {
      const status = document.getElementById("marketSellerStatus");
      status.hidden = false;
      status.textContent = sellers.length ? "No business is approved yet. Products become available after approval." : "Register a business first, then wait for approval to add products.";
      status.scrollIntoView({ behavior:"smooth", block:"center" }); return;
    }
    document.getElementById("marketListingSection").hidden = false;
    document.getElementById("marketListingSection").scrollIntoView({ behavior:"smooth", block:"center" });
  });
  document.getElementById("marketRefresh").addEventListener("click", refreshMarketplace);
  let searchTimer;
  document.getElementById("marketSearch").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(refreshMarketplace, 250); });
  document.getElementById("marketAdminRefresh").addEventListener("click", loadAdminApplications);

  document.getElementById("marketSellerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.getElementById("marketSellerMessage"), button = event.currentTarget.querySelector("button[type=submit]");
    if (!token()) { status.className = "market-message error"; status.textContent = "Please sign in to your MAMU account first."; return; }
    button.disabled = true; status.className = "market-message"; status.textContent = "Submitting...";
    try {
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      const response = await fetch("/api/marketplace/seller-applications", { method:"POST", headers:authHeaders(true), body:JSON.stringify(payload) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || "Could not submit your application.");
      status.className = "market-message success"; status.textContent = "Application submitted. We will notify you after review.";
      await loadSellerStatus(); event.currentTarget.reset();
    } catch (error) { status.className = "market-message error"; status.textContent = error.message; }
    finally { button.disabled = false; }
  });

  const mediaStatus = document.getElementById("marketMediaStatus");
  const clearMediaSelection = () => {
    selectedProductImages = []; selectedProductVideo = null;
    ["marketProductPhotos", "marketCameraPhoto", "marketProductVideo", "marketCameraVideo"].forEach((id) => { document.getElementById(id).value = ""; });
    mediaStatus.textContent = "Photos: max 9, 5 MB each. Video: max 1, 50 MB.";
  };
  const addPhotos = (files) => {
    const incoming = Array.from(files);
    const valid = incoming.filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 5 * 1024 * 1024);
    const remaining = 9 - selectedProductImages.length;
    selectedProductImages = [...selectedProductImages, ...valid.slice(0, remaining)];
    mediaStatus.textContent = `${selectedProductImages.length}/9 photos selected${incoming.length > valid.length ? " · Some files were unsupported or over 5 MB" : ""}${valid.length > remaining ? " · Maximum is 9" : ""}`;
  };
  ["marketChoosePhotos", "marketTakePhoto", "marketChooseVideo", "marketRecordVideo"].forEach((id, index) => {
    document.getElementById(id).addEventListener("click", () => document.getElementById(["marketProductPhotos", "marketCameraPhoto", "marketProductVideo", "marketCameraVideo"][index]).click());
  });
  ["marketProductPhotos", "marketCameraPhoto"].forEach((id) => document.getElementById(id).addEventListener("change", (event) => { addPhotos(event.target.files); event.target.value = ""; }));
  ["marketProductVideo", "marketCameraVideo"].forEach((id) => document.getElementById(id).addEventListener("change", (event) => {
    const file = event.target.files[0]; event.target.value = ""; if (!file) return;
    if (!["video/mp4", "video/quicktime", "video/webm", "video/3gpp"].includes(file.type) || file.size > 50 * 1024 * 1024) { mediaStatus.textContent = "Choose an MP4, MOV, WebM or 3GP video up to 50 MB."; return; }
    selectedProductVideo = file; mediaStatus.textContent = `${selectedProductImages.length}/9 photos and 1 video selected: ${escapeHtml(file.name)}`;
  }));

  document.getElementById("marketListingForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget, status = document.getElementById("marketListingMessage"), button = form.querySelector("button[type=submit]");
    const values = Object.fromEntries(new FormData(form).entries());
    const toKobo = (value) => Math.round(Number(value) * 100);
    button.disabled = true; status.className = "market-message"; status.textContent = "Adding product...";
    try {
      const imageUrls = []; let videoUrl = "";
      const files = [...selectedProductImages.map((file) => ({ file, kind:"photo" })), ...(selectedProductVideo ? [{ file:selectedProductVideo, kind:"video" }] : [])];
      let storage = "local";
      if (files.length) {
        const modeResponse = await fetch("/api/marketplace/media-upload-mode", { headers:authHeaders() });
        const modeData = await modeResponse.json();
        if (!modeResponse.ok || !modeData.success) throw new Error(modeData.message || "Could not check media storage.");
        storage = modeData.storage;
        if (storage === "unconfigured") throw new Error("Product media storage is not configured on this Vercel site yet.");
      }
      for (let index = 0; index < files.length; index += 1) {
          const { file:mediaFile, kind } = files[index];
          status.textContent = kind === "video" ? "Uploading video..." : `Uploading photo ${index + 1}/${selectedProductImages.length}...`;
          let mediaUrl;
          if (storage === "vercel-blob") {
            if (typeof window.uploadMarketplaceBlob !== "function") throw new Error("Vercel upload support did not load. Refresh and try again.");
            mediaUrl = await window.uploadMarketplaceBlob(mediaFile, values.sellerId, (percentage) => { status.textContent = `Uploading ${kind}... ${Math.round(percentage)}%`; });
          } else {
            const uploadResponse = await fetch("/api/marketplace/product-images", { method:"POST", headers:{ ...authHeaders(), "Content-Type":mediaFile.type }, body:mediaFile });
            const uploadData = await uploadResponse.json();
            if (!uploadResponse.ok || !uploadData.success) throw new Error(uploadData.message || "Could not upload product media.");
            mediaUrl = uploadData.mediaUrl;
          }
          if (kind === "video") videoUrl = mediaUrl; else imageUrls.push(mediaUrl);
      }
      const payload = { sellerId:values.sellerId, name:values.name, description:values.description, category:values.category, basePriceKobo:toKobo(values.basePriceNaira), sellerProfitKobo:toKobo(values.profitNaira), stock:Number(values.stock), imageUrls, videoUrl };
      status.textContent = "Saving product...";
      const response = await fetch("/api/marketplace/products", { method:"POST", headers:authHeaders(true), body:JSON.stringify(payload) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || "Could not add product.");
      status.className = "market-message success"; status.textContent = "Product added to your shop."; form.reset(); clearMediaSelection(); await Promise.all([refreshMarketplace(), loadSellerStatus()]);
    } catch (error) { status.className = "market-message error"; status.textContent = error.message; }
    finally { button.disabled = false; }
  });

  document.getElementById("marketAdminList").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-review]"); if (!button) return;
    button.disabled = true;
    try {
      const response = await fetch(`/api/marketplace/admin/seller-applications/${encodeURIComponent(button.dataset.id)}`, { method:"PATCH", headers:authHeaders(true), body:JSON.stringify({ status:button.dataset.review }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || "Could not update application.");
      await loadAdminApplications();
    } catch (error) { button.disabled = false; window.alert(error.message); }
  });

  refreshMarketplace();
})();
