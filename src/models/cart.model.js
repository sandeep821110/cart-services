import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    image: {
      type: [String],
      required: false,
      default: []
    },
    size: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1
    }
  },
  { timestamps: true }
);

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    items: [cartItemSchema],
    totalPrice: {
      type: Number,
      default: 0,
      min: 0
    },
    totalQuantity: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  { timestamps: true }
);

// Middleware to calculate totals before saving
cartSchema.pre('save', function(next) {
  this.totalPrice = this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  this.totalQuantity = this.items.reduce((sum, item) => sum + item.quantity, 0);
  next();
});

export default mongoose.models.Cart || mongoose.model('Cart', cartSchema);