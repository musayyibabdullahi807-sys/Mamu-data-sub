const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const {
  signup,
  login,
  requestPasswordReset,
  resetPassword,
  setTransactionPin,
  resetTransactionPin,
} = require("../controllers/authController");

const protect = require("../middleware/authMiddleware");

router.post("/signup", signup);
router.post("/login", login);

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many password recovery attempts. Please try again later.",
  },
});

router.post("/password/forgot", passwordResetLimiter, requestPasswordReset);
router.post("/password/reset", passwordResetLimiter, resetPassword);

// Transaction PIN
router.post("/transaction-pin", protect, setTransactionPin);
router.post("/transaction-pin/reset", protect, resetTransactionPin);

module.exports = router;
