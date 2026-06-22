import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { configDotenv } from "dotenv";
configDotenv();
import { checkDBHealth } from "./config/db.js";
import { checkRedisHealth, isRedisAvailable, getRedisStatus } from "./config/redis.js";
import { checkRabbitMQHealth, isRabbitMQConnected, getRabbitMQStatus } from "./config/rabbitmq.js";
import cartRoutes from "./routes/cart.routes.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();

const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:5174").split(",").map(s => s.trim()).filter(Boolean);
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (corsOrigins.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(morgan("combined"));

app.get("/health", async (req, res, next) => {
  try {
    const dbHealth = checkDBHealth();
    const redisHealth = await checkRedisHealth();
    const rabbitMQHealth = await checkRabbitMQHealth();

    const allHealthy = dbHealth.status === "healthy" && redisHealth.status === "healthy" && rabbitMQHealth.status === "healthy";
    const overallStatus = allHealthy ? "healthy" : "degraded";

    res.status(allHealthy ? 200 : 503).json({
      status: overallStatus,
      service: "cart-services",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        mongodb: {
          status: dbHealth.status,
          message: dbHealth.message,
          connected: dbHealth.connected,
          host: dbHealth.host,
          db: dbHealth.db,
        },
        redis: {
          status: redisHealth.status,
          message: redisHealth.message,
          connected: redisHealth.connected,
          available: isRedisAvailable(),
          details: getRedisStatus(),
        },
        rabbitmq: {
          status: rabbitMQHealth.status,
          message: rabbitMQHealth.message,
          connected: rabbitMQHealth.connected,
          available: isRabbitMQConnected(),
          details: getRabbitMQStatus(),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

app.use("/api/cart", cartRoutes);

app.use(errorHandler);

export default app;
