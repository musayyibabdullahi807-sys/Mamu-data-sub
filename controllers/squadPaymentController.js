const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

function squadConfig() {
  const mode = String(process.env.SQUAD_MODE || "sandbox").toLowerCase() === "live" ? "live" : "sandbox";
  return {
    mode,
    baseUrl: mode === "live" ? "https://api-d.squadco.com" : "https://sandbox-api-d.squadco.com",
    secret: process.env.SQUAD_SECRET_KEY,
  };
}

const accountPayload = (user) => {
  const va = user.squadVirtualAccount;
  if (!va?.virtualAccountNumber) return null;
  return {
    bankName: va.bankName || "Squad Virtual Account",
    accountName: va.accountName || user.name,
    accountNumber: va.virtualAccountNumber,
    customerIdentifier: va.customerIdentifier,
    createdAt: va.createdAt,
  };
};

async function getSquadAccount(req, res) {
  try {
    const user = await User.findById(req.user._id).select("name squadVirtualAccount").lean();
    return res.json({ success: true, account: user ? accountPayload(user) : null });
  } catch (error) {
    console.error("Squad account lookup error:", error.message);
    return res.status(500).json({ success: false, message: "Could not load your transfer account." });
  }
}

function bankNameForCode(code) {
  const banks = {
    "011": "First Bank of Nigeria", "033": "United Bank for Africa", "044": "Access Bank",
    "050": "Ecobank Nigeria", "058": "Guaranty Trust Bank", "070": "Fidelity Bank",
    "214": "First City Monument Bank", "221": "Stanbic IBTC Bank", "232": "Sterling Bank",
    "035": "Wema Bank", "057": "Zenith Bank", "082": "Keystone Bank", "566": "VFD Microfinance Bank",
  };
  return banks[String(code || "")] || "Squad Virtual Account";
}

async function createSquadAccount(req, res) {
  const { mode, baseUrl, secret } = squadConfig();
  if (!secret) return res.status(503).json({ success: false, message: "Squad is not configured on the server." });
  const bvn = String(req.body.bvn || "").replace(/\D/g, "");
  const dob = String(req.body.dob || "");
  const gender = String(req.body.gender || "");
  const address = String(req.body.address || req.user.address || "").trim().slice(0, 250);
  if (req.body.bvnConsent !== true) return res.status(400).json({ success: false, message: "Confirm that Squad may use your BVN to create your personal transfer account." });
  if (!/^\d{11}$/.test(bvn)) return res.status(400).json({ success: false, message: "Enter a valid 11-digit BVN." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(dob))) return res.status(400).json({ success: false, message: "Enter your date of birth." });
  if (!["1", "2"].includes(gender)) return res.status(400).json({ success: false, message: "Select your gender." });
  if (address.length < 5) return res.status(400).json({ success: false, message: "Enter your residential address." });

  const nameParts = String(req.user.name || "").trim().split(/\s+/);
  if (nameParts.length < 2 || !req.user.phone) return res.status(400).json({ success: false, message: "Add your full name and phone number to your profile first." });
  const customerIdentifier = `MAMU${String(req.user._id).replace(/\W/g, "").toUpperCase()}`;

  try {
    let user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User account was not found." });
    if (user.squadVirtualAccount?.virtualAccountNumber) {
      return res.json({ success: true, account: accountPayload(user), alreadyCreated: true });
    }

    const [year, month, day] = dob.split("-");
    const formattedDob = `${month}/${day}/${year}`;
    const payload = {
      first_name: nameParts[0],
      last_name: nameParts.slice(1).join(" "),
      mobile_num: String(req.user.phone).replace(/\D/g, "").slice(-11),
      dob: formattedDob,
      email: req.user.email || "",
      bvn,
      gender,
      address,
      customer_identifier: customerIdentifier,
    };

    // If a previous request timed out after Squad created the account, recover it by identifier.
    let responseData = null;
    try {
      const existing = await axios.get(`${baseUrl}/virtual-account/${encodeURIComponent(customerIdentifier)}`, {
        headers: { Authorization: `Bearer ${secret}` }, timeout: 12000,
      });
      if (existing.data?.success && existing.data?.data?.virtual_account_number) responseData = existing.data.data;
    } catch (_) {}
    if (!responseData) {
      const response = await axios.post(`${baseUrl}/virtual-account`, payload, {
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, timeout: 20000,
      });
      if (!response.data?.success || !response.data?.data?.virtual_account_number) {
        return res.status(502).json({ success: false, message: response.data?.message || "Squad could not create your transfer account. Check your details and try again." });
      }
      responseData = response.data.data;
    }

    const account = {
      virtualAccountNumber: String(responseData.virtual_account_number),
      bankCode: String(responseData.bank_code || ""),
      bankName: responseData.bank_name || responseData.bankName || bankNameForCode(responseData.bank_code),
      accountName: [responseData.first_name, responseData.last_name].filter(Boolean).join(" ") || user.name,
      customerIdentifier: responseData.customer_identifier || customerIdentifier,
      createdAt: responseData.created_at ? new Date(responseData.created_at) : new Date(),
    };
    user.squadVirtualAccount = account;
    await user.save();
    return res.status(201).json({ success: true, account: accountPayload(user), mode });
  } catch (error) {
    // Never log or return the submitted BVN.
    console.error("Squad virtual account creation error:", error.response?.data?.message || error.message);
    const providerMessage = String(error.response?.data?.message || "");
    const status = error.response?.status;
    let safeMessage = "Squad could not create your transfer account. Check that your name, phone, date of birth, gender and BVN match.";
    if (status === 401 || status === 403) {
      safeMessage = "Squad rejected the server credentials. Check that SQUAD_MODE and SQUAD_SECRET_KEY belong to the same environment (sandbox or live).";
    } else if (status >= 500 || !status) {
      safeMessage = "Squad is temporarily unavailable. Please try again later.";
    } else if (/bvn|date of birth|gender|validation|profile|account/i.test(providerMessage)) {
      safeMessage = "Squad rejected the identity details. Check that your full name, BVN, date of birth, gender and phone number match your BVN records, and that Virtual Accounts are enabled for this Squad account.";
    }
    return res.status(502).json({ success: false, message: safeMessage });
  }
}

