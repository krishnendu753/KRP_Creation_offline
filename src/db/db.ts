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

// Populate initial products
db.on('populate', () => {
  db.products.bulkAdd([
    {
      id: 'p1',
      name: 'Elegant Silk Saree',
      price: 89.99,
      description: 'Beautiful traditional Indian silk saree with intricate golden zari work, perfect for weddings and festive occasions.',
      imageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=500&auto=format&fit=crop&q=60',
      category: 'Saree',
      stock: 12
    },
    {
      id: 'p2',
      name: 'Floral Summer Maxi Dress',
      price: 39.99,
      description: 'Lightweight, breathable floral print maxi dress featuring a matching belt and flared hemline.',
      imageUrl: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=500&auto=format&fit=crop&q=60',
      category: 'Dress',
      stock: 25
    },
    {
      id: 'p3',
      name: 'Designer Anarkali Kurti',
      price: 49.99,
      description: 'Long flared ethnic designer kurti with premium embroidery work on the neck and sleeves.',
      imageUrl: 'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?w=500&auto=format&fit=crop&q=60',
      category: 'Kurti',
      stock: 18
    },
    {
      id: 'p4',
      name: 'Premium Cotton Salwar Suit',
      price: 54.99,
      description: 'Complete 3-piece pure cotton salwar kameez set with a soft printed dupatta.',
      imageUrl: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=500&auto=format&fit=crop&q=60',
      category: 'Salwar Suit',
      stock: 15
    },
    {
      id: 'p5',
      name: 'Classic Women Denim Jacket',
      price: 45.99,
      description: 'Stylish washed blue denim jacket with button closures and practical front pockets.',
      imageUrl: 'https://images.unsplash.com/photo-1544441893-675973e31985?w=500&auto=format&fit=crop&q=60',
      category: 'Jackets',
      stock: 10
    }
  ]);
});

// Clean up legacy products and populate default garments on startup
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

  // Populate default garments if database is empty
  const updatedProds = await db.products.toArray();
  if (updatedProds.length === 0) {
    await db.products.bulkAdd([
      {
        id: 'p1',
        name: 'Elegant Silk Saree',
        price: 89.99,
        description: 'Beautiful traditional Indian silk saree with intricate golden zari work, perfect for weddings and festive occasions.',
        imageUrl: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=500&auto=format&fit=crop&q=60',
        category: 'Saree',
        stock: 12,
        deliveryCharge: 60,
        safetyFee: 15,
        isActive: true
      },
      {
        id: 'p2',
        name: 'Floral Summer Maxi Dress',
        price: 39.99,
        description: 'Lightweight, breathable floral print maxi dress featuring a matching belt and flared hemline.',
        imageUrl: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=500&auto=format&fit=crop&q=60',
        category: 'Dress',
        stock: 25,
        deliveryCharge: 40,
        safetyFee: 10,
        isActive: true
      },
      {
        id: 'p3',
        name: 'Designer Anarkali Kurti',
        price: 49.99,
        description: 'Long flared ethnic designer kurti with premium embroidery work on the neck and sleeves.',
        imageUrl: 'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?w=500&auto=format&fit=crop&q=60',
        category: 'Kurti',
        stock: 18,
        deliveryCharge: 45,
        safetyFee: 10,
        isActive: true
      },
      {
        id: 'p4',
        name: 'Premium Cotton Salwar Suit',
        price: 54.99,
        description: 'Complete 3-piece pure cotton salwar kameez set with a soft printed dupatta.',
        imageUrl: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=500&auto=format&fit=crop&q=60',
        category: 'Salwar Suit',
        stock: 15,
        deliveryCharge: 50,
        safetyFee: 12,
        isActive: true
      },
      {
        id: 'p5',
        name: 'Classic Women Denim Jacket',
        price: 45.99,
        description: 'Stylish washed blue denim jacket with button closures and practical front pockets.',
        imageUrl: 'https://images.unsplash.com/photo-1544441893-675973e31985?w=500&auto=format&fit=crop&q=60',
        category: 'Jackets',
        stock: 10,
        deliveryCharge: 50,
        safetyFee: 10,
        isActive: true
      }
    ]);
    console.log("Populated ladies garments default products.");
  }

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

