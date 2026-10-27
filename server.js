const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
require("dotenv").config();

const connectDB = require("./config/database");


const app = express();

// Vercel sits in front of Express and forwards the original client IP.
// Trust one proxy hop so express-rate-limit can identify clients correctly.
app.set("trust proxy", 1);

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
const marketplaceRoutes = require("./routes/marketplaceRoutes");
const gsubzExtraRoutes = require("./routes/gsubzExtraRoutes");

// Security: marketplace media uploads and playback are served from Vercel Blob.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "connect-src": ["'self'", "https://*.blob.vercel-storage.com"],
      "img-src": ["'self'", "data:", "blob:", "https://*.public.blob.vercel-storage.com"],
      "media-src": ["'self'", "blob:", "https://*.public.blob.vercel-storage.com"],
    },
  },
}));

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

// The root URL opens the app shell. Its client-side auth check sends signed-out
// visitors to login and keeps signed-in visitors on the dashboard.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

// Frontend
app.use(express.static(path.join(__dirname, "frontend")));

// Connect on demand so a database outage cannot terminate the Vercel function
// before it can serve static pages. Reuse the cached connection across requests.
app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    res.status(503).json({ success: false, message: "Service is temporarily unavailable. Please try again shortly." });
  }
});

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
app.use("/api/marketplace", marketplaceRoutes);
app.use("/api/services/gsubz", gsubzExtraRoutes);

// Start server
const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`✅ MAMU DATA SUB Server running on port ${PORT}`);
  });
}

module.exports = app;
