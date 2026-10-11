const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");

const User = require("../models/User");
const Transaction = require("../models/Transaction");

const initializePayment = async (req, res) => {
  let transaction;
  try {
    const { amount } = req.body;
    const numericAmount = Number(amount);

    if (!req.user.email) {
      return res.status(400).json({
        success: false,
        message: "Please add your email before funding your wallet",
      });
    }

    if (!Number.isFinite(numericAmount) || numericAmount < 100) {
      return res.status(400).json({
        success: false,
        message: "Minimum funding amount is 100",
      });
    }

    const finalAmount = Math.round(numericAmount * 100);
    const amountInNaira = finalAmount / 100;
    const reference = `mamu-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
    transaction = new Transaction({
      user: req.user._id,
      type: "wallet_funding",
      amount: amountInNaira,
      status: "pending",
      reference,
      description: "Wallet funding via Paystack",
      metadata: {
        paystackReference: reference,
        paymentFlow: "hosted_checkout",
      },
    });
    await transaction.save();

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: req.user.email,
        amount: finalAmount,
        currency: "NGN",
        reference,
        callback_url: (() => {
          const forwardedProto = req.get("x-forwarded-proto");
          const forwardedHost = req.get("x-forwarded-host");
          const protocol = (forwardedProto || req.protocol).split(",")[0].trim();
          const host = (forwardedHost || req.get("host")).split(",")[0].trim();
          const appUrl = process.env.APP_URL || `${protocol}://${host}`;
          return `${appUrl}/?payment=callback`;
        })(),
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const paymentData = response.data?.data;
    if (!paymentData?.authorization_url || paymentData.reference !== reference) {
      transaction.status = "failed";
      transaction.metadata = {
        ...transaction.metadata,
        initializationError: "Paystack did not return a valid checkout URL",
      };
      await transaction.save();
      return res.status(502).json({
        success: false,
        message: "Paystack did not return a valid checkout URL. Please try again.",
      });
    }

    transaction.metadata = {
      ...transaction.metadata,
      authorizationUrl: paymentData.authorization_url,
    };
    await transaction.save();

    return res.status(200).json({
      success: true,
      message: "Paystack Pay with Bank is ready",
      reference,
      authorizationUrl: paymentData.authorization_url,
      transactionId: transaction._id,
      transactionStatus: transaction.status,
    });
  } catch (error) {
    console.error(
      "Payment initialization error:",
      error.response?.data || error.message
    );

    if (transaction && transaction.status === "pending") {
      transaction.metadata = {
        ...transaction.metadata,
        initializationError: "Paystack checkout initialization failed",
      };
      await transaction.save().catch(() => {});
    }
    return res.status(502).json({
      success: false,
      message: error.response?.data?.message || "Unable to start Paystack checkout. Please try again.",
    });
  }
};

