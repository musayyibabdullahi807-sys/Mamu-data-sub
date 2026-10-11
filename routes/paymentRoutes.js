const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");

const {
  initializePayment,
  initializeBankTransfer,
  verifyPayment,
  paystackWebhook,
} = require("../controllers/paymentController");

router.post("/initialize", protect, initializePayment);

router.post("/bank-transfer/initialize", protect, initializeBankTransfer);

router.get("/verify/:reference", protect, verifyPayment);

// Paystack webhook
router.post("/webhook", paystackWebhook);

module.exports = router;
