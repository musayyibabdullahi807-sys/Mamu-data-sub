const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const { getSquadAccount, createSquadAccount, squadWebhook } = require("../controllers/squadPaymentController");

router.get("/account", protect, getSquadAccount);
router.post("/account", protect, createSquadAccount);
router.post("/webhook", squadWebhook);

module.exports = router;