const initializeBankTransfer = async (req, res) => {
  let transaction;
  try {
    const numericAmount = Number(req.body.amount);
    if (!req.user.email) {
      return res.status(400).json({ success: false, message: "Please add your email before funding your wallet." });
    }
    if (!Number.isFinite(numericAmount) || numericAmount < 100) {
      return res.status(400).json({ success: false, message: "Minimum funding amount is ₦100." });
    }

    const amountInKobo = Math.round(numericAmount * 100);
    const amountInNaira = amountInKobo / 100;
    const reference = `mamu-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
    const requestedExpiry = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    transaction = new Transaction({
      user: req.user._id,
      type: "wallet_funding",
      amount: amountInNaira,
      status: "pending",
      reference,
      description: "Wallet funding via Paystack bank transfer",
      metadata: {
        paystackReference: reference,
        paymentFlow: "bank_transfer_charge",
        requestedAccountExpiresAt: requestedExpiry,
      },
    });
    await transaction.save();

    const response = await axios.post(
      "https://api.paystack.co/charge",
      {
        email: req.user.email,
        amount: amountInKobo,
        currency: "NGN",
        reference,
        bank_transfer: { account_expires_at: requestedExpiry },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const payment = response.data?.data;
    const accountNumber = payment?.account_number;
    const bankName = payment?.bank?.name || payment?.bank_name;
    const accountName = payment?.account_name || "";
    const accountExpiresAt = payment?.account_expires_at || null;
    if (
      !payment ||
      payment.reference !== reference ||
      payment.status !== "pending_bank_transfer" ||
      !accountNumber ||
      !bankName ||
      (accountExpiresAt && !Number.isFinite(Date.parse(accountExpiresAt)))
    ) {
      transaction.status = "failed";
      transaction.metadata = {
        ...transaction.metadata,
        initializationError: "Paystack did not return a valid bank transfer account",
      };
      await transaction.save();
      return res.status(502).json({
        success: false,
        message: "Paystack did not return valid transfer account details. Please try again later.",
      });
    }

    transaction.metadata = {
      ...transaction.metadata,
      accountNumber: String(accountNumber),
      accountName,
      bankName,
      accountExpiresAt,
    };
    await transaction.save();

    return res.status(200).json({
      success: true,
      reference,
      transfer: {
        bankName,
        accountName,
        accountNumber: String(accountNumber),
        amount: amountInNaira,
        accountExpiresAt,
      },
      paymentStatus: payment.status,
    });
  } catch (error) {
    console.error("Paystack bank transfer initialization error:", error.response?.data || error.message);
    if (transaction && transaction.status === "pending") {
      transaction.metadata = {
        ...transaction.metadata,
        initializationError: "Paystack bank transfer initialization failed",
      };
      await transaction.save().catch(() => {});
    }
    return res.status(502).json({
      success: false,
      message: error.response?.data?.message || "Unable to generate a Paystack transfer account. Please try again.",
    });
  }
};

const fetchPaystackPayment = async (transaction) => {
  const isBankTransfer = transaction.metadata?.paymentFlow === "bank_transfer_charge";
  const endpoint = isBankTransfer
    ? `https://api.paystack.co/charge/${encodeURIComponent(transaction.reference)}`
    : `https://api.paystack.co/transaction/verify/${encodeURIComponent(transaction.reference)}`;
  const response = await axios.get(endpoint, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  });
  const payment = response.data?.data;
  if (!payment || payment.reference !== transaction.reference) {
    throw new Error("Paystack verification returned an invalid reference");
  }
  return payment;
};


