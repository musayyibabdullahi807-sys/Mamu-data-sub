const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    serviceType: {
      type: String,
      enum: ["data", "airtime", "electricity", "tv", "jamb"],
      required: true,
    },

    network: {
      type: String,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    plan: {
      type: String,
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    providerReference: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: ["pending", "successful", "failed", "reversed"],
      default: "pending",
    },

    reference: {
      type: String,
      required: true,
      unique: true,
    },

    providerResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Order", orderSchema);
