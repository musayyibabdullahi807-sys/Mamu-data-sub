const express = require("express");
const mongoose = require("mongoose");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const protect = require("../middleware/authMiddleware");
const Seller = require("../models/MarketplaceSeller");
const Product = require("../models/MarketplaceProduct");
const User = require("../models/User");

const router = express.Router();
const text = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const adminOnly = (req, res, next) => {
  const adminId = process.env.MAMU_MARKETPLACE_ADMIN_USER_ID;
  if (!adminId || String(req.user._id) !== adminId) return res.status(403).json({ success: false, message: "Marketplace administrator access required" });
  next();
};
let ownerIndexMigration;
async function removeLegacyUniqueOwnerIndex() {
  if (!ownerIndexMigration) ownerIndexMigration = (async () => {
    const indexes = await Seller.collection.indexes();
    const legacy = indexes.find((index) => index.unique && index.key?.owner === 1);
    if (legacy) await Seller.collection.dropIndex(legacy.name);
  })();
  return ownerIndexMigration;
}
const sellerView = (seller) => ({
  id: seller._id, businessName: seller.businessName, phone: seller.phone,
  address: seller.address, city: seller.city, state: seller.state,
  status: seller.status, reviewNote: seller.reviewNote, reviewedAt: seller.reviewedAt,
  createdAt: seller.createdAt, updatedAt: seller.updatedAt,
  applicationHistory: seller.applicationHistory || [], reviewHistory: seller.reviewHistory || [],
});

router.get("/products", async (req, res) => {
  try {
    const filter = { active: true };
    if (req.query.category) filter.category = text(req.query.category, 80);
    if (req.query.q) { const query = text(req.query.q, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); filter.name = { $regex: query, $options: "i" }; }
    const products = await Product.find(filter).sort({ createdAt: -1 }).limit(60).populate({ path: "seller", match: { status: "approved" }, select: "businessName city state" });
    return res.json({ success: true, products: products.filter((p) => p.seller).map((p) => ({ id: p._id, name: p.name, description: p.description, category: p.category, imageUrls: p.imageUrls, videoUrl: p.videoUrl || "", priceKobo: p.basePriceKobo + p.sellerProfitKobo, stock: p.stock, shop: p.seller })) });
  } catch (error) { return res.status(500).json({ success: false, message: "Could not load products" }); }
});

router.post("/seller-applications", protect, async (req, res) => {
  try {
    const details = { businessName: text(req.body.businessName, 120), phone: text(req.body.phone, 20), address: text(req.body.address, 300), city: text(req.body.city, 80), state: text(req.body.state, 80) };
    if (Object.values(details).some((v) => !v)) return res.status(400).json({ success: false, message: "Business name, phone, full address, city and state are required" });
    await removeLegacyUniqueOwnerIndex();
    const seller = await Seller.create({ ...details, owner: req.user._id, status: "pending", applicationHistory: [{ ...details, submittedAt: new Date() }] });
    return res.status(201).json({ success: true, seller: sellerView(seller) });
  } catch (error) { return res.status(500).json({ success: false, message: "Could not submit seller application" }); }
});

router.get("/seller/me", protect, async (req, res) => {
  try {
    const sellers = await Seller.find({ owner: req.user._id }).sort({ createdAt: -1 });
    const products = await Product.find({ seller: { $in: sellers.map((seller) => seller._id) } }).sort({ createdAt: -1 });
    const sellerMap = new Map(sellers.map((seller) => [String(seller._id), seller]));
    const grouped = new Map(sellers.map((seller) => [String(seller._id), []]));
    for (const product of products) {
      const shop = sellerMap.get(String(product.seller));
      grouped.get(String(product.seller))?.push({ id: product._id, name: product.name, description: product.description, category: product.category, imageUrls: product.imageUrls, videoUrl: product.videoUrl || "", priceKobo: product.basePriceKobo + product.sellerProfitKobo, stock: product.stock, active: product.active, shop: shop ? { businessName: shop.businessName, city: shop.city, state: shop.state } : {} });
    }
    const result = sellers.map((seller) => ({ ...sellerView(seller), products: grouped.get(String(seller._id)) || [] }));
    return res.json({ success: true, seller: result[0] || null, sellers: result });
  } catch (_) { return res.status(500).json({ success: false, message: "Could not load your businesses" }); }
});

router.get("/admin/users", protect, adminOnly, async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const search = text(req.query.q, 100);
    const filter = {};
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { phone: { $regex: escaped, $options: "i" } },
        { email: { $regex: escaped, $options: "i" } },
      ];
    }
    const [users, total] = await Promise.all([
      User.find(filter).select("name phone email username city state accountStatus isVerified createdAt").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    return res.json({ success: true, users: users.map((user) => ({ id: String(user._id), name: user.name, phone: user.phone, email: user.email || "", username: user.username || "", city: user.city || "", state: user.state || "", accountStatus: user.accountStatus, isVerified: user.isVerified, registeredAt: user.createdAt })), total, page, pages: Math.ceil(total / limit), limit });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Could not load registered users" });
  }
});

router.get("/admin/seller-applications", protect, adminOnly, async (req, res) => {
  const status = ["pending", "approved", "rejected", "suspended", "all"].includes(req.query.status) ? req.query.status : "pending";
  const filter = status === "all" ? {} : { status };
  const sellers = await Seller.find(filter).sort({ updatedAt: -1 }).limit(200);
  return res.json({ success: true, sellers: sellers.map(sellerView) });
});

