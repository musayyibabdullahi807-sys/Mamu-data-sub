const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");

const User = require("../models/User");
const Transaction = require("../models/Transaction");

const initializePayment = async (req, res) => {
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

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: req.user.email,
        amount: finalAmount,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const paymentData = response.data.data;

    if (!paymentData || !paymentData.reference) {
      return res.status(500).json({
        success: false,
        message: "Paystack did not return a valid payment reference",
      });
    }

    const transaction = new Transaction({
      user: req.user._id,
      type: "wallet_funding",
      amount: numericAmount,
      status: "pending",
      reference: paymentData.reference,
      description: "Wallet funding via Paystack",
      metadata: {
        paystackReference: paymentData.reference,
        authorizationUrl: paymentData.authorization_url,
      },
    });

    await transaction.save();

    return res.status(200).json({
      success: true,
      message: "Payment initialized successfully",
      authorizationUrl: paymentData.authorization_url,
      reference: paymentData.reference,
      transactionId: transaction._id,
      transactionStatus: transaction.status,
    });
  } catch (error) {
    console.error(
      "Payment initialization error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to initialize payment",
    });
  }
};


const processSuccessfulPayment = async (payment) => {
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

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const payment = response.data.data;

    const transaction = await Transaction.findOne({
      reference: payment.reference,
      user: req.user._id,
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Payment transaction not found",
      });
    }

    if (payment.status !== "success") {
      if (transaction.status === "pending") {
        transaction.status = "failed";

        transaction.metadata = {
          ...transaction.metadata,
          paystackStatus: payment.status,
        };

        await transaction.save();
      }

      return res.status(400).json({
        success: false,
        message: "Payment was not successful",
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

    if (event.event === "charge.success") {
      const payment = event.data;

      const transaction = await Transaction.findOne({
        reference: payment.reference,
      });

      if (!transaction) {
        console.log(
          "Webhook transaction not found:",
          payment.reference
        );

        return res.sendStatus(200);
      }

      if (transaction.status === "successful") {
        return res.sendStatus(200);
      }

      await processSuccessfulPayment(payment);

      console.log(
        "Webhook payment processed:",
        payment.reference
      );
    }

    if (event.event === "charge.failed") {
      const payment = event.data;

      const transaction = await Transaction.findOne({
        reference: payment.reference,
      });

      if (transaction && transaction.status === "pending") {
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
  verifyPayment,
  paystackWebhook,
};
