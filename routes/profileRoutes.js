const express = require("express");
const crypto = require("crypto");

const protect = require("../middleware/authMiddleware");
const User = require("../models/User");
const { updateProfile } = require("../controllers/profileController");

const router = express.Router();

const generateReferralCode = async () => {
  for (let i = 0; i < 10; i++) {
    const code = `MAMU${crypto
      .randomBytes(4)
      .toString("hex")
      .toUpperCase()}`;

    const existingUser = await User.findOne({
      referralCode: code,
    });

    if (!existingUser) {
      return code;
    }
  }

  throw new Error("Could not generate unique referral code");
};

const generateUsername = async (name) => {
  const baseUsername = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);

  let username = baseUsername || "user";
  let counter = 1;

  while (await User.findOne({ username })) {
    counter += 1;

    const suffix = String(counter);
    const maxBaseLength = 30 - suffix.length;

    username =
      baseUsername.slice(0, maxBaseLength) + suffix;
  }

  return username;
};

router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Give older accounts a permanent username
    if (!user.username) {
      user.username = await generateUsername(user.name);
    }

    if (!user.referralCode) {
      user.referralCode = await generateReferralCode();
    }

    if (!user.accountType) {
      user.accountType = "Smart Earner";
    }

    await user.save();

    const editCount =
      user.profileLocationEditCount || 0;

    const editsRemaining = Math.max(
      0,
      2 - editCount
    );

    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        phone: user.phone,
        email: user.email || null,

        state: user.state || null,
        city: user.city || null,
        address: user.address || null,

        accountType: user.accountType,
        walletBalance: user.walletBalance,

        hasTransactionPin:
          Boolean(user.transactionPinHash),

        isVerified: user.isVerified,
        accountStatus: user.accountStatus,

        referralCode: user.referralCode,
        referredBy: user.referredBy || null,

        profileLocationEditCount: editCount,
        profileLocationEditsRemaining:
          editsRemaining,

        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error(
      "Get profile error:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Server error while getting profile",
    });
  }
});

router.put("/me", protect, updateProfile);

module.exports = router;
