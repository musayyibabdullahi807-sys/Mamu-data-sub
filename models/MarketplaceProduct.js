const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: "MarketplaceSeller", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 140 },
  description: { type: String, required: true, trim: true, maxlength: 3000 },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  imageUrls: [{ type: String, trim: true, maxlength: 1000 }],
  videoUrl: { type: String, trim: true, maxlength: 1000, default: "" },
  basePriceKobo: { type: Number, required: true, min: 1 },
  sellerProfitKobo: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true });

schema.index({ active: 1, category: 1, createdAt: -1 });
module.exports = mongoose.model("MarketplaceProduct", schema);
