import dotenv from "dotenv";
dotenv.config();
import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";
import { connectRabbitMQ } from "./src/config/rabbitmq.js";

const PORT = process.env.PORT || 8001;

async function start() {
  try {
    await connectDB();

    try {
      await connectRabbitMQ();
    } catch (err) {
      console.error("RabbitMQ connection failed:", err.message);
    }

    app.listen(PORT, () => {
      console.log(`Cart Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start Cart Service:", error);
    process.exit(1);
  }
}

start();
