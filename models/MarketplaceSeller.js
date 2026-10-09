const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  businessName: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, required: true, trim: true, maxlength: 20 },
  address: { type: String, required: true, trim: true, maxlength: 300 },
  city: { type: String, required: true, trim: true, maxlength: 80 },
  state: { type: String, required: true, trim: true, maxlength: 80 },
  status: { type: String, enum: ["pending", "approved", "rejected", "suspended"], default: "pending" },
  reviewNote: { type: String, trim: true, maxlength: 500, default: "" },
  reviewedAt: { type: Date, default: null },
  applicationHistory: [{
    businessName: { type: String, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    submittedAt: { type: Date, default: Date.now },
  }],
  reviewHistory: [{
    status: { type: String, enum: ["approved", "rejected", "suspended"] },
    reviewNote: { type: String, trim: true, maxlength: 500, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model("MarketplaceSeller", schema);
