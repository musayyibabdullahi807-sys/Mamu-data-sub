const mongoose = require("mongoose");

let connectionPromise;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not configured");
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 })
      .then(() => {
        console.log("✅ MongoDB connected successfully");
        return mongoose.connection;
      })
      .catch((error) => {
        connectionPromise = null;
        throw error;
      });
  }
  return connectionPromise;
};

module.exports = connectDB;
