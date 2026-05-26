import { jest } from '@jest/globals';

const mockJwtVerify = jest.fn();
const mockRefreshAccessToken = jest.fn();

jest.unstable_mockModule('jsonwebtoken', () => ({
  default: { verify: mockJwtVerify },
  verify: mockJwtVerify,
}));

jest.unstable_mockModule('../utils/tokenRefresher.js', () => ({
  refreshAccessToken: mockRefreshAccessToken,
}));

const { authenticateUser } = await import('./auth.middleware.js');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      headers: {},
      cookies: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
      setHeader: jest.fn(),
    };
    next = jest.fn();
    process.env.JWT_SECRET = 'test-secret';
  });

  describe('header-based auth', () => {
    it('should return 401 if no authorization header is present', async () => {
      await authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'No token provided' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if authorization header does not start with "Bearer "', async () => {
      req.headers.authorization = 'Token some-token';
      await authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'No token provided' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if token is invalid', async () => {
      req.headers.authorization = 'Bearer invalid-token';
      mockJwtVerify.mockImplementation(() => {
        throw new Error('Invalid token');
      });
      await authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Invalid token' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() and attach user to request if token is valid', async () => {
      const payload = { id: 'user123' };
      req.headers.authorization = 'Bearer valid-token';
      mockJwtVerify.mockReturnValue(payload);

      await authenticateUser(req, res, next);

      expect(mockJwtVerify).toHaveBeenCalledWith('valid-token', 'test-secret');
      expect(req.user).toEqual({ id: 'user123' });
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should normalize user id from payload.userId', async () => {
      const payload = { userId: 'user456' };
      req.headers.authorization = 'Bearer valid-token';
      mockJwtVerify.mockReturnValue(payload);

      await authenticateUser(req, res, next);

      expect(req.user).toEqual({ id: 'user456' });
      expect(next).toHaveBeenCalled();
    });

    it('should normalize user id from payload.sub', async () => {
      const payload = { sub: 'user789' };
      req.headers.authorization = 'Bearer valid-token';
      mockJwtVerify.mockReturnValue(payload);

      await authenticateUser(req, res, next);

      expect(req.user).toEqual({ id: 'user789' });
      expect(next).toHaveBeenCalled();
    });
  });

  describe('cookie-based auth', () => {
    it('should authenticate using access_token cookie', async () => {
      req.cookies.access_token = 'cookie-token';
      const payload = { id: 'cookie-user' };
      mockJwtVerify.mockReturnValue(payload);

      await authenticateUser(req, res, next);

      expect(mockJwtVerify).toHaveBeenCalledWith('cookie-token', 'test-secret');
      expect(req.user).toEqual({ id: 'cookie-user' });
      expect(next).toHaveBeenCalled();
    });

    it('should return 401 if no token in header or cookie', async () => {
      delete req.cookies.access_token;
      await authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'No token provided' });
    });
  });

  describe('auto-refresh on expired token', () => {
    it('should refresh token when access token is expired and refresh token is present', async () => {
      const expiredErr = new Error('jwt expired');
      expiredErr.name = 'TokenExpiredError';
      mockJwtVerify.mockImplementationOnce(() => { throw expiredErr; });
      mockJwtVerify.mockImplementationOnce(() => ({ id: 'refreshed-user' }));

      mockRefreshAccessToken.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      req.cookies.access_token = 'expired-token';
      req.cookies.refresh_token = 'valid-refresh-token';

      await authenticateUser(req, res, next);

      expect(mockRefreshAccessToken).toHaveBeenCalledWith('valid-refresh-token');
      expect(res.cookie).toHaveBeenCalledWith('access_token', 'new-access-token', expect.any(Object));
      expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'new-refresh-token', expect.any(Object));
      expect(res.setHeader).toHaveBeenCalledWith('x-new-access-token', 'new-access-token');
      expect(req.user).toEqual({ id: 'refreshed-user' });
      expect(next).toHaveBeenCalled();
    });

    it('should use x-refresh-token header if cookie is not available', async () => {
      const expiredErr = new Error('jwt expired');
      expiredErr.name = 'TokenExpiredError';
      mockJwtVerify.mockImplementationOnce(() => { throw expiredErr; });
      mockJwtVerify.mockImplementationOnce(() => ({ id: 'user' }));

      mockRefreshAccessToken.mockResolvedValue({
        accessToken: 'new-access-token',
      });

      req.headers.authorization = 'Bearer expired-token';
      req.headers['x-refresh-token'] = 'header-refresh-token';

      await authenticateUser(req, res, next);

      expect(mockRefreshAccessToken).toHaveBeenCalledWith('header-refresh-token');
      expect(req.user).toEqual({ id: 'user' });
      expect(next).toHaveBeenCalled();
    });

    it('should return 401 if access token expired but no refresh token available', async () => {
      const expiredErr = new Error('jwt expired');
      expiredErr.name = 'TokenExpiredError';
      mockJwtVerify.mockImplementation(() => { throw expiredErr; });

      req.headers.authorization = 'Bearer expired-token';

      await authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Token expired, no refresh token' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if token refresh fails', async () => {
      const expiredErr = new Error('jwt expired');
      expiredErr.name = 'TokenExpiredError';
      mockJwtVerify.mockImplementationOnce(() => { throw expiredErr; });

      mockRefreshAccessToken.mockRejectedValue(new Error('Refresh failed'));

      req.cookies.access_token = 'expired-token';
      req.cookies.refresh_token = 'bad-refresh-token';

      await authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Token refresh failed' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
