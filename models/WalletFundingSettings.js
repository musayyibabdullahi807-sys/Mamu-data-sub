const mongoose = require("mongoose");

const walletFundingSettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "primary" },
  bankName: { type: String, trim: true, default: "" },
  accountName: { type: String, trim: true, default: "" },
  accountNumber: { type: String, trim: true, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("WalletFundingSettings", walletFundingSettingsSchema);
