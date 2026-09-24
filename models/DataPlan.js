const mongoose = require("mongoose");

const dataPlanSchema = new mongoose.Schema(
  {
    providerPlanId: {
      type: String,
      required: true,
    },

    network: {
      type: Number,
      required: true,
    },

    networkName: {
      type: String,
      required: true,
      trim: true,
    },

    planType: {
      type: String,
      trim: true,
    },

    plan: {
      type: String,
      required: true,
      trim: true,
    },

    validity: {
      type: String,
      trim: true,
    },

    providerPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    sellingPrice: {
      type: Number,
      required: true,
      min: 0,
    },

    profit: {
      type: Number,
      required: true,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

dataPlanSchema.index(
  { providerPlanId: 1, planType: 1 },
  { unique: true }
);

module.exports = mongoose.model("DataPlan", dataPlanSchema);