function safeSignatureMatch(expected, received) {
  if (!expected || !received) return false;
  const left = Buffer.from(String(expected).toLowerCase());
  const right = Buffer.from(String(received).toLowerCase());
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isValidSquadSignature(req, secret) {
  const signature = req.get("x-squad-signature") || req.get("x-squad-encrypted-body");
  if (!signature) return false;
  const bodies = [req.rawBody || Buffer.from(JSON.stringify(req.body || {}))];
  if (req.body && typeof req.body === "object") bodies.push(Buffer.from(JSON.stringify(req.body)));
  for (const payload of [req.body?.Body || req.body?.data || req.body || {}]) {
    const fields = [payload.transaction_reference || payload.transaction_ref, payload.virtual_account_number, payload.currency, payload.principal_amount, payload.settled_amount, payload.customer_identifier];
    if (fields.every((value) => value !== undefined && value !== null)) bodies.push(Buffer.from(fields.join("|")));
  }
  return bodies.some((body) => safeSignatureMatch(crypto.createHmac("sha512", secret).update(body).digest("hex"), signature));
}

async function processVirtualAccountCredit(payload) {
  const reference = String(payload.transaction_reference || payload.transaction_ref || "");
  const accountNumber = String(payload.virtual_account_number || "");
  const customerIdentifier = String(payload.customer_identifier || "");
  const amount = Number(payload.principal_amount);
  const indicator = String(payload.transaction_indicator || "").toUpperCase();
  if (!reference || !accountNumber || !Number.isFinite(amount) || amount <= 0 || indicator !== "C" || String(payload.currency || "NGN").toUpperCase() !== "NGN") {
    throw new Error("Invalid Squad virtual account credit notification.");
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const duplicate = await Transaction.findOne({ reference }).session(session);
      if (duplicate) { result = { duplicate: true }; return; }
      const user = await User.findOne({
        $or: [
          { "squadVirtualAccount.virtualAccountNumber": accountNumber },
          ...(customerIdentifier ? [{ "squadVirtualAccount.customerIdentifier": customerIdentifier }] : []),
        ],
      }).session(session);
      if (!user) throw new Error("Squad transfer account is not linked to a user.");
      user.walletBalance += amount;
      await user.save({ session });
      await Transaction.create([{
        user: user._id,
        type: "wallet_funding",
        amount,
        status: "successful",
        reference,
        description: "Wallet funded by Squad bank transfer",
        metadata: {
          fundingMethod: "squad_virtual_account",
          squadMode: squadConfig().mode,
          virtualAccountNumber: accountNumber,
          customerIdentifier,
          settledAmount: Number(payload.settled_amount || amount),
          feeCharged: Number(payload.fee_charged || 0),
          paidAt: payload.transaction_date ? new Date(payload.transaction_date) : new Date(),
        },
      }], { session });
      result = { duplicate: false, amount, walletBalance: user.walletBalance };
    });
    return result;
  } finally { await session.endSession(); }
}

async function squadWebhook(req, res) {
  const { secret } = squadConfig();
  if (!secret) return res.status(503).json({ success: false });
  if (!isValidSquadSignature(req, secret)) return res.status(401).json({ success: false, message: "Invalid Squad signature." });
  const body = req.body?.Body || req.body?.data || req.body || {};
  if (!body.virtual_account_number) return res.status(200).json({ success: true, ignored: true });
  try {
    const result = await processVirtualAccountCredit(body);
    return res.status(200).json({ success: true, duplicate: Boolean(result.duplicate) });
  } catch (error) {
    if (error.code === 11000) return res.status(200).json({ success: true, duplicate: true });
    console.error("Squad virtual account webhook error:", error.message);
    return res.status(500).json({ success: false });
  }
}

module.exports = { getSquadAccount, createSquadAccount, squadWebhook };
