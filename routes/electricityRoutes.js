const express = require("express");

const protect = require("../middleware/authMiddleware");
const {
  purchaseElectricity,
} = require("../controllers/electricityController");

const router = express.Router();

router.post("/purchase", protect, purchaseElectricity);

module.exports = router;
