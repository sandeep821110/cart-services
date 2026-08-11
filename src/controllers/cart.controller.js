import Cart from '../models/cart.model.js';
import logger from '../utils/logger.js';
import axios from 'axios';

/**
 * Add item to cart with proper image and _id storage
 */
const getProductBaseUrl = () =>
  (process.env.PRODUCT_SERVICE_URL || "http://localhost:5001").replace(/\/$/, "");

const fetchProduct = async (productId, authHeader) => {
  const headers = {};
  if (authHeader) headers.Authorization = authHeader;
  const tryPaths = [`/products/${productId}`, `/api/products/${productId}`, `/product/${productId}`];
  for (const p of tryPaths) {
    try {
      const resp = await axios.get(`${getProductBaseUrl()}${p}`, { headers, timeout: 5000 });
      if (resp?.data) {
        let product = resp.data.product ?? resp.data.data ?? resp.data;
        if (product?.data) product = product.data;
        if (Array.isArray(product) && product.length) product = product[0];
        if (product && (product._id || product.id)) return product;
      }
    } catch (err) {
      logger.debug(`fetch product failed for ${p}: ${err.message}`);
    }
  }
  return null;
};

export const addToCart = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { productId, size, quantity = 1 } = req.body;
    if (!productId) return res.status(400).json({ success: false, message: 'productId required' });

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });
    }

    const product = await fetchProduct(productId, req.headers?.authorization);
    if (!product) {
      logger.error('Product not found when fetching productId', { productId, PRODUCT_SERVICE_URL: process.env.PRODUCT_SERVICE_URL });
      return res.status(400).json({ success: false, message: 'Product not found' });
    }

    const price = product.discountPrice ?? product.price ?? product.unitPrice;
    const name = product.name || product.title;

    if (!name || price == null) {
      return res.status(400).json({ success: false, message: 'Product missing required fields (name or price)' });
    }

    const image =
      Array.isArray(product.images) && product.images.length
        ? [product.images[0]]
        : product.image
          ? [product.image]
          : [];

    const itemObj = {
      productId: product._id?.toString?.() ?? product.id?.toString?.() ?? productId,
      size: size || '',
      quantity: qty,
      name,
      price,
      image,
    };

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [itemObj] });
      await cart.save();
      return res.status(201).json({ success: true, data: cart });
    }

    const existing = cart.items.find(it => {
      const pid = it.productId?.toString?.() ?? it.product?.toString?.();
      if (!pid || pid !== itemObj.productId) return false;
      if (size && it.size !== size) return false;
      return true;
    });

    if (existing) {
      existing.quantity = (existing.quantity || 0) + itemObj.quantity;
      existing.price = itemObj.price;
      existing.name = itemObj.name;
      existing.image = existing.image?.length ? existing.image : itemObj.image;
    } else {
      cart.items.push(itemObj);
    }

    await cart.save();
    return res.status(200).json({ success: true, data: cart });
  } catch (err) {
    logger.error('addToCart error', { message: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Remove specific item from cart by _id
 */
export const removeFromCart = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { cartItemId } = req.params;
    const { productId } = req.body;

    if (!cartItemId) return res.status(400).json({ message: 'cartItemId is required' });

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    // support mongoose subdoc id lookup and plain array lookup
    const item = cart.items.id ? cart.items.id(cartItemId) : cart.items.find(i => i._id?.toString() === cartItemId);

    if (!item) return res.status(404).json({ message: 'Item not found in cart' });

    if (productId && item.product?.toString && item.product.toString() !== productId) {
        return res.status(400).json({ message: 'productId does not match the cart item' });
    }

    // remove the item
    if (cart.items.id) {
        item.remove();
    } else {
        cart.items = cart.items.filter(i => i._id?.toString() !== cartItemId);
    }

    await cart.save();
    return res.status(200).json({ message: 'Item removed', cart });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Remove item by productId (or productId+size). Compatible with routes using :productId
 */
export const removeItem = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { productId } = req.params;
    const { size } = req.body;

    if (!userId) return res.status(401).json({ success: false, message: 'User ID missing' });
    if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    // find matching item (match productId and optional size)
    const idx = cart.items.findIndex(it => {
      const pid = it.productId?.toString?.() ?? it.product?.toString?.();
      if (!pid || pid !== productId) return false;
      if (size && it.size !== size) return false;
      return true;
    });

    if (idx === -1) return res.status(404).json({ success: false, message: 'Item not found in cart' });

    cart.items.splice(idx, 1);
    await cart.save();

    return res.status(200).json({ success: true, message: 'Item removed', cart });
  } catch (error) {
    logger.error(`Error removing item: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update item quantity in cart
 */
export const updateCartItem = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { cartItemId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Quantity must be at least 1' 
      });
    }

    const cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const item = cart.items.find(item => item._id.toString() === cartItemId);

    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }

    item.quantity = quantity;
    await cart.save();

    logger.info(`Item quantity updated - cartItemId: ${cartItemId}, newQuantity: ${quantity}`);

    res.status(200).json({ 
      success: true, 
      message: 'Item quantity updated',
      item: {
        _id: item._id,
        quantity: item.quantity,
        subtotal: item.price * item.quantity
      },
      cart: {
        totalPrice: cart.totalPrice,
        totalQuantity: cart.totalQuantity
      }
    });
  } catch (error) {
    logger.error(`Error updating cart: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update item quantity by productId (or productId+size). Compatible with routes using :productId
 */
export const updateQuantity = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { productId } = req.params;
    const { quantity, size } = req.body;
    const qty = parseInt(quantity, 10);

    if (!userId) return res.status(401).json({ success: false, message: 'User ID missing' });
    if (!productId) return res.status(400).json({ success: false, message: 'productId is required' });
    if (isNaN(qty) || qty < 1) return res.status(400).json({ success: false, message: 'Quantity must be >= 1' });

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    const item = cart.items.find(it => {
      const pid = it.productId?.toString?.() ?? it.product?.toString?.();
      if (!pid || pid !== productId) return false;
      if (size && it.size !== size) return false;
      return true;
    });

    if (!item) return res.status(404).json({ success: false, message: 'Item not found in cart' });

    item.quantity = qty;
    await cart.save();

    return res.status(200).json({
      success: true,
      message: 'Item quantity updated',
      item: {
        _id: item._id,
        productId: item.productId ?? item.product,
        size: item.size,
        quantity: item.quantity,
        subtotal: item.price * item.quantity
      },
      cart: {
        totalPrice: cart.totalPrice,
        totalQuantity: cart.totalQuantity
      }
    });
  } catch (error) {
    logger.error(`Error updating quantity: ${error.message}`, { stack: error.stack });
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Clear entire cart
 */
export const clearCart = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    let cart = await Cart.findOne({ userId });
    if (!cart) {
        // create empty cart if none exists
        cart = new Cart({ userId, items: [] });
        await cart.save();
        return res.status(200).json({ message: 'Cart cleared', cart });
    }

    cart.items = [];
    await cart.save();
    return res.status(200).json({ message: 'Cart cleared', cart });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Get user's cart
 */
export const getCart = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) return res.status(400).json({ success: false, message: 'userId missing' });
    const cart = await Cart.findOne({ userId });
    return res.json({ success: true, data: cart });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Get cart by id
 */
export const getCartById = async (req, res) => {
  try {
    const { cartId } = req.params;
    if (!cartId) return res.status(400).json({ success: false, message: 'cartId is required' });

    const cart = await Cart.findById(cartId);
    if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

    // if authenticated, ensure the requester owns the cart
    const userId = req.user?.id || req.user?._id;
    if (userId && cart.userId && cart.userId.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    return res.status(200).json({ success: true, data: cart });
  } catch (err) {
    logger.error('getCartById error', { message: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Buy now - creates order directly via order service
 */
export const buyNow = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { items, address } = req.body;
    if (!items || !items.length) {
      return res.status(400).json({ success: false, message: 'No items in checkout' });
    }
    if (!address || typeof address !== "object") {
      return res.status(400).json({ success: false, message: 'Shipping address is required' });
    }

    const orderItems = [];
    for (const item of items) {
      if (!item?.productId) {
        return res.status(400).json({ success: false, message: 'productId is required for each item' });
      }
      const qty = parseInt(item.quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });
      }

      const product = await fetchProduct(item.productId, req.headers?.authorization);
      if (!product) {
        return res.status(400).json({ success: false, message: `Product ${item.productId} not found` });
      }

      const price = product.discountPrice ?? product.price ?? product.unitPrice;
      const name = product.name || product.title;
      if (price == null || !name) {
        return res.status(400).json({ success: false, message: `Product ${item.productId} missing required fields` });
      }

      orderItems.push({
        productId: product._id?.toString?.() ?? product.id?.toString?.() ?? item.productId,
        name,
        price,
        quantity: qty,
        size: item.size || '',
      });
    }

    const orderServiceUrl = process.env.ORDER_SERVICE_URL || 'http://localhost:7000';
    const headers = { Authorization: req.headers.authorization || '', 'Content-Type': 'application/json' };

    const orderPayload = {
      items: orderItems,
      shippingAddress: address,
      paymentMethod: 'pending',
    };

    const response = await axios.post(`${orderServiceUrl}/api/orders`, orderPayload, { headers, timeout: 10000 });
    const order = response.data?.order || response.data?.data || response.data;

    return res.status(200).json({
      success: true,
      message: 'Order created successfully',
      order,
    });
  } catch (error) {
    logger.error('buyNow error', { message: error.message, stack: error.stack });
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: error.response.data?.message || error.response.data?.error || 'Order service error',
      });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};