require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("./config/database");
const { syncGSUBZDataPlans } = require("./services/gsubzDataPlanSyncService");

const run = async () => {
  try {
    await connectDB();

    console.log("🔄 Starting GSUBZ data plan sync...");

    const result = await syncGSUBZDataPlans();

    console.log("✅ GSUBZ sync completed");
    console.log(result);
  } catch (error) {
    console.error("❌ GSUBZ sync failed:", error.message);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 MongoDB connection closed");
  }
};

run();
