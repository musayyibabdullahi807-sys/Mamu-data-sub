const express = require("express");

const protect = require("../middleware/authMiddleware");
const { purchaseAirtime } = require("../controllers/airtimeController");

const router = express.Router();

router.post("/purchase", protect, purchaseAirtime);

module.exports = router;
