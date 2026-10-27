    const token = () => localStorage.getItem("mamu_token");
    let visibleProducts = [];
    let approvedSellerId = "";
    const statusBox = document.getElementById("form-status");
    const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const naira = (kobo) => new Intl.NumberFormat("en-NG", { style:"currency", currency:"NGN", maximumFractionDigits:2 }).format(kobo / 100);
    async function loadProducts() {
      const q = document.getElementById("search").value.trim();
      const area = document.getElementById("products");
      area.innerHTML = '<div class="empty">Loading products...</div>';
      try {
        const response = await fetch(`/api/marketplace/products${q ? `?q=${encodeURIComponent(q)}` : ""}`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || "Could not load products");
        if (!data.products.length) { area.innerHTML = '<div class="empty">No products have been posted yet. Products will appear here once sellers list them.</div>'; return; }
        visibleProducts = data.products;
        area.innerHTML = visibleProducts.map((p) => `<article class="product" data-product-id="${escapeHtml(p.id)}" role="button" tabindex="0" aria-label="View ${escapeHtml(p.name)}">${p.imageUrls?.[0] ? `<img src="${escapeHtml(p.imageUrls[0])}" alt="${escapeHtml(p.name)}" loading="lazy">` : p.videoUrl ? '<div class="market-video-cover">▶</div>' : '<div class="empty">View product</div>'}<div class="body"><h3>${escapeHtml(p.name)}</h3><div class="price">${naira(p.priceKobo)}</div><p class="meta">${escapeHtml(p.shop.businessName)} · ${escapeHtml(p.shop.city)}, ${escapeHtml(p.shop.state)}</p><p class="meta">${escapeHtml(p.category)}</p></div></article>`).join("");
      } catch (error) { area.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`; }
    }
    const openProductCard = (card) => { const p = visibleProducts.find((item) => String(item.id) === card?.dataset.productId); if (p) window.openMarketplaceProductDetail?.(p); };
    document.getElementById("products").addEventListener("click", (event) => openProductCard(event.target.closest("[data-product-id]")));
    document.getElementById("products").addEventListener("keydown", (event) => { const card = event.target.closest("[data-product-id]"); if (card && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openProductCard(card); } });
    async function loadSeller() {
      const area = document.getElementById("seller-status");
      if (!token()) { area.textContent = "Sign in to your MAMU account to apply for a shop."; return []; }
      try {
        const response = await fetch("/api/marketplace/seller/me", { headers: { Authorization: `Bearer ${token()}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not load your application");
        const sellers = data.sellers || (data.seller ? [data.seller] : []);
        approvedSellerId = sellers.find((seller) => seller.status === "approved")?.id || "";
        area.innerHTML = sellers.length ? sellers.map((seller) => `<div class="sellerStatus"><b>${escapeHtml(seller.businessName)}</b> · ${seller.status === "approved" ? "Approved" : seller.status === "pending" ? "Pending review" : escapeHtml(seller.status)}${seller.reviewNote ? `<br>${escapeHtml(seller.reviewNote)}` : ""}<br>${(seller.products || []).length} products</div>`).join("") : "You have not registered a business yet.";
        document.getElementById("seller-form").hidden = sellers.length > 0;
        document.getElementById("listing-section").hidden = !sellers.some((seller) => seller.status === "approved");
        return sellers;
      } catch (error) { area.textContent = error.message; return []; }
    }
    document.getElementById("seller-form").addEventListener("submit", async (event) => {
      event.preventDefault(); statusBox.className = "status"; statusBox.textContent = "";
      if (!token()) { statusBox.className = "status error"; statusBox.textContent = "Please sign in to your MAMU account first."; return; }
      const button = event.currentTarget.querySelector("button"); button.disabled = true;
      try {
        const form = new FormData(event.currentTarget); const payload = Object.fromEntries(form.entries());
        const response = await fetch("/api/marketplace/seller-applications", { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token()}` }, body:JSON.stringify(payload) });
        const data = await response.json(); if (!response.ok) throw new Error(data.message || "Could not submit your application");
        statusBox.className = "status ok"; statusBox.textContent = "Application submitted. We will notify you after it is reviewed."; await loadSeller();
      } catch (error) { statusBox.className = "status error"; statusBox.textContent = error.message; }
      finally { button.disabled = false; }
    });
    let selectedImages = [], selectedVideo = null;
    const mediaStatus = document.getElementById("media-status");
    [["choose-photos", "listing-photos"], ["take-photo", "camera-photo"], ["choose-video", "listing-video"], ["record-video", "camera-video"]].forEach(([button, input]) => document.getElementById(button).addEventListener("click", () => document.getElementById(input).click()));
    ["listing-photos", "camera-photo"].forEach((id) => document.getElementById(id).addEventListener("change", (event) => {
      const files = Array.from(event.target.files), valid = files.filter((f) => ["image/jpeg", "image/png", "image/webp"].includes(f.type) && f.size <= 5 * 1024 * 1024), remaining = 9 - selectedImages.length;
      selectedImages = [...selectedImages, ...valid.slice(0, remaining)]; mediaStatus.textContent = `${selectedImages.length}/9 photos selected${valid.length > remaining ? " · Maximum is 9" : ""}${files.length > valid.length ? " · Unsupported or over 5 MB file skipped" : ""}`; event.target.value = "";
    }));
    ["listing-video", "camera-video"].forEach((id) => document.getElementById(id).addEventListener("change", (event) => {
      const file = event.target.files[0]; event.target.value = ""; if (!file) return;
      if (!["video/mp4", "video/quicktime", "video/webm", "video/3gpp"].includes(file.type) || file.size > 50 * 1024 * 1024) { mediaStatus.textContent = "Choose MP4, MOV, WebM or 3GP video up to 50 MB."; return; }
      selectedVideo = file; mediaStatus.textContent = `${selectedImages.length}/9 photos and 1 video selected: ${escapeHtml(file.name)}`;
    }));
    document.getElementById("listing-form").addEventListener("submit", async (event) => {
      event.preventDefault(); const form = new FormData(event.currentTarget); const payload = Object.fromEntries(form.entries());
      const status = document.getElementById("listing-status"), button = event.currentTarget.querySelector("button[type=submit]");
      const toKobo = (value) => Math.round(Number(value) * 100);
      button.disabled = true; status.className = "status"; status.textContent = "";
      try {
        const imageUrls = []; let videoUrl = ""; const files = [...selectedImages.map((file) => ({ file, kind:"photo" })), ...(selectedVideo ? [{ file:selectedVideo, kind:"video" }] : [])];
        let storage = "local";
        if (files.length) {
          const modeResponse = await fetch("/api/marketplace/media-upload-mode", { headers:{ Authorization:`Bearer ${token()}` } });
          const modeData = await modeResponse.json(); if (!modeResponse.ok || !modeData.success) throw new Error(modeData.message || "Could not check media storage.");
          storage = modeData.storage;
          if (storage === "unconfigured") throw new Error("Product media storage is not configured on this Vercel site yet.");
        }
        for (let i = 0; i < files.length; i += 1) {
          const { file:media, kind } = files[i]; status.textContent = kind === "video" ? "Uploading video..." : `Uploading photo ${i + 1}/${selectedImages.length}...`;
          let mediaUrl;
          if (storage === "vercel-blob") {
            if (typeof window.uploadMarketplaceBlob !== "function") throw new Error("Vercel upload support did not load. Refresh and try again.");
            mediaUrl = await window.uploadMarketplaceBlob(media, approvedSellerId, (percentage) => { status.textContent = `Uploading ${kind}... ${Math.round(percentage)}%`; });
          } else {
            const uploadResponse = await fetch("/api/marketplace/product-images", { method:"POST", headers:{ Authorization:`Bearer ${token()}`, "Content-Type":media.type }, body:media });
            const uploadData = await uploadResponse.json(); if (!uploadResponse.ok) throw new Error(uploadData.message || "Could not upload media.");
            mediaUrl = uploadData.mediaUrl;
          }
          if (kind === "video") videoUrl = mediaUrl; else imageUrls.push(mediaUrl);
        }
        const body = { name:payload.name, description:payload.description, category:payload.category, basePriceKobo:toKobo(payload.basePriceNaira), sellerProfitKobo:toKobo(payload.profitNaira), stock:Number(payload.stock), imageUrls, videoUrl };
        status.textContent = "Saving product...";
        const response = await fetch("/api/marketplace/products", { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token()}` }, body:JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.message || "Could not add product"); status.className = "status ok"; status.textContent = "Product added to your shop."; event.currentTarget.reset(); selectedImages = []; selectedVideo = null; mediaStatus.textContent = "Photos: max 9, 5 MB each. Video: max 1, 50 MB."; await loadProducts();
      }
      catch (error) { status.className = "status error"; status.textContent = error.message; } finally { button.disabled = false; }
    });
    async function loadAdminApplications() {
      const area = document.getElementById("admin-list"); area.textContent = "Loading applications...";
      try {
        const response = await fetch("/api/marketplace/admin/seller-applications", { headers:{ Authorization:`Bearer ${token()}` } });
        const data = await response.json(); if (!response.ok) { document.getElementById("admin-section").hidden = true; throw new Error(data.message || "Administrator access required"); }
        document.getElementById("admin-section").hidden = false;
        area.innerHTML = data.sellers.length ? data.sellers.map((seller) => `<div class="sellerStatus"><b>${escapeHtml(seller.businessName)}</b><br>${escapeHtml(seller.phone)} · ${escapeHtml(seller.address)}, ${escapeHtml(seller.city)}, ${escapeHtml(seller.state)}<br><button data-review="approved" data-id="${escapeHtml(seller.id)}" >Approve</button> <button data-review="rejected" data-id="${escapeHtml(seller.id)}" style="background:#a32d45">Reject</button></div>`).join("") : "No pending applications.";
      } catch (error) { area.textContent = error.message; }
    }
    document.getElementById("admin-refresh").addEventListener("click", loadAdminApplications);
    document.getElementById("admin-list").addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-review]"); if (!button) return;
      button.disabled = true;
      try { const response = await fetch(`/api/marketplace/admin/seller-applications/${encodeURIComponent(button.dataset.id)}`, { method:"PATCH", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token()}` }, body:JSON.stringify({ status:button.dataset.review }) }); const data = await response.json(); if (!response.ok) throw new Error(data.message || "Could not update application"); await loadAdminApplications(); }
      catch (error) { alert(error.message); button.disabled = false; }
    });
    const menuButton = document.getElementById("menu-button");
    const topMenu = document.getElementById("top-menu");
    menuButton.addEventListener("click", () => { topMenu.hidden = !topMenu.hidden; menuButton.setAttribute("aria-expanded", String(!topMenu.hidden)); });
    const showShopPanel = async (mode) => {
      const panel = document.getElementById("shop-panel");
      panel.hidden = false;
      document.getElementById("public-products-panel").hidden = true;
      document.getElementById("my-products-panel").hidden = true;
      document.getElementById("seller-form").hidden = mode !== "business";
      document.getElementById("listing-section").hidden = true;
      topMenu.hidden = true; menuButton.setAttribute("aria-expanded", "false");
      const sellers = await loadSeller();
      if (mode === "product") {
        if (sellers.some((seller) => seller.status === "approved")) document.getElementById("listing-section").hidden = false;
        else document.getElementById("seller-status").textContent = sellers.length ? "No business is approved yet. You can add a product after approval." : "Register a business and wait for approval before adding products.";
      }
      if (mode === "business" && sellers.length) {
        document.getElementById("seller-form").hidden = true;
        document.getElementById("seller-status").textContent = "Each user can register only one business. Your existing application is shown under My businesses.";
      }
    };
    document.getElementById("browse-products").addEventListener("click", () => { topMenu.hidden = true; menuButton.setAttribute("aria-expanded", "false"); document.getElementById("public-products-panel").hidden = false; document.getElementById("shop-panel").hidden = true; document.getElementById("my-products-panel").hidden = true; loadProducts(); });
    document.getElementById("open-shop").addEventListener("click", () => showShopPanel("businesses"));
    document.getElementById("add-product-menu").addEventListener("click", () => showShopPanel("product"));
    document.getElementById("add-business-menu").addEventListener("click", () => showShopPanel("business"));
    let myProducts = [];
    window.showMarketplaceMyProducts = async () => {
      topMenu.hidden = true; menuButton.setAttribute("aria-expanded", "false");
      document.getElementById("shop-panel").hidden = true;
      document.getElementById("public-products-panel").hidden = true;
      const panel = document.getElementById("my-products-panel"), area = document.getElementById("my-products-list");
      panel.hidden = false; area.innerHTML = '<div class="empty">Loading your products...</div>';
      const sellers = await loadSeller();
      myProducts = sellers.flatMap((seller) => (seller.products || []).map((product) => ({ ...product, shop:product.shop || { businessName:seller.businessName, city:seller.city, state:seller.state } })));
      area.innerHTML = myProducts.length ? myProducts.map((product) => `<article class="product" data-owned-product="${escapeHtml(product.id)}" role="button" tabindex="0">${product.imageUrls?.[0] ? `<img src="${escapeHtml(product.imageUrls[0])}" alt="${escapeHtml(product.name)}" loading="lazy">` : product.videoUrl ? '<div class="market-video-cover">▶</div>' : '<div class="empty">No image</div>'}<div class="body"><h3>${escapeHtml(product.name)}</h3><div class="price">${naira(product.priceKobo)}</div><p class="meta">${escapeHtml(product.shop.businessName)} · ${escapeHtml(product.category)} · Stock: ${product.stock}</p></div></article>`).join("") : '<div class="empty">You have not listed any products yet.</div>';
    };
    document.getElementById("my-products-menu").addEventListener("click", () => window.showMarketplaceMyProducts());
    document.getElementById("my-products-list").addEventListener("click", (event) => { const card = event.target.closest("[data-owned-product]"); const product = myProducts.find((item) => String(item.id) === card?.dataset.ownedProduct); if (product) window.openMarketplaceProductDetail?.(product, { allowDelete:true, returnToMyProducts:true }); });
    document.getElementById("refresh").addEventListener("click", loadProducts);
    let timer; document.getElementById("search").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(loadProducts, 250); });
    loadProducts(); loadSeller(); if (token()) loadAdminApplications();
