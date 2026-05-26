import jwt from "jsonwebtoken";
import logger from "../utils/logger.js";

const getAccessSecret = () => process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;

const extractAccessToken = (req) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.split(" ")[1];
  if (req.cookies?.authToken) return req.cookies.authToken;
  return null;
};

export const authenticateUser = (req, res, next) => {
  try {
    const token = extractAccessToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "NO_TOKEN",
      });
    }

    const decoded = jwt.verify(token, getAccessSecret());

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
        code: "INVALID_PAYLOAD",
      });
    }

    req.user = {
      id: decoded.id,
      email: decoded.email || null,
      role: decoded.role || "user",
    };

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired",
        code: "TOKEN_EXPIRED",
      });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
        code: "INVALID_TOKEN",
      });
    }
    logger.error("Auth middleware error:", err.message);
    return res.status(401).json({
      success: false,
      message: "Authentication failed",
      code: "AUTH_ERROR",
    });
  }
};

export const extractAndVerifyToken = (req) => {
  const token = extractAccessToken(req);
  if (!token) return null;
  try {
    return jwt.verify(token, getAccessSecret());
  } catch {
    return null;
  }
};

export default authenticateUser;
