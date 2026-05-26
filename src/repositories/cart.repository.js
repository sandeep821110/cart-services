import Cart from "../models/cart.model.js";

export const findByUser = (userId) =>
  Cart.findOne({ userId }).exec();

export const create = (data) =>
  Cart.create(data);

export const update = (userId, data) =>
  Cart.findOneAndUpdate({ userId }, data, { new: true }).exec();

export const clear = (userId) =>
  Cart.findOneAndDelete({ userId }).exec();