import express from 'express';
import { addToCart, getCart, clearCart, removeItem, updateQuantity, getCartById, buyNow } from '../controllers/cart.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';

const router = express.Router();

// fetch cart by cartId
router.get('/:cartId', authenticateUser, getCartById);

// Add item to cart
router.post('/add', authenticateUser, addToCart);

// Update quantity by productId (optionally include size in body)
router.put('/update/:productId', authenticateUser, updateQuantity);

// Remove item by productId (optionally include size in body)
router.delete('/remove/:productId', authenticateUser, removeItem);

// Get user's cart
router.get('/', authenticateUser, getCart);

// Clear entire cart
router.delete('/clear', authenticateUser, clearCart);

// Buy now - create order from cart items
router.post('/buy-now', authenticateUser, buyNow);

export default router;