const User = require("../models/User");
const Transaction = require("../models/Transaction");
const crypto = require("crypto");

const generateReference = () => {
  return `MDS-FUND-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
};

const getWallet = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "walletBalance"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      walletBalance: user.walletBalance,
    });
  } catch (error) {
    console.error("Get wallet error:", error.message);

    res.status(500).json({
      success: false,
      message: "Server error while getting wallet",
    });
  }
};

const getTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({
      user: req.user._id,
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      transactions,
    });
  } catch (error) {
    console.error("Get transactions error:", error.message);

    res.status(500).json({
      success: false,
      message: "Server error while getting transactions",
    });
  }
};

// Atomically deduct wallet balance
const deductWallet = async (userId, amount) => {
  const user = await User.findOneAndUpdate(
    {
      _id: userId,
      walletBalance: { $gte: amount },
    },
    {
      $inc: { walletBalance: -amount },
    },
    {
      new: true,
    }
  );

  return user;
};

// TEST ONLY — Add money to wallet
const testFundWallet = async (req, res) => {
  try {
    const { amount } = req.body;

    const fundingAmount = Number(amount);

    if (!Number.isFinite(fundingAmount) || fundingAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid funding amount",
      });
    }

    if (fundingAmount > 100000) {
      return res.status(400).json({
        success: false,
        message: "Test funding amount cannot exceed ₦100,000",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $inc: {
          walletBalance: fundingAmount,
        },
      },
      {
        new: true,
      }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const reference = generateReference();

    const transaction = await Transaction.create({
      user: user._id,
      type: "wallet_funding",
      amount: fundingAmount,
      status: "successful",
      reference,
      description: "TEST wallet funding",
      metadata: {
        testFunding: true,
      },
    });

    res.status(201).json({
      success: true,
      message: "TEST wallet funded successfully",
      amount: fundingAmount,
      walletBalance: user.walletBalance,
      transaction: {
        id: transaction._id,
        reference: transaction.reference,
        status: transaction.status,
      },
    });
  } catch (error) {
    console.error("Test fund wallet error:", error.message);

    res.status(500).json({
      success: false,
      message: "Server error while funding wallet",
    });
  }
};

module.exports = {
  getWallet,
  getTransactions,
  deductWallet,
  testFundWallet,
};
