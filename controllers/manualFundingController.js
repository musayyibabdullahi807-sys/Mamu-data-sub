const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const WalletFundingSettings = require("../models/WalletFundingSettings");

const clean = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const ownerOnly = (req, res, next) => {
  if (String(req.user?._id || "").toLowerCase() !== "6ab274d7c6cacf9e61d034f6") {
    return res.status(403).json({ success: false, message: "Administrator access required." });
  }
  next();
};

async function getAccountDetails(req, res) {
  try {
    const settings = await WalletFundingSettings.findOne({ key: "primary" }).lean();
    const configured = Boolean(settings?.bankName && settings?.accountName && /^\d{10}$/.test(settings?.accountNumber || ""));
    return res.json({ success: true, configured, account: configured ? { bankName: settings.bankName, accountName: settings.accountName, accountNumber: settings.accountNumber } : null });
  } catch (_) {
    return res.status(500).json({ success: false, message: "Could not load bank transfer details." });
  }
}

async function createManualTransferRequest(req, res) {
  try {
    const amount = Number(req.body.amount);
    const senderName = clean(req.body.senderName, 100);
    const senderBank = clean(req.body.senderBank, 80);
    const transferReference = clean(req.body.transferReference, 120);
    if (!Number.isSafeInteger(amount) || amount < 100 || amount > 10000000) {
      return res.status(400).json({ success: false, message: "Enter a whole amount between ₦100 and ₦10,000,000." });
    }
    if (senderName.length < 2 || senderBank.length < 2) {
      return res.status(400).json({ success: false, message: "Enter the sender name and bank used for the transfer." });
    }
    const settings = await WalletFundingSettings.findOne({ key: "primary" }).lean();
    if (!settings?.bankName || !settings?.accountName || !/^\d{10}$/.test(settings?.accountNumber || "")) {
      return res.status(503).json({ success: false, message: "Bank transfer details are not available yet." });
    }
    const reference = `MAMU-BANK-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const transaction = await Transaction.create({
      user: req.user._id,
      type: "wallet_funding",
      amount,
      status: "pending",
      reference,
      description: "Bank transfer wallet funding (awaiting admin confirmation)",
      metadata: { fundingMethod: "manual_bank_transfer", senderName, senderBank, transferReference },
    });
    return res.status(201).json({ success: true, message: "Top-up request submitted. Your wallet will be credited after the bank transfer is confirmed.", reference: transaction.reference, status: transaction.status });
  } catch (error) {
    console.error("Manual bank funding request error:", error.message);
    return res.status(500).json({ success: false, message: "Could not submit your transfer request." });
  }
}

async function getAdminFundingSettings(req, res) {
  const settings = await WalletFundingSettings.findOne({ key: "primary" }).lean();
  return res.json({ success: true, account: settings ? { bankName: settings.bankName, accountName: settings.accountName, accountNumber: settings.accountNumber } : { bankName: "", accountName: "", accountNumber: "" } });
}

async function saveAdminFundingSettings(req, res) {
  const bankName = clean(req.body.bankName, 80);
  const accountName = clean(req.body.accountName, 100);
  const accountNumber = clean(req.body.accountNumber, 10);
  if (bankName.length < 2 || accountName.length < 2 || !/^\d{10}$/.test(accountNumber)) {
    return res.status(400).json({ success: false, message: "Enter the bank name, account name and valid 10-digit account number." });
  }
  const settings = await WalletFundingSettings.findOneAndUpdate(
    { key: "primary" },
    { $set: { bankName, accountName, accountNumber }, $setOnInsert: { key: "primary" } },
    { new: true, upsert: true, runValidators: true },
  ).lean();
  return res.json({ success: true, account: { bankName: settings.bankName, accountName: settings.accountName, accountNumber: settings.accountNumber } });
}

async function listManualTransferRequests(req, res) {
  const transactions = await Transaction.find({ type: "wallet_funding", status: "pending", "metadata.fundingMethod": "manual_bank_transfer" })
    .sort({ createdAt: 1 }).limit(200).populate("user", "name phone email").lean();
  return res.json({ success: true, requests: transactions.map((item) => ({ id: String(item._id), user: item.user ? { id: String(item.user._id), name: item.user.name, phone: item.user.phone, email: item.user.email || "" } : null, amount: item.amount, reference: item.reference, senderName: item.metadata.senderName || "", senderBank: item.metadata.senderBank || "", transferReference: item.metadata.transferReference || "", submittedAt: item.createdAt })) });
}

async function approveManualTransfer(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid top-up request." });
  const session = await mongoose.startSession();
  try {
    let credited;
    await session.withTransaction(async () => {
      const transaction = await Transaction.findOne({ _id: req.params.id, type: "wallet_funding", status: "pending", "metadata.fundingMethod": "manual_bank_transfer" }).session(session);
      if (!transaction) throw new Error("This request is no longer pending.");
      const user = await User.findById(transaction.user).session(session);
      if (!user) throw new Error("The user account was not found.");
      user.walletBalance += transaction.amount;
      await user.save({ session });
      transaction.status = "successful";
      transaction.metadata = { ...transaction.metadata, verifiedBy: String(req.user._id), verifiedAt: new Date() };
      transaction.description = "Bank transfer wallet funding (confirmed by admin)";
      await transaction.save({ session });
      credited = { amount: transaction.amount, walletBalance: user.walletBalance };
    });
    return res.json({ success: true, message: "Transfer confirmed and wallet credited.", ...credited });
  } catch (error) {
    if (/no longer pending|account was not found/i.test(error.message)) return res.status(409).json({ success: false, message: error.message });
    console.error("Manual bank transfer approval error:", error.message);
    return res.status(500).json({ success: false, message: "Could not confirm the transfer." });
  } finally {
    await session.endSession();
  }
}

async function rejectManualTransfer(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid top-up request." });
  const transaction = await Transaction.findOneAndUpdate(
    { _id: req.params.id, type: "wallet_funding", status: "pending", "metadata.fundingMethod": "manual_bank_transfer" },
    { $set: { status: "failed", description: "Bank transfer wallet funding (not confirmed)", "metadata.reviewedBy": String(req.user._id), "metadata.reviewedAt": new Date(), "metadata.reviewNote": clean(req.body.note, 300) } },
    { new: true },
  );
  if (!transaction) return res.status(409).json({ success: false, message: "This request is no longer pending." });
  return res.json({ success: true, message: "Top-up request rejected." });
}

module.exports = { ownerOnly, getAccountDetails, createManualTransferRequest, getAdminFundingSettings, saveAdminFundingSettings, listManualTransferRequests, approveManualTransfer, rejectManualTransfer };