const processSuccessfulPayment = async (payment) => {
  if (!payment || payment.status !== "success" || !payment.reference || !Number.isFinite(Number(payment.amount))) {
    throw new Error("Paystack payment is not verified as successful");
  }

  const session = await mongoose.startSession();

  try {
    let result = null;

    await session.withTransaction(async () => {
      const transaction = await Transaction.findOne({
        reference: payment.reference,
      }).session(session);

      if (!transaction) {
        throw new Error("Payment transaction not found");
      }

      const paymentFlow = transaction.metadata?.paymentFlow;
      if (
        (paymentFlow === "bank_transfer_charge" && payment.channel !== "bank_transfer") ||
        (paymentFlow === "bank_transfer_charge" && payment.currency !== "NGN")
      ) {
        throw new Error("Paystack payment channel does not match the pending transaction");
      }

      // Prevent double wallet credit
      if (transaction.status === "successful") {
        result = {
          alreadyProcessed: true,
          transaction,
        };
        return;
      }

      const verifiedAmount = payment.amount / 100;

      if (verifiedAmount !== transaction.amount) {
        transaction.status = "failed";
        transaction.metadata = {
          ...transaction.metadata,
          webhookError: "Amount mismatch",
          verifiedAmount,
        };

        await transaction.save({ session });

        result = {
          alreadyProcessed: false,
          amountMismatch: true,
          transaction,
        };

        return;
      }

      const user = await User.findById(transaction.user).session(session);

      if (!user) {
        throw new Error("User not found");
      }

      user.walletBalance += verifiedAmount;

      await user.save({ session });

      transaction.status = "successful";

      transaction.metadata = {
        ...transaction.metadata,
        paystackReference: payment.reference,
        channel: payment.channel,
        paidAt: payment.paid_at,
        verifiedAt: new Date(),
      };

      await transaction.save({ session });

      result = {
        alreadyProcessed: false,
        amountMismatch: false,
        amount: verifiedAmount,
        walletBalance: user.walletBalance,
        transaction,
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
};


const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Payment reference is required",
      });
    }

    const transaction = await Transaction.findOne({
      reference,
      user: req.user._id,
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Payment transaction not found",
      });
    }

    const payment = await fetchPaystackPayment(transaction);

    if (payment.status !== "success") {
  const failedStatuses = [
    "failed",
    "abandoned",
    "reversed",
  ];

  if (
    failedStatuses.includes(payment.status) &&
    transaction.status === "pending"
  ) {
    transaction.status = "failed";

    transaction.metadata = {
      ...transaction.metadata,
      paystackStatus: payment.status,
    };

    await transaction.save();
  }

  if (failedStatuses.includes(payment.status)) {
    return res.status(400).json({
      success: false,
      message: "Payment failed",
      paymentStatus: payment.status,
    });
  }

  return res.status(200).json({
    success: true,
    pending: true,
    message: "Payment is still being processed",
    paymentStatus: payment.status,
  });
}

    const result = await processSuccessfulPayment(payment);

    if (result.alreadyProcessed) {
      const user = await User.findById(req.user._id);

      return res.json({
        success: true,
        message: "Payment has already been processed",
        amount: transaction.amount,
        walletBalance: user ? user.walletBalance : null,
        transaction: result.transaction,
      });
    }

    if (result.amountMismatch) {
      return res.status(400).json({
        success: false,
        message: "Payment amount does not match transaction amount",
      });
    }

    return res.json({
      success: true,
      message: "Payment verified and wallet funded successfully",
      amount: result.amount,
      walletBalance: result.walletBalance,
      transaction: result.transaction,
    });
  } catch (error) {
    console.error(
      "Payment verification error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to verify payment",
    });
  }
};


const paystackWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];

    if (!signature) {
      return res.status(401).send("Missing signature");
    }

    const rawBody = req.rawBody;

    if (!rawBody) {
      return res.status(400).send("Raw request body unavailable");
    }

    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(rawBody)
      .digest("hex");

const signatureBuffer = Buffer.from(signature);
const hashBuffer = Buffer.from(hash);

if (
  signatureBuffer.length !== hashBuffer.length ||
  !crypto.timingSafeEqual(hashBuffer, signatureBuffer)
) {
  return res.status(401).send("Invalid signature");
}

    const event = req.body;

    console.log("Paystack webhook event:", event.event);

    if (["charge.success", "charge.failed", "bank.transfer.rejected"].includes(event.event)) {
      const reference = event.data?.reference;
      const transaction = reference
        ? await Transaction.findOne({ reference })
        : null;

      if (!transaction) return res.sendStatus(200);

      // Treat the webhook as a notification only; fetch the canonical status from Paystack.
      const payment = await fetchPaystackPayment(transaction);
      if (payment.status === "success") {
        await processSuccessfulPayment(payment);
      } else if (
        ["charge.failed", "bank.transfer.rejected"].includes(event.event) &&
        transaction.status === "pending"
      ) {
        transaction.status = "failed";
        transaction.metadata = {
          ...transaction.metadata,
          paystackStatus: payment.status,
          webhookFailedAt: new Date(),
        };
        await transaction.save();
      }
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Paystack webhook error:", error.message);
    return res.sendStatus(500);
  }
};


module.exports = {
  initializePayment,
  initializeBankTransfer,
  verifyPayment,
  paystackWebhook,
};
