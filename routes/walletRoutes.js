const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");

const {
  getWallet,
  getTransactions,
  testFundWallet,
} = require("../controllers/walletController");

router.get("/", protect, getWallet);

router.get("/transactions", protect, getTransactions);

// TEST ONLY
router.post("/test-fund", protect, testFundWallet);

module.exports = router;
