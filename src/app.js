import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { configDotenv } from "dotenv";
configDotenv();
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

app.get("/health", (req, res) => {
  res.json({ status: "OK", service: "cart-services" });
});

app.use("/api/cart", cartRoutes);

app.use(errorHandler);

export default app;
