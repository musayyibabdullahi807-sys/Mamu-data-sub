const bcrypt = require("bcryptjs");
const User = require("../models/User");

const isValidPin = (pin) => {
  return /^\d{4}$/.test(String(pin));
};

const setTransactionPin = async (req, res) => {
  try {
    const { pin, confirmPin } = req.body;

    if (!isValidPin(pin) || !isValidPin(confirmPin)) {
      return res.status(400).json({
        success: false,
        message: "Transaction PIN must contain exactly 4 digits.",
      });
    }

    if (pin !== confirmPin) {
      return res.status(400).json({
        success: false,
        message: "Transaction PINs do not match.",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (user.transactionPinHash) {
      return res.status(400).json({
        success: false,
        message:
          "Transaction PIN already exists. Use change or reset PIN.",
      });
    }

    user.transactionPinHash = await bcrypt.hash(pin, 12);

    await user.save();

    res.json({
      success: true,
      message: "Transaction PIN created successfully.",
    });
  } catch (error) {
    console.error("Set transaction PIN error:", error.message);

    res.status(500).json({
      success: false,
      message: "Server error while creating transaction PIN.",
    });
  }
};

const verifyTransactionPin = async (req, res) => {
  try {
    const { pin } = req.body;

    if (!isValidPin(pin)) {
      return res.status(400).json({
        success: false,
        message: "Transaction PIN must contain exactly 4 digits.",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (!user.transactionPinHash) {
      return res.status(400).json({
        success: false,
        message: "Transaction PIN has not been created.",
      });
    }

    const isMatch = await bcrypt.compare(
      String(pin),
      user.transactionPinHash
    );

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Incorrect transaction PIN.",
      });
    }

    res.json({
      success: true,
      message: "Transaction PIN verified successfully.",
    });
  } catch (error) {
    console.error("Verify transaction PIN error:", error.message);

    res.status(500).json({
      success: false,
      message: "Server error while verifying transaction PIN.",
    });
  }
};

const resetTransactionPin = async (req, res) => {
  try {
    const {
      accountPassword,
      newPin,
      confirmPin,
    } = req.body;

    if (!accountPassword) {
      return res.status(400).json({
        success: false,
        message: "Account password is required.",
      });
    }

    if (!isValidPin(newPin) || !isValidPin(confirmPin)) {
      return res.status(400).json({
        success: false,
        message: "Transaction PIN must contain exactly 4 digits.",
      });
    }

    if (newPin !== confirmPin) {
      return res.status(400).json({
        success: false,
        message: "Transaction PINs do not match.",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      accountPassword,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Incorrect account password.",
      });
    }

    user.transactionPinHash = await bcrypt.hash(
      newPin,
      12
    );

    await user.save();

    res.json({
      success: true,
      message: "Transaction PIN reset successfully.",
    });
  } catch (error) {
    console.error("Reset transaction PIN error:", error.message);

    res.status(500).json({
      success: false,
      message: "Server error while resetting transaction PIN.",
    });
  }
};

module.exports = {
  setTransactionPin,
  verifyTransactionPin,
  resetTransactionPin,
};
