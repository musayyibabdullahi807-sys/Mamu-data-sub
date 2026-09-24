const User = require("../models/User");

const updateProfile = async (req, res) => {
  try {
    const {
      username,
      name,
      email,
      state,
      city,
      address,
    } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (username !== undefined) {
      const cleanUsername = String(username).trim().toLowerCase();

      if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
        return res.status(400).json({
          success: false,
          message:
            "Username must be 3-30 characters and use only letters, numbers, or underscore",
        });
      }

      const existingUsername = await User.findOne({
        username: cleanUsername,
        _id: { $ne: user._id },
      });

      if (existingUsername) {
        return res.status(409).json({
          success: false,
          message: "Username already taken",
        });
      }

      user.username = cleanUsername;
    }

    if (name !== undefined) {
      user.name = String(name).trim();
    }

    if (email !== undefined) {
      const cleanEmail = String(email).trim().toLowerCase();

      if (cleanEmail) {
        const existingEmail = await User.findOne({
          email: cleanEmail,
          _id: { $ne: user._id },
        });

        if (existingEmail) {
          return res.status(409).json({
            success: false,
            message: "Email already registered",
          });
        }

        user.email = cleanEmail;
      } else {
        user.email = undefined;
      }
    }

    if (state !== undefined) {
      user.state = String(state).trim();
    }

    if (city !== undefined) {
      user.city = String(city).trim();
    }

    if (address !== undefined) {
      user.address = String(address).trim();
    }

    if (!user.accountType) {
      user.accountType = "Smart Earner";
    }

    await user.save();

    res.json({
      success: true,
      message: "Profile updated successfully",
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
        referralCode: user.referralCode || null,
        referredBy: user.referredBy || null,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error.message);

    res.status(500).json({
      success: false,
      message: "Server error while updating profile",
    });
  }
};

module.exports = {
  updateProfile,
};
