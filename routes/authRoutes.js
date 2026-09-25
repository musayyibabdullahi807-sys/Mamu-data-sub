const express = require("express");
const router = express.Router();

const {
  signup,
  login,
  setTransactionPin,
  resetTransactionPin,
} = require("../controllers/authController");

const protect = require("../middleware/authMiddleware");

router.post("/signup", signup);
router.post("/login", login);

// Transaction PIN
router.post("/transaction-pin", protect, setTransactionPin);
router.post("/transaction-pin/reset", protect, resetTransactionPin);

module.exports = router;
