const User = require("../models/User");
const Order = require("../models/Order");
const Transaction = require("../models/Transaction");
const { buyAirtime } = require("../services/gsubzService");
const crypto = require("crypto");

const generateReference = () => {
  return `MDS-AIR-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
};

// Buy airtime
const purchaseAirtime = async (req, res) => {
  let order = null;
  let transaction = null;
  let walletDeducted = false;

  try {
    const { serviceID, amount, phone } = req.body;

    if (!serviceID || amount === undefined || !phone) {
      return res.status(400).json({
        success: false,
        message: "Service ID, amount and phone number are required",
      });
    }

    const allowedServices = [
      "mtn",
      "airtel",
      "glo",
      "etisalat",
      "9mobile",
    ];

    const service = String(serviceID).toLowerCase().trim();

    if (!allowedServices.includes(service)) {
      return res.status(400).json({
        success: false,
        message: "Unsupported airtime network",
      });
    }

    const airtimeAmount = Number(amount);

    if (
      !Number.isFinite(airtimeAmount) ||
      airtimeAmount < 100 ||
      airtimeAmount > 50000
    ) {
      return res.status(400).json({
        success: false,
        message: "Airtime amount must be between ₦100 and ₦50,000",
      });
    }

    const cleanPhone = String(phone).trim();

    if (!/^\d{10,15}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number",
      });
    }

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

    if (user.walletBalance < airtimeAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
        walletBalance: user.walletBalance,
        requiredAmount: airtimeAmount,
      });
    }

    const reference = generateReference();

    // Create order
    order = await Order.create({
      user: user._id,
      serviceType: "airtime",
      network: service.toUpperCase(),
      phone: cleanPhone,
      amount: airtimeAmount,
      reference,
      status: "pending",
    });

    // Create transaction
    transaction = await Transaction.create({
      user: user._id,
      type: "airtime_purchase",
      amount: airtimeAmount,
      status: "pending",
      reference,
      description: `Airtime purchase - ${service.toUpperCase()}`,
      metadata: {
        orderId: order._id,
        serviceID: service,
        phone: cleanPhone,
      },
    });

    // Atomically deduct wallet
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        accountStatus: "active",
        walletBalance: {
          $gte: airtimeAmount,
        },
      },
      {
        $inc: {
          walletBalance: -airtimeAmount,
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

    // Send request to GSUBZ
    let providerResponse;

    try {
      providerResponse = await buyAirtime({
        serviceID: service,
        amount: airtimeAmount,
        phone: cleanPhone,
        requestID: reference,
      });
    } catch (providerError) {
      console.error(
        "GSUBZ airtime request error:",
        providerError.response?.data || providerError.message
      );

      await Order.findByIdAndUpdate(order._id, {
        status: "pending",
        providerResponse: {
          error:
            providerError.response?.data || providerError.message,
        },
      });

      await Transaction.findByIdAndUpdate(transaction._id, {
        status: "pending",
      });

      return res.status(202).json({
        success: true,
        message:
          "Airtime transaction is pending because the provider response could not be confirmed",
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

    console.log("GSUBZ airtime response:", {
      code: providerCode,
      status: providerStatus,
      transactionID: providerTransactionID,
    });

    // Successful transaction
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
          serviceID: service,
          phone: cleanPhone,
          providerTransactionID,
          providerStatus,
          providerCode,
        },
      });

      const finalUser = await User.findById(user._id).select(
        "walletBalance"
      );

      return res.status(200).json({
        success: true,
        message: "Airtime purchase successful",
        reference,
        status: "successful",
        providerReference:
          providerTransactionID !== null
            ? String(providerTransactionID)
            : null,
        walletBalance: finalUser?.walletBalance ?? 0,
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
      const refundedUser = await User.findByIdAndUpdate(
        user._id,
        {
          $inc: {
            walletBalance: airtimeAmount,
          },
        },
        {
          new: true,
        }
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
          serviceID: service,
          phone: cleanPhone,
          providerTransactionID,
          providerStatus,
          providerCode,
        },
      });

      return res.status(400).json({
        success: false,
        message: "Airtime purchase failed",
        reference,
        status: "failed",
        refunded: true,
        walletBalance: refundedUser?.walletBalance ?? 0,
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
        serviceID: service,
        phone: cleanPhone,
        providerTransactionID,
        providerStatus,
        providerCode,
      },
    });

    return res.status(202).json({
      success: true,
      message: "Airtime purchase is pending provider confirmation",
      reference,
      status: "pending",
      providerReference:
        providerTransactionID !== null
          ? String(providerTransactionID)
          : null,
      walletBalance: updatedUser.walletBalance,
    });
  } catch (error) {
    console.error("Purchase airtime error:", error.message);

    if (walletDeducted && order && transaction) {
      try {
        await User.findByIdAndUpdate(req.user._id, {
          $inc: {
            walletBalance: order.amount,
          },
        });

        await Order.findByIdAndUpdate(order._id, {
          status: "failed",
        });

        await Transaction.findByIdAndUpdate(transaction._id, {
          status: "failed",
        });
      } catch (refundError) {
        console.error("Refund error:", refundError.message);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Server error while processing airtime purchase",
    });
  }
};

module.exports = {
  purchaseAirtime,
};
