import { jest } from "@jest/globals";

const mockAddToCart = jest.fn();
const mockGetCart = jest.fn();
const mockClearCart = jest.fn();
const mockRemoveItem = jest.fn();
const mockUpdateQuantity = jest.fn();
const mockGetCartById = jest.fn();
const mockBuyNow = jest.fn();

jest.unstable_mockModule("../controllers/cart.controller.js", () => ({
  addToCart: mockAddToCart,
  getCart: mockGetCart,
  clearCart: mockClearCart,
  removeItem: mockRemoveItem,
  updateQuantity: mockUpdateQuantity,
  getCartById: mockGetCartById,
  buyNow: mockBuyNow,
}));

const mockAuthenticateUser = jest.fn();

jest.unstable_mockModule("../middleware/auth.middleware.js", () => ({
  authenticateUser: mockAuthenticateUser,
}));

let routeStack;

beforeAll(async () => {
  const mod = await import("../routes/cart.routes.js");
  routeStack = mod.default.stack;
});

describe("Cart Routes", () => {
  it("has 7 routes registered", () => {
    expect(routeStack).toHaveLength(7);
  });

  it("registers GET /:cartId with authenticateUser and getCartById", () => {
    const layer = routeStack[0];
    expect(layer.route.methods).toMatchObject({ get: true });
    expect(layer.route.path).toBe("/:cartId");
    expect(layer.route.stack.some(l => l.handle === mockGetCartById)).toBe(true);
  });

  it("registers POST /add with authenticateUser and addToCart", () => {
    const layer = routeStack[1];
    expect(layer.route.methods).toMatchObject({ post: true });
    expect(layer.route.path).toBe("/add");
    expect(layer.route.stack.some(l => l.handle === mockAddToCart)).toBe(true);
  });

  it("registers PUT /update/:productId with authenticateUser and updateQuantity", () => {
    const layer = routeStack[2];
    expect(layer.route.methods).toMatchObject({ put: true });
    expect(layer.route.path).toBe("/update/:productId");
    expect(layer.route.stack.some(l => l.handle === mockUpdateQuantity)).toBe(true);
  });

  it("registers DELETE /remove/:productId with authenticateUser and removeItem", () => {
    const layer = routeStack[3];
    expect(layer.route.methods).toMatchObject({ delete: true });
    expect(layer.route.path).toBe("/remove/:productId");
    expect(layer.route.stack.some(l => l.handle === mockRemoveItem)).toBe(true);
  });

  it("registers GET / with authenticateUser and getCart", () => {
    const layer = routeStack[4];
    expect(layer.route.methods).toMatchObject({ get: true });
    expect(layer.route.path).toBe("/");
    expect(layer.route.stack.some(l => l.handle === mockGetCart)).toBe(true);
  });

  it("registers DELETE /clear with authenticateUser and clearCart", () => {
    const layer = routeStack[5];
    expect(layer.route.methods).toMatchObject({ delete: true });
    expect(layer.route.path).toBe("/clear");
    expect(layer.route.stack.some(l => l.handle === mockClearCart)).toBe(true);
  });

  it("registers POST /buy-now with authenticateUser and buyNow", () => {
    const layer = routeStack[6];
    expect(layer.route.methods).toMatchObject({ post: true });
    expect(layer.route.path).toBe("/buy-now");
    expect(layer.route.stack.some(l => l.handle === mockBuyNow)).toBe(true);
  });

  it("uses authenticateUser middleware on all routes", () => {
    for (const layer of routeStack) {
      const handlers = layer.route.stack.map(l => l.handle);
      expect(handlers).toContain(mockAuthenticateUser);
    }
  });
});
