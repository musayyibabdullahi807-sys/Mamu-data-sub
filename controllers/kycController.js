const User = require("../models/User");

const submitKYC = async (req, res) => {
  try {
    const { dateOfBirth, idType, idNumber, nin } = req.body;

    if (!dateOfBirth || !idType || !idNumber) {
      return res.status(400).json({
        success: false,
        message: "Date of birth, ID type and ID number are required",
      });
    }

    const allowedIdTypes = [
      "NIN",
      "voter_card",
      "passport",
      "drivers_license",
    ];

    if (!allowedIdTypes.includes(idType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID type",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.kycStatus === "verified") {
      return res.status(400).json({
        success: false,
        message: "KYC is already verified",
      });
    }

    user.dateOfBirth = dateOfBirth;
    user.idType = idType;
    user.idNumber = idNumber;

    if (nin !== undefined) {
      user.nin = nin;
    }

    user.kycStatus = "pending";

    await user.save();

    res.json({
      success: true,
      message: "KYC submitted successfully",
      kycStatus: user.kycStatus,
    });
  } catch (error) {
    console.error("KYC submission error:", error.message);

    res.status(500).json({
      success: false,
      message: "Server error while submitting KYC",
    });
  }
};

module.exports = {
  submitKYC,
};