router.patch("/admin/seller-applications/:id", protect, adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid application id" });
  if (!["approved", "rejected", "suspended"].includes(req.body.status)) return res.status(400).json({ success: false, message: "Status must be approved, rejected or suspended" });
  const reviewNote = text(req.body.reviewNote, 500);
  const reviewedAt = new Date();
  const seller = await Seller.findByIdAndUpdate(req.params.id, {
    $set: { status: req.body.status, reviewNote, reviewedAt },
    $push: { reviewHistory: { status: req.body.status, reviewNote, reviewedBy: req.user._id, reviewedAt } },
  }, { new: true, runValidators: true });
  if (!seller) return res.status(404).json({ success: false, message: "Application not found" });
  return res.json({ success: true, seller: sellerView(seller) });
});

router.post("/product-images", protect, express.raw({ type: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm", "video/3gpp"], limit: "50mb" }), async (req, res) => {
  try {
    const seller = await Seller.findOne({ owner: req.user._id, status: "approved" });
    if (!seller) return res.status(403).json({ success: false, message: "An approved business is required to upload product media" });
    const media = req.body;
    if (!Buffer.isBuffer(media) || media.length < 12) return res.status(400).json({ success: false, message: "Choose a supported photo or video" });
    const contentType = req.headers["content-type"];
    let extension, kind;
    if (media[0] === 0xff && media[1] === 0xd8 && media[2] === 0xff) { extension = "jpg"; kind = "image"; }
    else if (media.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) { extension = "png"; kind = "image"; }
    else if (media.toString("ascii", 0, 4) === "RIFF" && media.toString("ascii", 8, 12) === "WEBP") { extension = "webp"; kind = "image"; }
    else if (media.toString("ascii", 4, 8) === "ftyp" && ["video/mp4", "video/quicktime", "video/3gpp"].includes(contentType)) { extension = contentType === "video/quicktime" ? "mov" : contentType === "video/3gpp" ? "3gp" : "mp4"; kind = "video"; }
    else if (media.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && contentType === "video/webm") { extension = "webm"; kind = "video"; }
    else return res.status(400).json({ success: false, message: "The selected file is not a supported photo or video" });
    if (kind === "image" && media.length > 5 * 1024 * 1024) return res.status(413).json({ success: false, message: "Each photo must be 5 MB or smaller" });
    const filename = `${crypto.randomUUID()}.${extension}`;
    const directory = path.join(__dirname, "..", "frontend", "uploads", "marketplace");
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, filename), media, { flag: "wx" });
    return res.status(201).json({ success: true, mediaUrl: `/uploads/marketplace/${filename}`, kind });
  } catch (error) { return res.status(500).json({ success: false, message: "Could not save product media" }); }
});

router.post("/products", protect, async (req, res) => {
  const filter = { owner: req.user._id, status: "approved" };
  if (req.body.sellerId) {
    if (!mongoose.isValidObjectId(req.body.sellerId)) return res.status(400).json({ success: false, message: "Invalid business" });
    filter._id = req.body.sellerId;
  }
  const seller = await Seller.findOne(filter).sort({ createdAt: -1 });
  if (!seller) return res.status(403).json({ success: false, message: "Choose an approved business before listing products" });
  const name = text(req.body.name, 140), description = text(req.body.description, 3000), category = text(req.body.category, 80);
  const basePriceKobo = Number(req.body.basePriceKobo), sellerProfitKobo = Number(req.body.sellerProfitKobo), stock = Number(req.body.stock);
  const submittedImages = Array.isArray(req.body.imageUrls) ? req.body.imageUrls : [];
  const imageUrls = submittedImages.slice(0, 9).map((url) => text(url, 1000));
  const videoUrl = text(req.body.videoUrl, 1000);
  if (submittedImages.length > 9 || (videoUrl && !videoUrl.startsWith("/uploads/marketplace/"))) return res.status(400).json({ success: false, message: "A product can have up to 9 photos and 1 uploaded video" });
  if (!name || !description || !category || !Number.isSafeInteger(basePriceKobo) || basePriceKobo < 1 || !Number.isSafeInteger(sellerProfitKobo) || sellerProfitKobo < 0 || !Number.isSafeInteger(stock) || stock < 0) return res.status(400).json({ success: false, message: "Provide product details, price and profit in kobo, and a non-negative stock count" });
  try {
    const product = await Product.create({ seller: seller._id, name, description, category, imageUrls, videoUrl, basePriceKobo, sellerProfitKobo, stock });
    return res.status(201).json({ success: true, product: { id: product._id, name: product.name, priceKobo: basePriceKobo + sellerProfitKobo, stock: product.stock } });
  } catch (error) { return res.status(500).json({ success: false, message: "Could not create product" }); }
});

router.delete("/products/:id", protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid product" });
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    const seller = await Seller.findById(product.seller).select("owner");
    if (!seller || String(seller.owner) !== String(req.user._id)) return res.status(404).json({ success: false, message: "Product not found" });
    await Product.deleteOne({ _id: product._id });
    const mediaUrls = [...(product.imageUrls || []), product.videoUrl].filter(Boolean);
    await Promise.all(mediaUrls.map(async (url) => {
      const match = /^\/uploads\/marketplace\/([a-f0-9-]+\.(?:jpg|png|webp|mp4|mov|webm|3gp))$/i.exec(url);
      if (!match) return;
      const filePath = path.join(__dirname, "..", "frontend", "uploads", "marketplace", path.basename(match[1]));
      try { await fs.unlink(filePath); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }));
    return res.json({ success: true, message: "Product deleted" });
  } catch (_) { return res.status(500).json({ success: false, message: "Could not delete product" }); }
});

module.exports = router;
