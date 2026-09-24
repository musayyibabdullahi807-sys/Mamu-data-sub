const crypto = require("crypto");
const User = require("../models/User");
const ReferralCommission = require("../models/ReferralCommission");

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

const getReferralSummary = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Generate referral code for older users
    // who were created before the referral system.
    if (!user.referralCode) {
      user.referralCode = await generateReferralCode();
      await user.save();
    }

    const totalReferrals = await User.countDocuments({
      referredBy: user._id,
    });

    const successfulCommissions =
      await ReferralCommission.countDocuments({
        referrer: user._id,
        status: "successful",
      });

    res.json({
      success: true,
      referral: {
        referralCode: user.referralCode,
        totalReferrals,
        successfulCommissions,
        referralEarnings: user.referralEarnings || 0,
      },
    });
  } catch (error) {
    console.error(
      "Get referral summary error:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Server error while getting referral summary",
    });
  }
};

const getReferralCommissions = async (req, res) => {
  try {
    const commissions = await ReferralCommission.find({
      referrer: req.user._id,
    })
      .sort({ createdAt: -1 })
      .populate("referredUser", "name")
      .populate(
        "transaction",
        "reference amount status"
      )
      .populate(
        "order",
        "serviceType network phone amount"
      );

    res.json({
      success: true,
      count: commissions.length,
      commissions,
    });
  } catch (error) {
    console.error(
      "Get referral commissions error:",
      error.message
    );

    res.status(500).json({
      success: false,
      message:
        "Server error while getting referral commissions",
    });
  }
};

module.exports = {
  getReferralSummary,
  getReferralCommissions,
};
