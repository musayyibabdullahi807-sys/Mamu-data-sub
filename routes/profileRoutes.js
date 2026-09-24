const express = require("express");
const crypto = require("crypto");

const protect = require("../middleware/authMiddleware");
const User = require("../models/User");
const { updateProfile } = require("../controllers/profileController");

const router = express.Router();

const generateReferralCode = async () => {
  for (let i = 0; i < 10; i++) {
    const code = `MAMU${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

    const existingUser = await User.findOne({
      referralCode: code,
    });

    if (!existingUser) {
      return code;
    }
  }

  throw new Error("Could not generate unique referral code");
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

    if (!user.referralCode) {
      user.referralCode = await generateReferralCode();
      await user.save();
    }

    if (!user.accountType) {
      user.accountType = "Smart Earner";
      await user.save();
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username || null,
        name: user.name,
        phone: user.phone,
        email: user.email || null,
        state: user.state || null,
        city: user.city || null,
        address: user.address || null,
        accountType: user.accountType,
        walletBalance: user.walletBalance,
        isVerified: user.isVerified,
        accountStatus: user.accountStatus,
        referralCode: user.referralCode,
        referredBy: user.referredBy || null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error("Get profile error:", error.message);

    res.status(500).json({
      success: false,
      message: "Server error while getting profile",
    });
  }
});

router.put("/me", protect, updateProfile);

module.exports = router;
