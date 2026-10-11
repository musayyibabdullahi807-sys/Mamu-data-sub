const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const { getSquadAccount } = require("../controllers/squadPaymentController");

router.get("/account", protect, getSquadAccount);

module.exports = router;
