const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

transactionPinHash: {
  type: String,
  default: null,
},

    passkeys: [{
      credentialID: { type: String, required: true },
      publicKey: { type: String, required: true },
      counter: { type: Number, default: 0 },
      transports: { type: [String], default: [] },
      createdAt: { type: Date, default: Date.now },
    }],
    passkeyChallenge: { type: String, default: null },
    passkeyChallengeType: { type: String, default: null },

    address: {
      type: String,
      trim: true,
    },

    state: {
      type: String,
      trim: true,
    },

    city: {
  type: String,
  trim: true,
},

profileLocationEditCount: {
  type: Number,
  default: 0,
  min: 0,
  max: 2,
},

accountType: {
      type: String,
      default: "Smart Earner",
      enum: ["Smart Earner"],
    },

    walletBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    accountStatus: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
    },

    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    referralEarnings: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);
