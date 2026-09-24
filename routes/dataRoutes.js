const express = require("express");

const {
  getDataPlans,
  updateDataPlanPrice,
  purchaseData,
} = require("../controllers/dataController");

const protect = require("../middleware/authMiddleware");

const router = express.Router();

// Get active data plans
router.get("/plans", protect, getDataPlans);

// Update selling price of a data plan
router.put("/plans/:planId/price", protect, updateDataPlanPrice);

// Purchase data
router.post("/purchase", protect, purchaseData);

module.exports = router;
