const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Order = require("../models/Order");
const Transaction = require("../models/Transaction");
const { buyTV } = require("../services/gsubzService");

const ALLOWED_TV_SERVICES = [
  "gotv",
  "dstv",
  "startimes",
];

const isSuccessStatus = (status) => {
  const normalized = String(status || "").toUpperCase();

  return (
    normalized === "TRANSACTION_SUCCESSFUL" ||
    normalized === "SUCCESSFUL"
  );
};

const isFailureStatus = (status) => {
  const normalized = String(status || "").toUpperCase();

  return [
    "TRANSACTION_FAILED",
    "FAILED",
    "ERROR",
    "REVERSED",
    "TRANSACTION_REVERSED",
  ].includes(normalized);
};

const purchaseTV = async (req, res) => {
  const {
    serviceID,
    plan,
    amount,
    customerID,
    phone,
    email,
    pin,
  } = req.body;

  if (!serviceID) {
    return res.status(400).json({
      success: false,
      message: "TV serviceID is required",
    });
  }

  if (!ALLOWED_TV_SERVICES.includes(String(serviceID).toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: "Unsupported TV service",
    });
  }

  if (!plan) {
    return res.status(400).json({
      success: false,
      message: "TV plan is required",
    });
  }

  if (amount === undefined || amount === null || amount === "") {
    return res.status(400).json({
      success: false,
      message: "TV amount is required",
    });
  }

  const tvAmount = Number(amount);

  if (!Number.isFinite(tvAmount) || tvAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid TV amount",
    });
  }

  if (!customerID) {
    return res.status(400).json({
      success: false,
      message: "SmartCard/IUC number is required",
    });
  }

  if (!/^\d{5,30}$/.test(String(customerID))) {
    return res.status(400).json({
      success: false,
      message: "Invalid SmartCard/IUC number",
    });
  }

  if (!phone) {
    return res.status(400).json({
      success: false,
      message: "Customer phone is required",
    });
  }

  const cleanPin = String(pin || "").trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    return res.status(400).json({ success: false, message: "Transaction PIN must contain exactly 4 digits" });
  }

  if (!/^\d{10,15}$/.test(String(phone))) {
    return res.status(400).json({
      success: false,
      message: "Invalid customer phone",
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
      message: "Account is not active",
    });
  }

  if (!user.transactionPinHash) {
    return res.status(400).json({ success: false, message: "Transaction PIN has not been created. Please create one in Security settings." });
  }
  if (!(await bcrypt.compare(cleanPin, user.transactionPinHash))) {
    return res.status(401).json({ success: false, message: "Incorrect transaction PIN" });
  }

  if (Number(user.walletBalance) < tvAmount) {
    return res.status(400).json({
      success: false,
      message: "Insufficient wallet balance",
    });
  }

  const requestID = Date.now() + Math.floor(Math.random() * 100000);

  const reference = `MDS-TV-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;

  const order = await Order.create({
    user: user._id,
    serviceType: "tv",
    phone: String(phone),
    plan: String(plan),
    amount: tvAmount,
    reference,
    status: "pending",
  });

  const transaction = await Transaction.create({
    user: user._id,
    type: "bill_payment",
    amount: tvAmount,
    status: "pending",
    reference,
    description: `TV subscription - ${String(serviceID).toUpperCase()}`,
    metadata: {
      orderId: order._id,
      serviceID,
      plan,
      customerID: String(customerID),
      phone: String(phone),
    },
  });

  const deductedUser = await User.findOneAndUpdate(
    {
      _id: user._id,
      accountStatus: "active",
      walletBalance: { $gte: tvAmount },
    },
    {
      $inc: { walletBalance: -tvAmount },
    },
    {
      new: true,
    }
  );

  if (!deductedUser) {
    await order.deleteOne();
    await transaction.deleteOne();

    return res.status(400).json({
      success: false,
      message: "Insufficient wallet balance",
    });
  }

  try {
    const providerResponse = await buyTV({
      serviceID: String(serviceID).toLowerCase(),
      plan: String(plan),
      amount: tvAmount,
      customerID: String(customerID),
      phone: String(phone),
      requestID,
      email,
    });

    const providerStatus =
      providerResponse?.status ||
      providerResponse?.content?.status ||
      "";

    const providerReference =
      providerResponse?.content?.transactionID ||
      providerResponse?.transactionID ||
      "";

    if (isSuccessStatus(providerStatus)) {
      order.status = "successful";
      order.providerReference = String(providerReference || "");
      order.providerResponse = providerResponse;
      await order.save();

      transaction.status = "successful";
      transaction.metadata = {
        ...transaction.metadata,
        providerReference,
        providerResponse,
      };
      await transaction.save();

      return res.status(200).json({
        success: true,
        message: "TV subscription successful",
        reference,
        providerReference,
        walletBalance: deductedUser.walletBalance,
      });
    }

    if (isFailureStatus(providerStatus)) {
      await User.findByIdAndUpdate(user._id, {
        $inc: { walletBalance: tvAmount },
      });

      order.status = "failed";
      order.providerResponse = providerResponse;
      await order.save();

      transaction.status = "failed";
      transaction.metadata = {
        ...transaction.metadata,
        providerResponse,
      };
      await transaction.save();

      return res.status(400).json({
        success: false,
        message:
          providerResponse?.description ||
          providerResponse?.content?.description ||
          "TV subscription failed",
        reference,
      });
    }

    order.status = "pending";
    order.providerResponse = providerResponse;
    await order.save();

    transaction.metadata = {
      ...transaction.metadata,
      providerResponse,
    };
    await transaction.save();

    return res.status(202).json({
      success: true,
      message: "TV subscription is pending",
      reference,
    });
  } catch (error) {
    await User.findByIdAndUpdate(user._id, {
      $inc: { walletBalance: tvAmount },
    });

    order.status = "failed";
    order.providerResponse = {
      error: error.message,
    };
    await order.save();

    transaction.status = "failed";
    transaction.metadata = {
      ...transaction.metadata,
      error: error.message,
    };
    await transaction.save();

    return res.status(502).json({
      success: false,
      message: "TV provider request failed. Wallet refunded.",
      reference,
    });
  }
};

module.exports = {
  purchaseTV,
};
