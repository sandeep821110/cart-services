import jwt from "jsonwebtoken";
import logger from '../utils/logger.js';
import { refreshAccessToken } from '../utils/tokenRefresher.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

export const verifyGateway = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { userId: decoded.userId || decoded.id || decoded.sub };
      return next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return await handleExpiredToken(req, res, next);
      }
      return res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
  } catch (err) {
    logger.error('Gateway auth error', { message: err.message });
    return res.status(401).json({ message: 'Unauthorized: Authentication failed' });
  }
};

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  if (req.cookies?.access_token) {
    return req.cookies.access_token;
  }
  return null;
}

async function handleExpiredToken(req, res, next) {
  const refreshToken = req.cookies?.refresh_token || req.headers['x-refresh-token'];
  if (!refreshToken) {
    return res.status(401).json({ message: "Unauthorized: Token expired, no refresh token" });
  }

  try {
    const refreshed = await refreshAccessToken(refreshToken);

    if (refreshed.accessToken) {
      res.cookie('access_token', refreshed.accessToken, {
        ...COOKIE_OPTIONS,
        maxAge: 24 * 60 * 60 * 1000,
      });
      res.setHeader('x-new-access-token', refreshed.accessToken);
    }

    if (refreshed.refreshToken) {
      res.cookie('refresh_token', refreshed.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }

    const decoded = jwt.verify(refreshed.accessToken, process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET);
    req.user = { userId: decoded.userId || decoded.id || decoded.sub };
    return next();
  } catch (refreshErr) {
    return res.status(401).json({ message: 'Unauthorized: Token refresh failed' });
  }
}