const express = require("express");

const protect = require("../middleware/authMiddleware");
const { purchaseTV } = require("../controllers/tvController");

const router = express.Router();

router.post("/purchase", protect, purchaseTV);

module.exports = router;
