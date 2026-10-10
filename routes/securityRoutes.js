const express = require("express");

const protect = require("../middleware/authMiddleware");

const {
  setTransactionPin,
  verifyTransactionPin,
  resetTransactionPin,
} = require("../controllers/securityController");

const biometric = require("../controllers/biometricController");

const router = express.Router();

router.get("/passkey/status", protect, biometric.passkeyStatus);
router.post("/passkey/register/options", protect, biometric.registrationOptions);
router.post("/passkey/register/verify", protect, biometric.verifyRegistration);
router.post("/passkey/authenticate/options", protect, biometric.authenticationOptions);
router.post("/passkey/authenticate/verify", protect, biometric.verifyAuthentication);

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
