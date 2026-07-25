import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, type CartItem } from '../db/db';

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (productId: string) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  updateQuantity: (productId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const loadCart = async () => {
    const items = await db.cart.toArray();
    setCartItems(items);
  };

  useEffect(() => {
    loadCart();
  }, []);

  const addToCart = async (productId: string) => {
    const existing = await db.cart.where('productId').equals(productId).first();
    if (existing) {
      await db.cart.update(existing.id!, { quantity: existing.quantity + 1 });
    } else {
      await db.cart.add({ productId, quantity: 1 });
    }
    await loadCart();
  };

  const removeFromCart = async (productId: string) => {
    const existing = await db.cart.where('productId').equals(productId).first();
    if (existing) {
      await db.cart.delete(existing.id!);
    }
    await loadCart();
  };

  const updateQuantity = async (productId: string, quantity: number) => {
    const existing = await db.cart.where('productId').equals(productId).first();
    if (existing) {
      if (quantity <= 0) {
        await db.cart.delete(existing.id!);
      } else {
        await db.cart.update(existing.id!, { quantity });
      }
    }
    await loadCart();
  };

  const clearCart = async () => {
    await db.cart.clear();
    setCartItems([]);
  };

  return (
    <CartContext.Provider value={{ cartItems, addToCart, removeFromCart, updateQuantity, clearCart }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
