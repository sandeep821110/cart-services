import { jest } from '@jest/globals';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();

jest.unstable_mockModule('express', () => ({
  default: {
    Router: () => ({
        get: mockGet,
        post: mockPost,
        put: mockPut,
        delete: mockDelete,
    }),
  },
}));

const mockAddToCart = jest.fn();
const mockGetCart = jest.fn();
const mockClearCart = jest.fn();
const mockRemoveItem = jest.fn();
const mockUpdateQuantity = jest.fn();
const mockGetCartById = jest.fn();

jest.unstable_mockModule('../controllers/cart.controller.js', () => ({
    addToCart: mockAddToCart,
    getCart: mockGetCart,
    clearCart: mockClearCart,
    removeItem: mockRemoveItem,
    updateQuantity: mockUpdateQuantity,
    getCartById: mockGetCartById,
}));

const mockAuthenticateUser = jest.fn();

jest.unstable_mockModule('../middleware/auth.middleware.js', () => ({
    authenticateUser: mockAuthenticateUser,
}));

// Import the router file after the mocks have been defined.
// This will execute the file and set up the routes on our mock router.
await import('./cart.routes.js');

describe('Cart Routes', () => {
    it('should configure the GET /:cartId route', () => {
        expect(mockGet).toHaveBeenCalledWith('/:cartId', mockAuthenticateUser, mockGetCartById);
    });

    it('should configure the POST /add route', () => {
        expect(mockPost).toHaveBeenCalledWith('/add', mockAuthenticateUser, mockAddToCart);
    });

    it('should configure the PUT /update/:productId route', () => {
        expect(mockPut).toHaveBeenCalledWith('/update/:productId', mockAuthenticateUser, mockUpdateQuantity);
    });

    it('should configure the DELETE /remove/:productId route', () => {
        expect(mockDelete).toHaveBeenCalledWith('/remove/:productId', mockAuthenticateUser, mockRemoveItem);
    });

    it('should configure the GET / route', () => {
        expect(mockGet).toHaveBeenCalledWith('/', mockAuthenticateUser, mockGetCart);
    });

    it('should configure the DELETE /clear route', () => {
        expect(mockDelete).toHaveBeenCalledWith('/clear', mockAuthenticateUser, mockClearCart);
    });
});
