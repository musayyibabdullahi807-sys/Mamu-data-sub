const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
require("dotenv").config();

const connectDB = require("./config/database");

connectDB();

const app = express();

// Routes
const profileRoutes = require("./routes/profileRoutes");
const walletRoutes = require("./routes/walletRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const dataRoutes = require("./routes/dataRoutes");
const airtimeRoutes = require("./routes/airtimeRoutes");
const tvRoutes = require("./routes/tvRoutes");
const electricityRoutes = require("./routes/electricityRoutes");
const authRoutes = require("./routes/authRoutes");
const referralRoutes = require("./routes/referralRoutes");
const securityRoutes = require("./routes/securityRoutes");

// Security
app.use(helmet());

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = Buffer.from(buf);
    },
  })
);

app.use(cors());

// Rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

app.use(limiter);

// Frontend
app.use(express.static(path.join(__dirname, "frontend")));

// API routes
app.use("/api/profile", profileRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/data", dataRoutes);
app.use("/api/airtime", airtimeRoutes);
app.use("/api/tv", tvRoutes);
app.use("/api/electricity", electricityRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/security", securityRoutes);

// Root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ MAMU DATA SUB Server running on port ${PORT}`);
});
