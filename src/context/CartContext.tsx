import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, type CartItem, type ProductSize, type ColorVariant } from '../db/db';

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (productId: string, selectedSize?: ProductSize, selectedVariant?: ColorVariant) => Promise<void>;
  removeFromCart: (productId: string, selectedSize?: ProductSize, selectedVariant?: ColorVariant) => Promise<void>;
  updateQuantity: (productId: string, quantity: number, selectedSize?: ProductSize, selectedVariant?: ColorVariant) => Promise<void>;
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

  const addToCart = async (productId: string, selectedSize?: ProductSize, selectedVariant?: ColorVariant) => {
    const existing = await db.cart.toArray();
    const match = existing.find(item =>
      item.productId === productId &&
      (!selectedSize || (item.selectedSize && item.selectedSize.size === selectedSize.size)) &&
      (!selectedVariant || (item.selectedVariant && item.selectedVariant.id === selectedVariant.id)) &&
      // If no variant selected, also match items with no variant
      (selectedVariant !== undefined || !item.selectedVariant)
    );

    if (match) {
      await db.cart.update(match.id!, { quantity: match.quantity + 1 });
    } else {
      await db.cart.add({ productId, quantity: 1, selectedSize, selectedVariant });
    }
    await loadCart();
  };

  const removeFromCart = async (productId: string, selectedSize?: ProductSize, selectedVariant?: ColorVariant) => {
    const existing = await db.cart.toArray();
    const match = existing.find(item =>
      item.productId === productId &&
      (!selectedSize || (item.selectedSize && item.selectedSize.size === selectedSize.size)) &&
      (selectedVariant ? (item.selectedVariant && item.selectedVariant.id === selectedVariant.id) : !item.selectedVariant)
    );
    if (match) {
      await db.cart.delete(match.id!);
    }
    await loadCart();
  };

  const updateQuantity = async (productId: string, quantity: number, selectedSize?: ProductSize, selectedVariant?: ColorVariant) => {
    const existing = await db.cart.toArray();
    const match = existing.find(item =>
      item.productId === productId &&
      (!selectedSize || (item.selectedSize && item.selectedSize.size === selectedSize.size)) &&
      (selectedVariant ? (item.selectedVariant && item.selectedVariant.id === selectedVariant.id) : !item.selectedVariant)
    );
    if (match) {
      if (quantity <= 0) {
        await db.cart.delete(match.id!);
      } else {
        await db.cart.update(match.id!, { quantity });
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
