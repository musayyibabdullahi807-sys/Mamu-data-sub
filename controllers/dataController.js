const bcrypt = require("bcryptjs");
const DataPlan = require("../models/DataPlan");
const User = require("../models/User");
const Order = require("../models/Order");
const Transaction = require("../models/Transaction");
const ReferralCommission = require("../models/ReferralCommission");
const { buyData } = require("../services/gsubzService");
const crypto = require("crypto");

const generateReference = () => {
  return `MDS-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
};

// Get active data plans
const getDataPlans = async (req, res) => {
  try {
    const { network } = req.query;

    const filter = {
      isActive: true,
    };

    if (network) {
      filter.networkName = network.toUpperCase();
    }

    const plans = await DataPlan.find(filter)
      .sort({
        network: 1,
        providerPrice: 1,
      })
      .select(
        "providerPlanId network networkName planType plan validity providerPrice sellingPrice profit isActive"
      );

    res.json({
      success: true,
      count: plans.length,
      plans,
    });
  } catch (error) {
    console.error("Get data plans error:", error.message);

    res.status(500).json({
      success: false,
      message: "Server error while getting data plans",
    });
  }
};

// Update selling price
const updateDataPlanPrice = async (req, res) => {
  try {
    const { planId } = req.params;
    const { sellingPrice } = req.body;

    if (sellingPrice === undefined) {
      return res.status(400).json({
        success: false,
        message: "Selling price is required",
      });
    }

    const price = Number(sellingPrice);

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid selling price",
      });
    }

    const plan = await DataPlan.findById(planId);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Data plan not found",
      });
    }

    if (price < plan.providerPrice) {
      return res.status(400).json({
        success: false,
        message: "Selling price cannot be lower than provider price",
        providerPrice: plan.providerPrice,
      });
    }

    plan.sellingPrice = price;
    plan.profit = price - plan.providerPrice;

    await plan.save();

    res.json({
      success: true,
      message: "Data plan price updated successfully",
      plan,
    });
  } catch (error) {
    console.error("Update data plan price error:", error.message);

    res.status(500).json({
      success: false,
      message: "Server error while updating data plan price",
    });
  }
};

// Refund wallet
const refundWallet = async (userId, amount) => {
  return User.findByIdAndUpdate(
    userId,
    {
      $inc: {
        walletBalance: amount,
      },
    },
    {
      new: true,
    }
  );
};

// Add referral commission after successful transaction
const addReferralCommission = async ({
  buyer,
  transaction,
  order,
  profit,
}) => {
  try {
    if (!buyer.referredBy) {
      return null;
    }

    if (String(buyer.referredBy) === String(buyer._id)) {
      return null;
    }

    const validProfit = Number(profit);

    if (!Number.isFinite(validProfit) || validProfit <= 0) {
      return null;
    }

    const commissionRate = 20;

    const commissionAmount = Number(
      ((validProfit * commissionRate) / 100).toFixed(2)
    );

    if (commissionAmount <= 0) {
      return null;
    }

    const reference = `REF-${Date.now()}-${crypto
      .randomBytes(4)
      .toString("hex")}`;

    let commission;

    try {
      commission = await ReferralCommission.create({
        referrer: buyer.referredBy,
        referredUser: buyer._id,
        transaction: transaction._id,
        order: order?._id || null,
        profit: validProfit,
        commissionRate,
        commissionAmount,
        status: "successful",
        reference,
      });
    } catch (error) {
      if (error.code === 11000) {
        console.log(
          "Referral commission already exists for transaction:",
          transaction._id.toString()
        );

        return null;
      }

      throw error;
    }

    await User.findByIdAndUpdate(
      buyer.referredBy,
      {
        $inc: {
          referralEarnings: commissionAmount,
        },
      },
      {
        new: true,
      }
    );

    console.log("Referral commission added:", {
      referrer: String(buyer.referredBy),
      referredUser: String(buyer._id),
      transaction: String(transaction._id),
      profit: validProfit,
      commissionRate,
      commissionAmount,
    });

    return commission;
  } catch (error) {
    console.error(
      "Referral commission error:",
      error.message
    );

    return null;
  }
};

// Purchase data
const purchaseData = async (req, res) => {
  let order = null;
  let transaction = null;
  let walletDeducted = false;

  try {
    const { planId, phone, pin } = req.body;

    // Basic validation
    if (!planId || !phone || !pin) {
      return res.status(400).json({
        success: false,
        message:
          "Plan ID, phone number, and transaction PIN are required",
      });
    }

    // Transaction PIN must be exactly 4 digits
    const cleanPin = String(pin).trim();

    if (!/^\d{4}$/.test(cleanPin)) {
      return res.status(400).json({
        success: false,
        message: "Transaction PIN must contain exactly 4 digits",
      });
    }

    const cleanPhone = String(phone).trim();

    if (!/^\d{10,15}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number",
      });
    }

    // Find active user
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.accountStatus !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account is not active",
      });
    }

    // Transaction PIN must already exist
    if (!user.transactionPinHash) {
      return res.status(400).json({
        success: false,
        message:
          "Transaction PIN has not been created. Please create one in Security settings.",
      });
    }

    // Verify Transaction PIN BEFORE wallet deduction
    const pinMatches = await bcrypt.compare(
      cleanPin,
      user.transactionPinHash
    );

    if (!pinMatches) {
      return res.status(401).json({
        success: false,
        message: "Incorrect transaction PIN",
      });
    }

    // Find data plan
    const plan = await DataPlan.findById(planId);

    if (!plan || !plan.isActive) {
      return res.status(404).json({
        success: false,
        message: "Data plan not found or inactive",
      });
    }

    if (
      !Number.isFinite(plan.sellingPrice) ||
      plan.sellingPrice <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "This data plan does not have a valid selling price",
      });
    }

    if (!plan.planType) {
      return res.status(400).json({
        success: false,
        message:
          "This data plan has no provider service type",
      });
    }

    // Check wallet balance before creating transaction
    if (user.walletBalance < plan.sellingPrice) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
        walletBalance: user.walletBalance,
        requiredAmount: plan.sellingPrice,
      });
    }

    const reference = generateReference();

    // Create order
    order = await Order.create({
      user: user._id,
      serviceType: "data",
      network: plan.networkName,
      phone: cleanPhone,
      plan: plan.providerPlanId,
      amount: plan.sellingPrice,
      reference,
      status: "pending",
    });

    // Create transaction
    transaction = await Transaction.create({
      user: user._id,
      type: "data_purchase",
      amount: plan.sellingPrice,
      status: "pending",
      reference,
      description: `Data purchase - ${plan.networkName} ${plan.plan}`,
      metadata: {
        orderId: order._id,
        planId: plan._id,
        providerPlanId: plan.providerPlanId,
        serviceID: plan.planType,
        phone: cleanPhone,
      },
    });

    // Atomically deduct wallet
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        accountStatus: "active",
        walletBalance: {
          $gte: plan.sellingPrice,
        },
      },
      {
        $inc: {
          walletBalance: -plan.sellingPrice,
        },
      },
      {
        new: true,
      }
    );

    if (!updatedUser) {
      await Order.findByIdAndUpdate(order._id, {
        status: "failed",
      });

      await Transaction.findByIdAndUpdate(transaction._id, {
        status: "failed",
      });

      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
      });
    }

    walletDeducted = true;

    // Send purchase request to GSUBZ
    let providerResponse;

    try {
      providerResponse = await buyData({
        serviceID: plan.planType,
        plan: plan.providerPlanId,
        phone: cleanPhone,
        requestID: reference,
      });
    } catch (providerError) {
      console.error(
        "GSUBZ request error:",
        providerError.response?.data ||
          providerError.message
      );

      await Order.findByIdAndUpdate(order._id, {
        status: "pending",
        providerResponse: {
          error:
            providerError.response?.data ||
            providerError.message,
        },
      });

      await Transaction.findByIdAndUpdate(transaction._id, {
        status: "pending",
        metadata: {
          orderId: order._id,
          planId: plan._id,
          providerPlanId: plan.providerPlanId,
          serviceID: plan.planType,
          phone: cleanPhone,
          providerError:
            providerError.response?.data ||
            providerError.message,
        },
      });

      return res.status(202).json({
        success: true,
        message:
          "Transaction is pending because the provider response could not be confirmed",
        reference,
        status: "pending",
        walletBalance: updatedUser.walletBalance,
      });
    }

    // Normalize GSUBZ response
    const providerStatus = String(
      providerResponse?.status ||
        providerResponse?.content?.status ||
        ""
    ).toUpperCase();

    const providerCode = Number(
      providerResponse?.code ||
        providerResponse?.content?.code ||
        0
    );

    const providerTransactionID =
      providerResponse?.content?.transactionID ||
      providerResponse?.transactionID ||
      null;

    console.log("GSUBZ response:", {
      code: providerCode,
      status: providerStatus,
      transactionID: providerTransactionID,
    });

    // Successful provider transaction
    if (
      providerStatus === "TRANSACTION_SUCCESSFUL" ||
      providerStatus === "SUCCESSFUL"
    ) {
      await Order.findByIdAndUpdate(order._id, {
        status: "successful",
        providerReference:
          providerTransactionID !== null
            ? String(providerTransactionID)
            : undefined,
        providerResponse,
      });

      await Transaction.findByIdAndUpdate(transaction._id, {
        status: "successful",
        metadata: {
          orderId: order._id,
          planId: plan._id,
          providerPlanId: plan.providerPlanId,
          serviceID: plan.planType,
          phone: cleanPhone,
          providerTransactionID,
          providerStatus,
          providerCode,
        },
      });

      await addReferralCommission({
        buyer: user,
        transaction,
        order,
        profit: plan.profit,
      });

      const finalUser = await User.findById(user._id).select(
        "walletBalance"
      );

      return res.status(200).json({
        success: true,
        message: "Data purchase successful",
        reference,
        status: "successful",
        providerReference:
          providerTransactionID !== null
            ? String(providerTransactionID)
            : null,
        walletBalance:
          finalUser?.walletBalance ?? 0,
      });
    }

    // Explicit provider failure
    const failedStatuses = [
      "TRANSACTION_FAILED",
      "TRANSACTION_FAIL",
      "FAILED",
      "DECLINED",
      "TRANSACTION_DECLINED",
    ];

    if (
      failedStatuses.includes(providerStatus) ||
      providerCode >= 400
    ) {
      const refundedUser = await refundWallet(
        user._id,
        plan.sellingPrice
      );

      await Order.findByIdAndUpdate(order._id, {
        status: "failed",
        providerReference:
          providerTransactionID !== null
            ? String(providerTransactionID)
            : undefined,
        providerResponse,
      });

      await Transaction.findByIdAndUpdate(transaction._id, {
        status: "failed",
        metadata: {
          orderId: order._id,
          planId: plan._id,
          providerPlanId: plan.providerPlanId,
          serviceID: plan.planType,
          phone: cleanPhone,
          providerTransactionID,
          providerStatus,
          providerCode,
        },
      });

      return res.status(400).json({
        success: false,
        message: "Data purchase failed",
        reference,
        status: "failed",
        refunded: true,
        walletBalance:
          refundedUser?.walletBalance ?? 0,
      });
    }

    // Unknown provider response
    await Order.findByIdAndUpdate(order._id, {
      status: "pending",
      providerReference:
        providerTransactionID !== null
          ? String(providerTransactionID)
          : undefined,
      providerResponse,
    });

    await Transaction.findByIdAndUpdate(transaction._id, {
      status: "pending",
      metadata: {
        orderId: order._id,
        planId: plan._id,
        providerPlanId: plan.providerPlanId,
        serviceID: plan.planType,
        phone: cleanPhone,
        providerTransactionID,
        providerStatus,
        providerCode,
      },
    });

    return res.status(202).json({
      success: true,
      message:
        "Data purchase is pending provider confirmation",
      reference,
      status: "pending",
      providerReference:
        providerTransactionID !== null
          ? String(providerTransactionID)
          : null,
      walletBalance: updatedUser.walletBalance,
    });
  } catch (error) {
    console.error(
      "Purchase data error:",
      error.message
    );

    if (walletDeducted && order && transaction) {
      try {
        await refundWallet(
          req.user._id,
          order.amount
        );

        await Order.findByIdAndUpdate(order._id, {
          status: "failed",
        });

        await Transaction.findByIdAndUpdate(
          transaction._id,
          {
            status: "failed",
          }
        );
      } catch (refundError) {
        console.error(
          "Refund error:",
          refundError.message
        );
      }
    }

    return res.status(500).json({
      success: false,
      message:
        "Server error while processing data purchase",
    });
  }
};

module.exports = {
  getDataPlans,
  updateDataPlanPrice,
  purchaseData,
};
