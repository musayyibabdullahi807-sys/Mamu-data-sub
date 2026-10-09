const express = require("express");
const protect = require("../middleware/authMiddleware");
const { getCatalog, createPurchase, checkGameOrder } = require("../controllers/gsubzExtraController");

const router = express.Router();
router.get("/catalog/:kind", protect, getCatalog);
router.post("/purchase", protect, createPurchase);
router.get("/game-orders/:requestID", protect, checkGameOrder);
module.exports = router;
