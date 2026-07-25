import Dexie, { type Table } from 'dexie';

export interface User {
  id?: number;
  phone: string;
  pinHash: string;
  name: string;
  createdAt: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  imageUrl: string;
  category: string;
  stock: number;
  discount?: number; // Discount percentage (e.g., 10 for 10% off)
  isFestiveDiscount?: boolean; // True if active
  festiveName?: string; // Specific Indian Festival name
  deliveryCharge?: number; // Product-specific delivery charge
  safetyFee?: number; // Product-specific safety fee
  isActive?: boolean; // Active/Inactive toggle
  reviews?: Array<{ reviewerName: string; rating: number; comment: string; createdAt: number }>;
}

export interface CartItem {
  id?: number;
  productId: string;
  quantity: number;
}

export interface Order {
  id?: number;
  items: {
    productId: string;
    quantity: number;
    priceAtPurchase: number;
  }[];
  totalAmount: number;
  status: 'pending_sync' | 'synced';
  shippingInfo: {
    fullName: string;
    phone: string;
    address: string;
    country: string;
    city: string;
    state: string;
    pincode: string;
  };
  summary: {
    subtotal: number;
    discountSaved: number;
    cgst: number;
    sgst: number;
    delivery: number;
    packaging: number;
    safety: number;
  };
  createdAt: number;
  receiptId?: string; // KRP-{{random12digitnumber}}
}

class OfflineEcommerceDB extends Dexie {
  users!: Table<User, number>;
  products!: Table<Product, string>;
  cart!: Table<CartItem, number>;
  orders!: Table<Order, number>;

  constructor() {
    super('OfflineEcommerceDB');
    this.version(1).stores({
      users: '++id, &phone',
      products: 'id, category',
      cart: '++id, productId',
      orders: '++id, status'
    });
  }
}

export const db = new OfflineEcommerceDB();

// Clean up legacy products and delete default items on startup
db.open().then(async () => {
  const allowedCategories = ['Saree', 'Dress', 'Kurti', 'Salwar Suit', 'Jackets'];
  const allProds = await db.products.toArray();
  
  // Delete legacy products
  const invalidProdIds = allProds
    .filter(p => !allowedCategories.includes(p.category))
    .map(p => p.id);
  
  if (invalidProdIds.length > 0) {
    await db.products.bulkDelete(invalidProdIds);
    console.log(`Cleaned up ${invalidProdIds.length} legacy products.`);
  }

  // Delete default seed products if they exist
  const defaultIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
  await db.products.bulkDelete(defaultIds);
  console.log("Cleared default seed products.");

  // Pre-register Admin accounts if they do not exist
  const admins = ['7890784816', '7059782504'];
  const pinHash = await (async () => {
    const msgBuffer = new TextEncoder().encode('014301');
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  })();

  for (const phone of admins) {
    const existing = await db.users.where('phone').equals(phone).first();
    if (!existing) {
      await db.users.add({
        phone,
        pinHash,
        name: phone === '7890784816' ? 'KRP Admin 1' : 'KRP Admin 2',
        createdAt: Date.now()
      });
      console.log(`Pre-registered admin user: ${phone}`);
    }
  }
}).catch(err => {
  console.error("Failed to open db or clean/populate products: ", err);
});

