(() => {
  const page = document.getElementById("marketProductDetailPage");
  if (!page) return;
  const media = document.getElementById("marketProductDetailMedia");
  const counter = document.getElementById("marketProductDetailCounter");
  const videoArea = document.getElementById("marketProductDetailVideo");
  const viewer = media.closest(".product-detail-viewer");
  const deleteButton = document.getElementById("marketProductDelete");
  const previous = document.getElementById("marketProductPrevious");
  const next = document.getElementById("marketProductNext");
  const standalone = !page.classList.contains("page");
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const money = (kobo) => new Intl.NumberFormat("en-NG", { style:"currency", currency:"NGN", maximumFractionDigits:2 }).format(kobo / 100);
  let product = null, slide = 0, touchX = null, returnToMyProducts = false, detailHistoryEntry = false;
  const cartUserKey = () => {
    try {
      const token = localStorage.getItem("mamu_token") || "";
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload.userId ? String(payload.userId) : "guest";
    } catch (_) { return "guest"; }
  };
  const cartKey = () => `mamu_marketplace_cart_v1_${cartUserKey()}`;
  const readCart = () => {
    try {
      const value = JSON.parse(localStorage.getItem(cartKey()) || "[]");
      return Array.isArray(value) ? value.filter((item) => item && item.id) : [];
    } catch (_) { return []; }
  };
  const writeCart = (items) => localStorage.setItem(cartKey(), JSON.stringify(items));
  const cartItemsNode = document.getElementById("marketCartItems");
  const cartSummaryNode = document.getElementById("marketCartSummary");
  const cartEscape = (value) => escapeHtml(value);

  function renderCart() {
    const items = readCart();
    if (!items.length) {
      cartItemsNode.innerHTML = '<div class="market-status">Your cart is empty. Browse Marketplace and add products you want to buy.</div>';
      cartSummaryNode.hidden = true;
      cartSummaryNode.textContent = "";
      return;
    }
    cartItemsNode.innerHTML = items.map((item) => `<article class="market-cart-item"><img src="${cartEscape(item.imageUrl || "")}" alt="${cartEscape(item.name)}" ${item.imageUrl ? "" : "hidden"}><div class="market-cart-item-info"><strong>${cartEscape(item.name)}</strong><span>${cartEscape(item.shopName || "Marketplace")}</span><b>${money(Number(item.priceKobo) || 0)}</b><div class="market-cart-quantity"><button type="button" data-cart-action="minus" data-cart-id="${cartEscape(item.id)}" aria-label="Decrease quantity">−</button><span>${Number(item.quantity) || 1}</span><button type="button" data-cart-action="plus" data-cart-id="${cartEscape(item.id)}" aria-label="Increase quantity">+</button><button type="button" class="market-cart-remove" data-cart-action="remove" data-cart-id="${cartEscape(item.id)}">Remove</button></div></div></article>`).join("");
    const total = items.reduce((sum, item) => sum + (Number(item.priceKobo) || 0) * (Number(item.quantity) || 1), 0);
    cartSummaryNode.innerHTML = `<strong>Subtotal</strong><strong>${money(total)}</strong>`;
    cartSummaryNode.hidden = false;
  }

  function addProductToCart(item) {
    const stock = Math.max(0, Number(item.stock) || 0);
    const status = document.getElementById("marketCartAddStatus");
    if (!item?.id || stock < 1) { status.textContent = "This product is currently out of stock."; status.className = "market-message error"; return; }
    const items = readCart();
    const existing = items.find((entry) => String(entry.id) === String(item.id));
    if (existing && Number(existing.quantity) >= stock) { status.textContent = "Your cart already has the available quantity."; status.className = "market-message error"; return; }
    if (existing) {
      existing.quantity = (Number(existing.quantity) || 1) + 1;
      existing.stock = stock;
    } else {
      items.push({ id:String(item.id), name:item.name || "Product", priceKobo:Number(item.priceKobo) || 0, imageUrl:item.imageUrls?.[0] || "", shopName:item.shop?.businessName || "Marketplace", quantity:1, stock });
    }
    writeCart(items);
    status.textContent = "Added to your cart.";
    status.className = "market-message success";
    document.getElementById("marketOpenCartFromProduct").hidden = false;
    renderCart();
  }

  window.addEventListener("storage", (event) => { if (event.key === cartKey()) renderCart(); });
  document.querySelector('[data-page="marketplaceCartPage"]')?.addEventListener("click", renderCart);
  cartItemsNode?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-cart-action]");
    if (!button) return;
    const items = readCart();
    const item = items.find((entry) => String(entry.id) === button.dataset.cartId);
    if (!item) return;
    if (button.dataset.cartAction === "remove") writeCart(items.filter((entry) => String(entry.id) !== button.dataset.cartId));
    else if (button.dataset.cartAction === "minus") {
      item.quantity = (Number(item.quantity) || 1) - 1;
      writeCart(item.quantity > 0 ? items : items.filter((entry) => String(entry.id) !== button.dataset.cartId));
    } else if (button.dataset.cartAction === "plus") {
      if ((Number(item.quantity) || 1) < (Number(item.stock) || 0)) item.quantity = (Number(item.quantity) || 1) + 1;
      writeCart(items);
    }
    renderCart();
  });
  document.getElementById("marketProductAddToCart")?.addEventListener("click", () => { if (product) addProductToCart(product); });
  document.getElementById("marketOpenCartFromProduct")?.addEventListener("click", () => {
    document.querySelector(".bottom-nav")?.classList.remove("product-detail-hidden");
    renderCart();
    window.showPage?.("marketplaceCart");
  });
  renderCart();

  function renderMedia() {
    if (!product) return;
    const photos = product.imageUrls || [];
    if (!photos.length) {
      viewer.hidden = true;
      counter.textContent = "";
    } else {
      viewer.hidden = false;
      slide = (slide + photos.length) % photos.length;
      media.innerHTML = `<img src="${escapeHtml(photos[slide])}" alt="${escapeHtml(product.name)} photo ${slide + 1} of ${photos.length}">`;
      const multiple = photos.length > 1;
      previous.hidden = !multiple; next.hidden = !multiple;
      counter.textContent = `${slide + 1} / ${photos.length}`;
    }
    videoArea.innerHTML = product.videoUrl ? `<video src="${escapeHtml(product.videoUrl)}" controls playsinline preload="none" aria-label="${escapeHtml(product.name)} video"></video>` : "";
    const mediaRow = viewer.closest(".product-detail-media-row");
    mediaRow?.classList.toggle("has-photos", photos.length > 0);
    mediaRow?.classList.toggle("has-video", Boolean(product.videoUrl));
  }

  window.openMarketplaceProductDetail = (item, options = {}) => {
    product = item; slide = 0; returnToMyProducts = Boolean(options.returnToMyProducts);
    const addStatus = document.getElementById("marketCartAddStatus");
    addStatus.textContent = ""; addStatus.className = "market-message";
    document.getElementById("marketOpenCartFromProduct").hidden = !readCart().some((entry) => String(entry.id) === String(item.id));
    deleteButton.hidden = !options.allowDelete;
    document.getElementById("marketProductDetailTitle").textContent = item.name || "Product";
    document.getElementById("marketProductDetailPrice").textContent = money(item.priceKobo || 0);
    document.getElementById("marketProductDetailDescription").textContent = item.description || "";
    document.getElementById("marketProductDetailCategory").textContent = item.category || "";
    const shop = item.shop || {};
    document.getElementById("marketProductDetailShop").textContent = [shop.businessName, shop.city, shop.state].filter(Boolean).join(" · ");
    document.getElementById("marketProductDetailStock").textContent = `Available: ${Number(item.stock) || 0}`;
    renderMedia();
    if (!standalone) {
      document.querySelector(".bottom-nav")?.classList.add("product-detail-hidden");
      history.pushState({ mamuProductDetail: true }, "", "#product");
      detailHistoryEntry = true;
    }
    if (standalone) {
      document.querySelector(".wrap")?.setAttribute("hidden", "");
      document.querySelector(".top")?.setAttribute("hidden", "");
      page.hidden = false;
    } else window.showPage?.("marketProductDetail");
    window.scrollTo(0, 0);
  };

  function close() {
    const video = videoArea.querySelector("video");
    if (video) video.pause();
    media.replaceChildren(); videoArea.replaceChildren();
    product = null;
    document.querySelector(".bottom-nav")?.classList.remove("product-detail-hidden");
    const shouldReturnToMyProducts = returnToMyProducts;
    if (detailHistoryEntry) {
      detailHistoryEntry = false;
      history.back();
    }
    returnToMyProducts = false;
    deleteButton.hidden = true;
    if (standalone) {
      page.hidden = true;
      document.querySelector(".wrap")?.removeAttribute("hidden");
      document.querySelector(".top")?.removeAttribute("hidden");
    } else window.showPage?.("marketplace");
    if (shouldReturnToMyProducts) window.showMarketplaceMyProducts?.();
  }
  deleteButton.addEventListener("click", async () => {
    if (!product || !window.confirm("Do you want to delete this product?")) return;
    deleteButton.disabled = true; deleteButton.textContent = "Deleting...";
    try {
      const response = await fetch(`/api/marketplace/products/${encodeURIComponent(product.id)}`, { method:"DELETE", headers:{ Authorization:`Bearer ${localStorage.getItem("mamu_token") || ""}` } });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Could not delete product.");
      close();
    } catch (error) { window.alert(error.message); }
    finally { deleteButton.disabled = false; deleteButton.textContent = "Delete"; }
  });
  function move(direction) { if (!product?.imageUrls?.length) return; slide = (slide + direction + product.imageUrls.length) % product.imageUrls.length; renderMedia(); }

  window.addEventListener("popstate", () => {
    if (detailHistoryEntry && product) {
      detailHistoryEntry = false;
      close();
    }
  });
  document.getElementById("marketProductDetailBack").addEventListener("click", close);
  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  media.addEventListener("touchstart", (event) => { touchX = event.changedTouches[0]?.clientX ?? null; }, { passive:true });
  media.addEventListener("touchend", (event) => {
    if (touchX === null) return;
    const delta = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
    if (Math.abs(delta) > 45) move(delta < 0 ? 1 : -1);
    touchX = null;
  }, { passive:true });
  document.addEventListener("keydown", (event) => {
    if (standalone ? page.hidden : !page.classList.contains("active")) return;
    if (event.key === "Escape") close();
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
  });
})();
