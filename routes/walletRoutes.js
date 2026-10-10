const express = require("express");
const router = express.Router();
const manualFunding = require("../controllers/manualFundingController");

const protect = require("../middleware/authMiddleware");

const {
  getWallet,
  getTransactions,
  testFundWallet,
} = require("../controllers/walletController");

router.get("/", protect, getWallet);

router.get("/transactions", protect, getTransactions);

router.get("/manual-transfer/details", protect, manualFunding.getAccountDetails);
router.post("/manual-transfer/requests", protect, manualFunding.createManualTransferRequest);
router.get("/manual-transfer/admin/settings", protect, manualFunding.ownerOnly, manualFunding.getAdminFundingSettings);
router.put("/manual-transfer/admin/settings", protect, manualFunding.ownerOnly, manualFunding.saveAdminFundingSettings);
router.get("/manual-transfer/admin/requests", protect, manualFunding.ownerOnly, manualFunding.listManualTransferRequests);
router.post("/manual-transfer/admin/requests/:id/approve", protect, manualFunding.ownerOnly, manualFunding.approveManualTransfer);
router.post("/manual-transfer/admin/requests/:id/reject", protect, manualFunding.ownerOnly, manualFunding.rejectManualTransfer);

// TEST ONLY
router.post("/test-fund", protect, testFundWallet);

module.exports = router;
