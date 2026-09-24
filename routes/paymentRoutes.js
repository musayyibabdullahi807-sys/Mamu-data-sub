const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");

const {
  initializePayment,
  verifyPayment,
  paystackWebhook,
} = require("../controllers/paymentController");

router.post("/initialize", protect, initializePayment);

router.get("/verify/:reference", protect, verifyPayment);

// Paystack webhook
router.post("/webhook", paystackWebhook);

module.exports = router;
