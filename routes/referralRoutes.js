const express = require("express");
const protect = require("../middleware/authMiddleware");

const {
  getReferralSummary,
  getReferralCommissions,
} = require("../controllers/referralController");

const router = express.Router();

router.get("/", protect, getReferralSummary);

router.get("/commissions", protect, getReferralCommissions);

module.exports = router;
