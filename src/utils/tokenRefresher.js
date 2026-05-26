import axios from 'axios';
import logger from './logger.js';

export const refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) throw new Error('No refresh token');

  try {
    const authUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:5000';
    const response = await axios.post(
      `${authUrl}/api/auth/refresh-token`,
      { refreshToken },
      {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
        withCredentials: true,
      }
    );
    const data = response.data || {};
    return {
      accessToken: data.accessToken || data.access_token || data.token,
      refreshToken: data.refreshToken || data.refresh_token,
    };
  } catch (err) {
    logger.error('Token refresh failed', { message: err.message });
    throw new Error('Token refresh failed');
  }
};
