import { jest } from "@jest/globals";

const mockJwtVerify = jest.fn();

jest.unstable_mockModule("jsonwebtoken", () => ({
  default: { verify: mockJwtVerify },
  verify: mockJwtVerify,
}));

jest.unstable_mockModule("../utils/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const { authenticateUser } = await import("./auth.middleware.js");

const SECRET = "test-secret-jwt";

describe("authenticateUser middleware", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { headers: {}, cookies: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
    process.env.JWT_ACCESS_SECRET = SECRET;
  });

  const payload = { id: "user123", email: "test@test.com", role: "admin" };

  describe("token from Authorization header", () => {
    it("calls next with user when Bearer token is valid", () => {
      req.headers.authorization = `Bearer valid-token`;
      mockJwtVerify.mockReturnValue(payload);

      authenticateUser(req, res, next);

      expect(mockJwtVerify).toHaveBeenCalledWith("valid-token", SECRET);
      expect(req.user).toEqual({ id: "user123", email: "test@test.com", role: "admin" });
      expect(next).toHaveBeenCalled();
    });

    it("returns 401 with NO_TOKEN when Authorization header is missing", () => {
      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Authentication required",
        code: "NO_TOKEN",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 with NO_TOKEN when header does not start with Bearer", () => {
      req.headers.authorization = "Token some-token";

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Authentication required",
        code: "NO_TOKEN",
      });
    });
  });

  describe("token from cookie", () => {
    it("calls next with user when authToken cookie is valid", () => {
      req.cookies.authToken = "cookie-token";
      mockJwtVerify.mockReturnValue(payload);

      authenticateUser(req, res, next);

      expect(mockJwtVerify).toHaveBeenCalledWith("cookie-token", SECRET);
      expect(req.user).toEqual({ id: "user123", email: "test@test.com", role: "admin" });
      expect(next).toHaveBeenCalled();
    });

    it("prefers Authorization header over authToken cookie", () => {
      req.cookies.authToken = "cookie-token";
      req.headers.authorization = "Bearer header-token";
      mockJwtVerify.mockReturnValue({ id: "header-user" });

      authenticateUser(req, res, next);

      expect(mockJwtVerify).toHaveBeenCalledWith("header-token", SECRET);
      expect(req.user.id).toBe("header-user");
    });
  });

  describe("response format", () => {
    it("sets email to null and role to user when not provided", () => {
      req.headers.authorization = "Bearer t";
      mockJwtVerify.mockReturnValue({ id: "u1" });

      authenticateUser(req, res, next);

      expect(req.user).toEqual({ id: "u1", email: null, role: "user" });
    });
  });

  describe("error handling", () => {
    it("returns 401 with INVALID_PAYLOAD when decoded has no id", () => {
      req.headers.authorization = "Bearer t";
      mockJwtVerify.mockReturnValue({ email: "no-id" });

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Invalid token payload",
        code: "INVALID_PAYLOAD",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 with TOKEN_EXPIRED when TokenExpiredError is thrown", () => {
      req.headers.authorization = "Bearer expired";
      const err = new Error("jwt expired");
      err.name = "TokenExpiredError";
      mockJwtVerify.mockImplementation(() => { throw err; });

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Token expired",
        code: "TOKEN_EXPIRED",
      });
    });

    it("returns 401 with INVALID_TOKEN when JsonWebTokenError is thrown", () => {
      req.headers.authorization = "Bearer bad";
      const err = new Error("invalid token");
      err.name = "JsonWebTokenError";
      mockJwtVerify.mockImplementation(() => { throw err; });

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Invalid token",
        code: "INVALID_TOKEN",
      });
    });

    it("returns 401 with AUTH_ERROR for unexpected errors", () => {
      req.headers.authorization = "Bearer t";
      mockJwtVerify.mockImplementation(() => { throw new Error("Unknown"); });

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Authentication failed",
        code: "AUTH_ERROR",
      });
    });
  });

  describe("JWT_ACCESS_SECRET fallback", () => {
    it("uses JWT_SECRET when JWT_ACCESS_SECRET is not set", () => {
      delete process.env.JWT_ACCESS_SECRET;
      process.env.JWT_SECRET = "fallback";
      req.headers.authorization = "Bearer t";
      mockJwtVerify.mockReturnValue({ id: "u1" });

      authenticateUser(req, res, next);

      expect(mockJwtVerify).toHaveBeenCalledWith("t", "fallback");
      expect(req.user.id).toBe("u1");
      process.env.JWT_ACCESS_SECRET = SECRET;
    });
  });
});
