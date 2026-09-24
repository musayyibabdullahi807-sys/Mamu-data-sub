const express = require("express");

const protect = require("../middleware/authMiddleware");

const {
  setTransactionPin,
  verifyTransactionPin,
  resetTransactionPin,
} = require("../controllers/securityController");

const router = express.Router();

router.post(
  "/transaction-pin",
  protect,
  setTransactionPin
);

router.post(
  "/transaction-pin/verify",
  protect,
  verifyTransactionPin
);

router.post(
  "/transaction-pin/reset",
  protect,
  resetTransactionPin
);

module.exports = router;
