import * as repo from "../repositories/cart.repository.js";
import axios from "axios";
import redis from "../config/redis.js";
import Cart from "../models/cart.model.js";
import { configDotenv } from "dotenv";
import mongoose from "mongoose";
configDotenv();
const PRODUCT_URL = process.env.PRODUCT_SERVICE_URL;

export const getCart = async (userId) => {
  if (!userId) {
    throw new Error(
      "User ID is required. It must be passed from the controller to the service."
    );
  }
  const cache = await redis.get(`cart:${userId}`);
  if (cache) return JSON.parse(cache);

  const cart = await repo.findByUser(userId);

  await redis.set(`cart:${userId}`, JSON.stringify(cart), "EX", 60);

  return cart;
};

export const addToCart = async (userId, item) => {
  if (!userId) {
    throw new Error(
      "User ID is required. It must be passed from the controller to the service."
    );
  }

  const quantity = parseInt(item.quantity, 10);
  if (isNaN(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive number.");
  }

  let product;
  try {
    product = await fetchProduct(item.productId);
  } catch (error) {
    // rethrow or wrap so caller gets clear message
    throw error;
  }

  // If same productId + size exists, increment quantity atomically
  const incremented = await Cart.findOneAndUpdate(
    { userId, "items.productId": item.productId, "items.size": item.size },
    { $inc: { "items.$.quantity": quantity } },
    { new: true }
  ).exec();

  if (incremented) {
    await redis.del(`cart:${userId}`);
    return incremented;
  }

  // Build an _id for the cart item safely (always use `new` for ObjectId construction)
  let itemId;
  if (item._id && mongoose.isValidObjectId(item._id)) {
    itemId = typeof item._id === "string" ? new mongoose.Types.ObjectId(item._id) : item._id;
  } else if (product && product._id && mongoose.isValidObjectId(product._id)) {
    itemId = typeof product._id === "string" ? new mongoose.Types.ObjectId(product._id) : product._id;
  } else {
    itemId = new mongoose.Types.ObjectId();
  }

  const newItem = {
    _id: itemId,
    productId: item.productId,
    name: product.name,
    image: product.images && product.images.length > 0 ? [product.images[0]] : [],
    price: product.discountPrice,
    size: item.size,
    quantity: quantity,
  };

  const updatedCart = await Cart.findOneAndUpdate(
    { userId },
    { $push: { items: newItem }, $setOnInsert: { userId } },
    { new: true, upsert: true }
  ).exec();

  await redis.del(`cart:${userId}`);

  return updatedCart;
};

export const updateItem = async (userId, item) => {
  if (!userId) {
    throw new Error(
      "User ID is required. It must be passed from the controller to the service."
    );
  }

  const quantity = parseInt(item.quantity, 10);
  if (isNaN(quantity) || quantity < 0) {
    throw new Error("Quantity must be a non-negative number.");
  }

  if (quantity === 0) {
    return removeItem(userId, { productId: item.productId, size: item.size });
  }

  const updatedCart = await Cart.findOneAndUpdate(
    {
      userId,
      "items.productId": item.productId,
      "items.size": item.size,
    },
    { $set: { "items.$.quantity": quantity } },
    { new: true }
  ).exec();

  if (!updatedCart) {
    const cartExists = await repo.findByUser(userId);
    if (!cartExists) {
      throw new Error("Cart not found");
    } else {
      throw new Error("Item not found");
    }
  }

  await redis.del(`cart:${userId}`);

  return updatedCart;
};

export const removeItem = async (userId, item) => {
  if (!userId) {
    throw new Error(
      "User ID is required. It must be passed from the controller to the service."
    );
  }
  if (!item || !item.productId) {
    throw new Error("Product ID is required");
  }

  try {
    const pullCondition = {
      productId: item.productId,
      size: item.size,
    };

    const updatedCart = await Cart.findOneAndUpdate(
      { userId, "items.productId": item.productId, "items.size": item.size },
      { $pull: { items: pullCondition } },
      { new: true }
    ).exec();

    if (!updatedCart) {
      const cartExists = await repo.findByUser(userId);
      if (!cartExists) {
        throw new Error("Cart not found for user");
      }
      throw new Error(`Item with productId ${item.productId} not found in cart`);
    }

    await redis.del(`cart:${userId}`);

    if (updatedCart.items.length === 0) {
      await repo.clear(userId);
      await redis.del(`cart:${userId}`);
      return null;
    }

    console.log(`Item removed from cart for user ${userId}:`, { productId: item.productId, size: item.size });
    return updatedCart;
  } catch (error) {
    console.error(`Error removing item from cart for user ${userId}:`, error);
    throw error;
  }
};

export const clearCart = async (userId) => {
  if (!userId) {
    throw new Error(
      "User ID is required. It must be passed from the controller to the service."
    );
  }

  try {
    const result = await repo.clear(userId);
    await redis.del(`cart:${userId}`);
    console.log(`Cart successfully cleared for user ${userId}`);
    return result || null;
  } catch (error) {
    console.error(`Error clearing cart for user ${userId}:`, error);
    throw error;
  }
};

export const removeItemById = async (userId, cartItemId) => {
  if (!userId) throw new Error("User ID is required");
  if (!cartItemId) throw new Error("cartItemId is required");

  if (!mongoose.Types.ObjectId.isValid(cartItemId)) {
    throw new Error("Invalid cartItemId");
  }
  const id = new mongoose.Types.ObjectId(cartItemId);

  const updatedCart = await Cart.findOneAndUpdate(
    { userId },
    { $pull: { items: { _id: id } } },
    { new: true }
  ).exec();

  if (!updatedCart) {
    const cartExists = await repo.findByUser(userId);
    if (!cartExists) throw new Error("Cart not found for user");
    throw new Error("Item not found in cart");
  }

  await redis.del(`cart:${userId}`);

  if (updatedCart.items.length === 0) {
    await repo.clear(userId);
    await redis.del(`cart:${userId}`);
    return null;
  }

  return updatedCart;
};

const fetchProduct = async (productId) => {
  if (!productId) throw new Error("productId is required");
  const urls = [PRODUCT_URL].filter(Boolean);
  const uniqueUrls = [...new Set(urls)];
  for (const baseUrl of uniqueUrls) {
    try {
      const res = await axios.get(`${baseUrl}/api/products/${productId}`, { timeout: 5000 });
      const product = res.data?.data ?? res.data;
      if (product) return product;
    } catch (err) {
      if (err.response && err.response.status === 404) throw new Error(`Product ${productId} not found`);
    }
  }
  throw new Error("Product service is unavailable");
};
