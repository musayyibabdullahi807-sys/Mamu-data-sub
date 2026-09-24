const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");
const { submitKYC } = require("../controllers/kycController");

router.post("/submit", protect, submitKYC);

module.exports = router;
