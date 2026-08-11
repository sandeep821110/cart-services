import { jest } from "@jest/globals";

const mockCartModel = jest.fn();
const mockAxiosGet = jest.fn();
const mockAxiosPost = jest.fn();

jest.unstable_mockModule("../models/cart.model.js", () => ({
  default: mockCartModel,
}));

jest.unstable_mockModule("axios", () => ({
  default: {
    get: mockAxiosGet,
    post: mockAxiosPost,
  },
}));

jest.unstable_mockModule("../utils/logger.js", () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const {
  addToCart,
  getCart,
  clearCart,
  removeItem,
  updateQuantity,
  getCartById,
  removeFromCart,
  updateCartItem,
  buyNow,
} = await import("./cart.controller.js");
const Cart = (await import("../models/cart.model.js")).default;

const productResponse = (product) => ({ data: { product } });

const product = {
  _id: "prod123",
  name: "Test Product",
  price: 100,
  discountPrice: 80,
  images: ["img1.jpg"],
};

describe("Cart Controller", () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    Cart.findOne = jest.fn();
    Cart.findById = jest.fn();
    Cart.create = jest.fn();
    mockAxiosGet.mockResolvedValue(productResponse(product));

    req = {
      user: { id: "user123" },
      body: {},
      params: {},
      headers: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe("addToCart", () => {
    beforeEach(() => {
      req.body = { productId: "prod123", quantity: 1 };
    });

    it("returns 401 if user is not authenticated", async () => {
      req.user = null;
      await addToCart(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Unauthorized" });
    });

    it("returns 400 if productId is not provided", async () => {
      req.body.productId = undefined;
      await addToCart(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "productId required" });
    });

    it("returns 400 if product is not found", async () => {
      mockAxiosGet.mockResolvedValue({ data: { product: null } });

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Product not found" });
    });

    it("does not trust client-supplied price or extra fields", async () => {
      req.body = { productId: "prod123", quantity: 1, price: 0.01, name: "Hacked", evilField: "x" };

      const mockCart = {
        userId: "user123",
        items: [],
        save: jest.fn().mockResolvedValue(true),
      };
      mockCart.items.find = jest.fn().mockReturnValue(undefined);
      mockCart.items.push = jest.fn();
      Cart.findOne.mockResolvedValue(mockCart);

      await addToCart(req, res);

      expect(mockCart.items.push).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: "prod123",
          name: "Test Product",
          price: 80,
          quantity: 1,
        })
      );
      expect(mockCart.items.push).toHaveBeenCalledWith(
        expect.not.objectContaining({ price: 0.01, name: "Hacked", evilField: "x" })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("creates a new cart if one does not exist", async () => {
      Cart.findOne.mockResolvedValue(null);
      const mockCartInstance = {
        userId: "user123",
        items: [],
        save: jest.fn().mockResolvedValue(true),
      };
      mockCartModel.mockImplementation(() => mockCartInstance);

      await addToCart(req, res);

      expect(mockCartInstance.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockCartInstance });
    });

    it("adds a new item to an existing cart", async () => {
      const mockCart = {
        userId: "user123",
        items: [],
        save: jest.fn().mockResolvedValue(true),
      };
      mockCart.items.find = jest.fn().mockReturnValue(undefined);
      mockCart.items.push = jest.fn();
      Cart.findOne.mockResolvedValue(mockCart);

      await addToCart(req, res);

      expect(mockCart.items.push).toHaveBeenCalledWith(expect.objectContaining({ productId: "prod123" }));
      expect(mockCart.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("updates quantity of an existing item", async () => {
      const existingItem = { productId: "prod123", quantity: 1, price: 80, name: "Test Product" };
      const mockCart = {
        userId: "user123",
        items: [existingItem],
        save: jest.fn().mockResolvedValue(true),
      };
      mockCart.items.find = jest.fn().mockReturnValue(existingItem);
      Cart.findOne.mockResolvedValue(mockCart);
      req.body.quantity = 2;

      await addToCart(req, res);

      expect(existingItem.quantity).toBe(3);
      expect(mockCart.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("handles errors gracefully", async () => {
      Cart.findOne.mockRejectedValue(new Error("DB error"));
      req.body = { productId: "p1" };

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "DB error" });
    });
  });

  describe("removeItem", () => {
    beforeEach(() => {
      req.params = { productId: "prod123" };
    });

    it("returns 401 if user ID is missing", async () => {
      req.user = null;
      await removeItem(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "User ID missing" });
    });

    it("does not trust the x-user-id header", async () => {
      req.headers["x-user-id"] = "victim-user";
      req.user = { id: "attacker-user" };
      const mockCart = { userId: "attacker-user", items: [], save: jest.fn() };
      Cart.findOne.mockResolvedValue(mockCart);
      mockCart.items.findIndex = jest.fn().mockReturnValue(-1);

      await removeItem(req, res);

      expect(Cart.findOne).toHaveBeenCalledWith({ userId: "attacker-user" });
      expect(Cart.findOne).not.toHaveBeenCalledWith({ userId: "victim-user" });
    });

    it("returns 404 if cart is not found", async () => {
      Cart.findOne.mockResolvedValue(null);
      await removeItem(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Cart not found" });
    });

    it("removes an item from the cart", async () => {
      const itemToRemove = { productId: "prod123" };
      const otherItem = { productId: "prod456" };
      const mockCart = {
        userId: "user123",
        items: [itemToRemove, otherItem],
        save: jest.fn().mockResolvedValue(true),
      };
      Cart.findOne.mockResolvedValue(mockCart);

      await removeItem(req, res);

      expect(mockCart.items.length).toBe(1);
      expect(mockCart.items[0]).toBe(otherItem);
      expect(mockCart.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("returns 404 if item not found in cart", async () => {
      const mockCart = {
        userId: "user123",
        items: [{ productId: "other" }],
        save: jest.fn(),
      };
      Cart.findOne.mockResolvedValue(mockCart);

      await removeItem(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Item not found in cart" });
    });

    it("handles errors gracefully", async () => {
      Cart.findOne.mockRejectedValue(new Error("DB error"));

      await removeItem(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("removeFromCart", () => {
    beforeEach(() => {
      req.params = { cartItemId: "itemId1" };
    });

    it("returns 400 if cartItemId is missing", async () => {
      req.params = {};
      await removeFromCart(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "cartItemId is required" });
    });

    it("returns 404 if cart not found", async () => {
      Cart.findOne.mockResolvedValue(null);
      await removeFromCart(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Cart not found" });
    });

    it("removes item from cart", async () => {
      const mockCart = {
        userId: "user123",
        items: [
          { _id: "itemId1", productId: "p1" },
          { _id: "itemId2", productId: "p2" },
        ],
        save: jest.fn().mockResolvedValue(true),
      };
      Cart.findOne.mockResolvedValue(mockCart);

      await removeFromCart(req, res);

      expect(mockCart.items).toHaveLength(1);
      expect(mockCart.items[0].productId).toBe("p2");
      expect(mockCart.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("handles errors gracefully", async () => {
      Cart.findOne.mockRejectedValue(new Error("DB error"));

      await removeFromCart(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateQuantity", () => {
    beforeEach(() => {
      req.params = { productId: "prod123" };
      req.body = { quantity: 2 };
    });

    it("returns 400 if quantity is invalid", async () => {
      req.body.quantity = 0;
      await updateQuantity(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Quantity must be >= 1" });
    });

    it("updates item quantity", async () => {
      const itemToUpdate = { productId: "prod123", quantity: 1, price: 10 };
      const mockCart = {
        userId: "user123",
        items: [itemToUpdate],
        save: jest.fn().mockResolvedValue(true),
      };
      mockCart.items.find = jest.fn().mockReturnValue(itemToUpdate);
      Cart.findOne.mockResolvedValue(mockCart);

      await updateQuantity(req, res);

      expect(itemToUpdate.quantity).toBe(2);
      expect(mockCart.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("returns 401 if user ID is missing", async () => {
      req.user = null;
      await updateQuantity(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("does not trust the x-user-id header", async () => {
      req.headers["x-user-id"] = "victim-user";
      req.user = { id: "attacker-user" };
      const mockCart = { userId: "attacker-user", items: [], save: jest.fn() };
      Cart.findOne.mockResolvedValue(mockCart);
      mockCart.items.find = jest.fn().mockReturnValue(undefined);

      await updateQuantity(req, res);

      expect(Cart.findOne).toHaveBeenCalledWith({ userId: "attacker-user" });
      expect(Cart.findOne).not.toHaveBeenCalledWith({ userId: "victim-user" });
    });

    it("returns 404 if cart not found", async () => {
      Cart.findOne.mockResolvedValue(null);
      await updateQuantity(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("returns 404 if item not found in cart", async () => {
      const mockCart = { userId: "user123", items: [], save: jest.fn() };
      mockCart.items.find = jest.fn().mockReturnValue(undefined);
      Cart.findOne.mockResolvedValue(mockCart);

      await updateQuantity(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("handles errors gracefully", async () => {
      Cart.findOne.mockRejectedValue(new Error("DB error"));

      await updateQuantity(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("updateCartItem", () => {
    beforeEach(() => {
      req.params = { cartItemId: "itemId1" };
      req.body = { quantity: 3 };
    });

    it("returns 400 if quantity is missing or less than 1", async () => {
      req.body = {};
      await updateCartItem(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Quantity must be at least 1",
      });
    });

    it("returns 404 if cart not found", async () => {
      Cart.findOne.mockResolvedValue(null);
      await updateCartItem(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("returns 404 if item not found in cart", async () => {
      const mockCart = {
        userId: "user123",
        items: [],
        save: jest.fn(),
      };
      mockCart.items.find = jest.fn().mockReturnValue(undefined);
      Cart.findOne.mockResolvedValue(mockCart);

      await updateCartItem(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("updates item quantity and returns subtotal", async () => {
      const item = { _id: "itemId1", price: 50, quantity: 1 };
      const mockCart = {
        userId: "user123",
        items: [item],
        save: jest.fn().mockResolvedValue(true),
        totalPrice: 150,
        totalQuantity: 3,
      };
      mockCart.items.find = jest.fn().mockReturnValue(item);
      Cart.findOne.mockResolvedValue(mockCart);

      await updateCartItem(req, res);

      expect(item.quantity).toBe(3);
      expect(mockCart.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Item quantity updated",
        item: { _id: "itemId1", quantity: 3, subtotal: 150 },
        cart: { totalPrice: 150, totalQuantity: 3 },
      });
    });

    it("handles errors gracefully", async () => {
      Cart.findOne.mockRejectedValue(new Error("DB error"));

      await updateCartItem(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("clearCart", () => {
    it("clears an existing cart", async () => {
      const mockCart = {
        userId: "user123",
        items: [{ productId: "prod123" }],
        save: jest.fn().mockResolvedValue(true),
      };
      Cart.findOne.mockResolvedValue(mockCart);

      await clearCart(req, res);

      expect(mockCart.items.length).toBe(0);
      expect(mockCart.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("creates empty cart if none exists", async () => {
      Cart.findOne.mockResolvedValue(null);
      const newCart = { userId: "user123", items: [], save: jest.fn().mockResolvedValue(true) };
      Cart.mockImplementation(() => newCart);

      await clearCart(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("handles errors gracefully", async () => {
      Cart.findOne.mockRejectedValue(new Error("DB error"));

      await clearCart(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getCart", () => {
    it("returns the user cart if found", async () => {
      const mockCart = { userId: "user123", items: [] };
      Cart.findOne.mockResolvedValue(mockCart);
      await getCart(req, res);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockCart });
    });

    it("returns 400 if userId is missing", async () => {
      req.user = null;
      await getCart(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "userId missing" });
    });

    it("handles errors gracefully", async () => {
      Cart.findOne.mockRejectedValue(new Error("DB error"));

      await getCart(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("getCartById", () => {
    beforeEach(() => {
      req.params = { cartId: "cart123" };
    });

    it("returns 400 if cartId is missing", async () => {
      req.params = {};
      await getCartById(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "cartId is required" });
    });

    it("returns 404 if cart not found", async () => {
      Cart.findById.mockResolvedValue(null);
      await getCartById(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Cart not found" });
    });

    it("returns 403 if authenticated user does not own the cart", async () => {
      const mockCart = { _id: "cart123", userId: "anotherUser" };
      Cart.findById.mockResolvedValue(mockCart);
      await getCartById(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Forbidden" });
    });

    it("returns cart if authenticated user owns it", async () => {
      const mockCart = { _id: "cart123", userId: "user123" };
      Cart.findById.mockResolvedValue(mockCart);
      await getCartById(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("handles errors gracefully", async () => {
      Cart.findById.mockRejectedValue(new Error("DB error"));

      await getCartById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("buyNow", () => {
    const orderData = {
      items: [{ productId: "p1", quantity: 1, size: "M" }],
      address: { line1: "123 Main St" },
    };

    beforeEach(() => {
      req.body = orderData;
    });

    it("returns 401 if user is not authenticated", async () => {
      req.user = null;
      await buyNow(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Unauthorized" });
    });

    it("returns 400 if no items provided", async () => {
      req.body = { items: [] };
      await buyNow(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "No items in checkout" });
    });

    it("returns 400 if shipping address is missing", async () => {
      req.body = { items: [{ productId: "p1", quantity: 1 }] };
      await buyNow(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Shipping address is required" });
    });

    it("returns 400 if a product cannot be found", async () => {
      mockAxiosGet.mockResolvedValue({ data: { product: null } });
      await buyNow(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Product p1 not found" });
    });

    it("creates order via order service using server-side prices", async () => {
      const order = { _id: "order123", status: "pending" };
      mockAxiosPost.mockResolvedValue({ data: { order } });
      req.headers.authorization = "Bearer token";

      await buyNow(req, res);

      const postCall = mockAxiosPost.mock.calls[0];
      expect(postCall[0]).toContain("/api/orders");
      const payload = postCall[1];
      expect(payload.items[0]).toMatchObject({
        productId: "prod123",
        name: "Test Product",
        price: 80,
        quantity: 1,
        size: "M",
      });
      expect(payload.shippingAddress).toEqual({ line1: "123 Main St" });
      expect(postCall[2].headers.Authorization).toBe("Bearer token");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Order created successfully",
        order,
      });
    });

    it("ignores client-supplied lower prices in the order payload", async () => {
      req.body = {
        items: [{ productId: "p1", quantity: 1, price: 0.01 }],
        address: { line1: "123 Main St" },
      };
      mockAxiosPost.mockResolvedValue({ data: { order: {} } });

      await buyNow(req, res);

      const payload = mockAxiosPost.mock.calls[0][1];
      expect(payload.items[0].price).toBe(80);
    });

    it("handles order service error response", async () => {
      const axiosErr = new Error("Bad request");
      axiosErr.response = { status: 400, data: { message: "Invalid address" } };
      mockAxiosPost.mockRejectedValue(axiosErr);

      await buyNow(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Invalid address",
      });
    });

    it("handles network errors gracefully", async () => {
      mockAxiosPost.mockRejectedValue(new Error("Service unreachable"));

      await buyNow(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Service unreachable" });
    });
  });
});
