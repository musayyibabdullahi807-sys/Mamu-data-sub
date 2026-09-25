const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");

const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// Generate unique referral code
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

// Generate permanent username from full name
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

// SIGNUP
const signup = async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      password,
      referralCode,
    } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, phone and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const existingPhone = await User.findOne({ phone });

    if (existingPhone) {
      return res.status(409).json({
        success: false,
        message: "Phone number already registered",
      });
    }

    if (email) {
      const existingEmail = await User.findOne({ email });

      if (existingEmail) {
        return res.status(409).json({
          success: false,
          message: "Email already registered",
        });
      }
    }

    // Find referrer if referral code was provided
    let referredBy = null;

    if (referralCode) {
      const referrer = await User.findOne({
        referralCode: String(referralCode).trim().toUpperCase(),
      });

      if (!referrer) {
        return res.status(400).json({
          success: false,
          message: "Invalid referral code",
        });
      }

      referredBy = referrer._id;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newReferralCode = await generateReferralCode();

    const newUsername = await generateUsername(name);

    const user = await User.create({
      username: newUsername,
      name,
      phone,
      email: email || undefined,
      password: hashedPassword,
      referralCode: newReferralCode,
      referredBy,
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      token,
      user: {
        id: user._id,
        username: user.username,
        name: user.name,
        phone: user.phone,
        email: user.email,
        walletBalance: user.walletBalance,
        isVerified: user.isVerified,
        referralCode: user.referralCode,
        referredBy: user.referredBy,
      },
    });
  } catch (error) {
    console.error("Signup error:", error.message);

    res.status(500).json({
      success: false,
      message: "Server error during signup",
    });
  }
};

// LOGIN
const login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone and password are required",
      });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone or password",
      });
    }

    if (user.accountStatus !== "active") {
      return res.status(403).json({
        success: false,
        message: "Account is suspended",
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone or password",
      });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username || null,
        name: user.name,
        phone: user.phone,
        email: user.email,
        walletBalance: user.walletBalance,
        isVerified: user.isVerified,
        referralCode: user.referralCode,
        referredBy: user.referredBy,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);

    res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
};

// SET TRANSACTION PIN
const setTransactionPin = async (req, res) => {
  try {
    const { pin } = req.body;

    if (!/^\d{4}$/.test(String(pin || ""))) {
      return res.status(400).json({
        success: false,
        message: "Transaction PIN must be exactly 4 digits",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.transactionPinHash) {
      return res.status(400).json({
        success: false,
        message: "Transaction PIN already exists. Use reset PIN.",
      });
    }

    user.transactionPinHash = await bcrypt.hash(String(pin), 12);

    await user.save();

    res.json({
      success: true,
      message: "Transaction PIN set successfully",
    });
  } catch (error) {
    console.error("Set transaction PIN error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to set transaction PIN",
    });
  }
};

// RESET TRANSACTION PIN
const resetTransactionPin = async (req, res) => {
  try {
    const { password, newPin } = req.body;

    if (!password || !newPin) {
      return res.status(400).json({
        success: false,
        message: "Login password and new PIN are required",
      });
    }

    if (!/^\d{4}$/.test(String(newPin))) {
      return res.status(400).json({
        success: false,
        message: "Transaction PIN must be exactly 4 digits",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Incorrect login password",
      });
    }

    user.transactionPinHash = await bcrypt.hash(
      String(newPin),
      12
    );

    await user.save();

    res.json({
      success: true,
      message: "Transaction PIN changed successfully",
    });
  } catch (error) {
    console.error("Reset transaction PIN error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to reset transaction PIN",
    });
  }
};

module.exports = {
  signup,
  login,
  setTransactionPin,
  resetTransactionPin,
};
