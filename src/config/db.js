import mongoose from "mongoose";
import { configDotenv } from "dotenv";
configDotenv();

export const checkDBHealth = () => {
  const state = mongoose.connection.readyState;
  const stateMap = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };
  const status = stateMap[state] || "unknown";
  return {
    status: state === 1 ? "healthy" : "unhealthy",
    message: `MongoDB is ${status}`,
    state,
    connected: state === 1,
    host: mongoose.connection.host || null,
    db: mongoose.connection.name || null,
  };
};

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");
  } catch (error) {
    console.log("MongoDB connection error:", error.message);
    throw error;
  }
};

mongoose.connection.on("connected", () => {
  console.log("Mongoose connected to MongoDB");
});

mongoose.connection.on("error", (err) => {
  console.log("Mongoose connection error:", err.message);
});

mongoose.connection.on("disconnected", () => {
  console.log("Mongoose disconnected from MongoDB");
});
