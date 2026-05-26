import { jest } from '@jest/globals';

const mockCartModel = jest.fn();
const mockGetProductById = jest.fn();
const mockFetchProduct = jest.fn();
const mockAxiosGet = jest.fn();

jest.unstable_mockModule('../models/cart.model.js', () => ({
  default: mockCartModel,
}));

jest.unstable_mockModule('../services/cart.service.js', () => ({
  getProductById: mockGetProductById,
  fetchProduct: mockFetchProduct,
}));

jest.unstable_mockModule('axios', () => ({
  default: {
    get: mockAxiosGet,
  },
}));

const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerDebug = jest.fn();

jest.unstable_mockModule('../utils/logger.js', () => ({
  default: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    debug: mockLoggerDebug,
  },
}));

const {
  addToCart,
  getCart,
  clearCart,
  removeItem,
  updateQuantity,
  getCartById,
} = await import('./cart.controller.js');
const Cart = (await import('../models/cart.model.js')).default;

describe('Cart Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();
    Cart.findOne = jest.fn();
    Cart.findById = jest.fn();

    req = {
      user: { id: 'user123' },
      body: {},
      params: {},
      headers: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('addToCart', () => {
    const product = { _id: 'prod123', name: 'Test Product', price: 100 };

    beforeEach(() => {
      req.body = { productId: 'prod123', quantity: 1 };
      mockGetProductById.mockResolvedValue(null);
      mockFetchProduct.mockResolvedValue(product);
    });

    it('should return 401 if user is not authenticated', async () => {
      req.user = null;
      await addToCart(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Unauthorized' });
    });

    it('should return 400 if productId is not provided', async () => {
      req.body.productId = undefined;
      await addToCart(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'productId required' });
    });

    it('should return 400 if product is not found', async () => {
      mockGetProductById.mockResolvedValue(null);
      mockFetchProduct.mockResolvedValue(null);

      await addToCart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Product not found' });
    });

    it('should create a new cart if one does not exist', async () => {
      Cart.findOne.mockResolvedValue(null);
      const mockCartInstance = {
        userId: 'user123',
        items: [],
        save: jest.fn().mockResolvedValue(true),
      };
      mockCartModel.mockImplementation(() => mockCartInstance);

      await addToCart(req, res);

      expect(mockCartInstance.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockCartInstance });
    });

    it('should add a new item to an existing cart', async () => {
      const mockCart = {
        userId: 'user123',
        items: [],
        save: jest.fn().mockResolvedValue(true),
      };
      mockCart.items.find = jest.fn().mockReturnValue(undefined);
      mockCart.items.push = jest.fn();
      Cart.findOne.mockResolvedValue(mockCart);

      await addToCart(req, res);

      expect(mockCart.items.push).toHaveBeenCalledWith(expect.objectContaining({ productId: 'prod123' }));
      expect(mockCart.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should update quantity of an existing item', async () => {
      const existingItem = { productId: 'prod123', quantity: 1, price: 100, name: 'Test Product' };
      const mockCart = {
        userId: 'user123',
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
  });

  describe('removeItem', () => {
    beforeEach(() => {
      req.params = { productId: 'prod123' };
    });

    it('should return 401 if user ID is missing', async () => {
      req.user = null;
      req.headers = {};
      await removeItem(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'User ID missing' });
    });

    it('should return 404 if cart is not found', async () => {
      Cart.findOne.mockResolvedValue(null);
      await removeItem(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Cart not found' });
    });

    it('should remove an item from the cart', async () => {
      const itemToRemove = { productId: 'prod123' };
      const otherItem = { productId: 'prod456' };
      const mockCart = {
        userId: 'user123',
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
  });

  describe('updateQuantity', () => {
    beforeEach(() => {
      req.params = { productId: 'prod123' };
      req.body = { quantity: 2 };
    });

    it('should return 400 if quantity is invalid', async () => {
      req.body.quantity = 0;
      await updateQuantity(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Quantity must be >= 1' });
    });

    it('should update item quantity', async () => {
      const itemToUpdate = { productId: 'prod123', quantity: 1, price: 10 };
      const mockCart = {
        userId: 'user123',
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
  });

  describe('clearCart', () => {
    it('should clear an existing cart', async () => {
      const mockCart = {
        userId: 'user123',
        items: [{ productId: 'prod123' }],
        save: jest.fn().mockResolvedValue(true),
      };
      Cart.findOne.mockResolvedValue(mockCart);

      await clearCart(req, res);

      expect(mockCart.items.length).toBe(0);
      expect(mockCart.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getCart', () => {
    it('should return the user cart if found', async () => {
      const mockCart = { userId: 'user123', items: [] };
      Cart.findOne.mockResolvedValue(mockCart);
      await getCart(req, res);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockCart });
    });
  });

  describe('getCartById', () => {
    beforeEach(() => {
      req.params = { cartId: 'cart123' };
    });

    it('should return 403 if authenticated user does not own the cart', async () => {
      const mockCart = { _id: 'cart123', userId: 'anotherUser' };
      Cart.findById.mockResolvedValue(mockCart);
      await getCartById(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Forbidden' });
    });
  });
});
