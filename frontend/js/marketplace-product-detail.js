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
