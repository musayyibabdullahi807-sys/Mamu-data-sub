const User = require("../models/User");

const updateProfile = async (req, res) => {
  try {
    const { state, city, address } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const currentEditCount =
      user.profileLocationEditCount || 0;

    if (currentEditCount >= 2) {
      return res.status(403).json({
        success: false,
        message:
          "State, city and address can only be edited twice. Your profile location is now permanent.",
      });
    }

    const newState =
      state !== undefined
        ? String(state).trim()
        : String(user.state || "").trim();

    const newCity =
      city !== undefined
        ? String(city).trim()
        : String(user.city || "").trim();

    const newAddress =
      address !== undefined
        ? String(address).trim()
        : String(user.address || "").trim();

    const locationChanged =
      newState !== String(user.state || "").trim() ||
      newCity !== String(user.city || "").trim() ||
      newAddress !== String(user.address || "").trim();

    if (!locationChanged) {
      return res.status(400).json({
        success: false,
        message: "No changes were made to your profile location.",
      });
    }

    user.state = newState;
    user.city = newCity;
    user.address = newAddress;

    user.profileLocationEditCount =
      currentEditCount + 1;

    if (!user.accountType) {
      user.accountType = "Smart Earner";
    }

    await user.save();

    const remainingEdits = Math.max(
      0,
      2 - user.profileLocationEditCount
    );

    res.json({
      success: true,
      message:
        remainingEdits === 0
          ? "Profile updated successfully. State, city and address are now permanent."
          : "Profile updated successfully.",
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
        profileLocationEditCount:
          user.profileLocationEditCount,
        profileLocationEditsRemaining:
          remainingEdits,
      },
    });
  } catch (error) {
    console.error(
      "Update profile error:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Server error while updating profile",
    });
  }
};

module.exports = {
  updateProfile,
};
