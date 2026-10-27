const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const { normalizeNigeriaPhone, getNigeriaPhoneCandidates } = require("../utils/nigeriaPhone");
const {
  isEmailConfigured,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
} = require("../services/resendEmailService");

const generateToken = (userId, tokenVersion = 0) => {
  return jwt.sign(
    { userId, tokenVersion },
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

    const normalizedPhone = normalizeNigeriaPhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid Nigerian mobile number with exactly 11 digits, for example 08012345678.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const existingPhone = await User.findOne({
      phone: { $in: getNigeriaPhoneCandidates(normalizedPhone) },
    });

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
      phone: normalizedPhone,
      email: email || undefined,
      password: hashedPassword,
      referralCode: newReferralCode,
      referredBy,
    });

    const token = generateToken(user._id, user.tokenVersion);

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

    const normalizedPhone = normalizeNigeriaPhone(phone, { allowLegacyTenDigit: true });
    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid Nigerian mobile number, such as 08012345678 or +2348012345678.",
      });
    }

    const user = await User.findOne({
      phone: { $in: getNigeriaPhoneCandidates(normalizedPhone) },
    });

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

    const token = generateToken(user._id, user.tokenVersion);

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



const PASSWORD_RESET_MESSAGE =
  "If an account with that email can be recovered, reset instructions will be sent shortly.";

const requestPasswordReset = async (req, res) => {
  if (!isEmailConfigured()) {
    return res.status(503).json({
      success: false,
      message: "Password recovery email is not available yet. Please contact support.",
    });
  }

  const email = String(req.body.email || "").trim().toLowerCase();
  if (!email || email.length > 254) {
    return res.json({ success: true, message: PASSWORD_RESET_MESSAGE });
  }

  try {
    const user = await User.findOne({ email }).select("+passwordResetRequestedAt");
    const cooldownMs = 60 * 1000;
    const lastRequest = user?.passwordResetRequestedAt?.getTime() || 0;

    if (user && user.email && Date.now() - lastRequest >= cooldownMs) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      user.passwordResetTokenHash = crypto
        .createHash("sha256")
        .update(rawToken)
        .digest("hex");
      user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
      user.passwordResetRequestedAt = new Date();
      await user.save();

      try {
        await sendPasswordResetEmail({ to: user.email, token: rawToken });
      } catch (emailError) {
        user.passwordResetTokenHash = null;
        user.passwordResetExpires = null;
        await user.save();
        console.error("Password reset email delivery failed:", emailError.message);
      }
    }

    return res.json({ success: true, message: PASSWORD_RESET_MESSAGE });
  } catch (error) {
    console.error("Password reset request failed:", error.message);
    return res.json({ success: true, message: PASSWORD_RESET_MESSAGE });
  }
};

const resetPassword = async (req, res) => {
  try {
    const rawToken = String(req.body.token || "");
    const password = String(req.body.password || "");

    if (!/^[a-f0-9]{64}$/i.test(rawToken) || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "This reset link is invalid or expired. Request a new one.",
      });
    }

    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpires: { $gt: new Date() },
    }).select("+passwordResetTokenHash +passwordResetExpires");

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "This reset link is invalid or expired. Request a new one.",
      });
    }

    user.password = await bcrypt.hash(password, 12);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    user.passwordResetTokenHash = null;
    user.passwordResetExpires = null;
    user.passwordResetRequestedAt = null;
    await user.save();

    if (user.email && isEmailConfigured()) {
      sendPasswordChangedEmail(user.email).catch((error) => {
        console.error("Password change notification failed:", error.message);
      });
    }

    return res.json({
      success: true,
      message: "Password changed. Please log in with your new password.",
    });
  } catch (error) {
    console.error("Password reset failed:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to reset your password. Please try again.",
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
  requestPasswordReset,
  resetPassword,
  setTransactionPin,
  resetTransactionPin,
};
