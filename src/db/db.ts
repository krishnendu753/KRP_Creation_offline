import Dexie, { type Table } from 'dexie';

export interface User {
  id?: number;
  phone: string;
  pinHash: string;
  name: string;
  createdAt: number;
}

export interface ProductSize {
  size: string; // e.g. "S", "M", "L", "XL", "Free Size"
  length: string; // e.g. "38 inches", "42 inches", "N/A"
}

export interface ColorVariant {
  id: string;        // Unique ID e.g. "cv_abc123"
  colorName: string; // e.g. "Red", "Navy Blue"
  colorHex?: string; // Optional hex code for swatch circle e.g. "#FF0000"
  imageUrl: string;  // Image URL specific to this color
  stock?: number;    // Optional per-variant stock override
  price?: number;    // Optional per-variant price override
}

export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  imageUrl: string;
  category: string;
  stock: number;
  discount?: number;
  isFestiveDiscount?: boolean;
  festiveName?: string;
  deliveryCharge?: number;
  safetyFee?: number;
  isActive?: boolean;
  reviews?: Array<{ reviewerName: string; rating: number; comment: string; createdAt: number }>;
  sizes?: ProductSize[];
  updatedAt?: string;
  whatsappEnabled?: boolean;
  colorVariants?: ColorVariant[]; // Sub-catalog color variants
}

export interface CartItem {
  id?: number;
  productId: string;
  quantity: number;
  selectedSize?: ProductSize; // Size selected by user
  selectedVariant?: ColorVariant; // Color variant selected by user
}

export interface Order {
  id?: number;
  items: {
    productId: string;
    quantity: number;
    priceAtPurchase: number;
    selectedSize?: ProductSize; // Size selected at purchase
    selectedVariant?: ColorVariant; // Color variant selected at purchase
  }[];
  totalAmount: number;
  status: 'payment_pending' | 'pending_sync' | 'synced' | 'approved' | 'packed' | 'shipped' | 'out_for_delivery' | 'delivered' | 'rejected' | 'cancelled';
  rejectionReason?: string;
  cancellationReason?: string;
  trackingUpdates?: Array<{ status: string; title: string; timestamp: number; note?: string }>;
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

export interface Announcement {
  id: string; // 'global' or unique id
  content: string;
  liveUrl?: string; // Facebook Live link
  bigNotice?: string; // Big homepage popup/notice text
  updatedAt: number;
}

export interface EventItem {
  id: string;
  title: string;
  type: string; // dynamic — sourced from eventTypes table
  eventDate: string;
  eventEndDate?: string; // Scheduled End Date
  description: string;
  linkUrl?: string;
  createdAt: number;
  isCompleted?: boolean; // Completed / Expired status
  isExpired?: boolean;
}

export interface Category {
  id: string;
  name: string;
  createdAt: number;
}

export interface Festival {
  id: string;
  name: string;
  createdAt: number;
}

export interface EventType {
  id: string;
  name: string;   // internal key e.g. "live"
  label: string;  // display label e.g. "Live Show Link"
  createdAt: number;
}

class OfflineEcommerceDB extends Dexie {
  users!: Table<User, number>;
  products!: Table<Product, string>;
  cart!: Table<CartItem, number>;
  orders!: Table<Order, number>;
  announcements!: Table<Announcement, string>;
  events!: Table<EventItem, string>;
  categories!: Table<Category, string>;
  festivals!: Table<Festival, string>;
  eventTypes!: Table<EventType, string>;

  constructor() {
    super('OfflineEcommerceDB');
    this.version(1).stores({
      users: '++id, &phone',
      products: 'id, category',
      cart: '++id, productId',
      orders: '++id, status, receiptId'
    });

    // Version 3: Add announcements and events tables for local persist & sync
    this.version(3).stores({
      users: '++id, &phone',
      products: 'id, category',
      cart: '++id, productId',
      orders: '++id, status, receiptId',
      announcements: 'id',
      events: 'id, eventDate'
    });

    // Version 4: Add categories table for dynamic admin categories
    this.version(4).stores({
      users: '++id, &phone',
      products: 'id, category',
      cart: '++id, productId',
      orders: '++id, status, receiptId',
      announcements: 'id',
      events: 'id, eventDate',
      categories: 'id, name'
    });

    // Version 5: Add festivals and eventTypes tables for dynamic admin management
    this.version(5).stores({
      users: '++id, &phone',
      products: 'id, category',
      cart: '++id, productId',
      orders: '++id, status, receiptId',
      announcements: 'id',
      events: 'id, eventDate',
      categories: 'id, name',
      festivals: 'id, name',
      eventTypes: 'id, name'
    });
  }
}

export const db = new OfflineEcommerceDB();

// Clean up legacy products and delete default items on startup
db.open().then(async () => {
  // Pre-populate default categories if categories table is empty
  const defaultCategories = ['Saree', 'Dress', 'Kurti', 'Salwar Suit', 'Jackets', 'pencil pants', 'palazzo pants', 'pants'];
  const existingCategoriesCount = await db.categories.count();
  if (existingCategoriesCount === 0) {
    const categoriesToInsert = defaultCategories.map(cat => ({
      id: 'cat_' + cat.toLowerCase().replace(/\s+/g, '_'),
      name: cat,
      createdAt: Date.now()
    }));
    await db.categories.bulkPut(categoriesToInsert);
    console.log("Pre-populated default categories in database.");
  }

  // Pre-populate default festivals if festivals table is empty
  const defaultFestivals = [
    'January Sale', 'February Sale', 'March Sale', 'April Sale',
    'May Sale', 'June Sale', 'July Sale', 'August Sale',
    'September Sale', 'October Sale', 'November Sale', 'December Sale',
    'Durga Puja', 'Diwali', 'Eid', 'Holi', 'Christmas',
    'Raksha Bandhan', 'Dussehra', 'Navratri',
    'Pongal / Makar Sankranti', 'Ganesh Chaturthi',
    'Independence Day Sale', 'Republic Day Sale', 'Gandhi Jayanti Sale',
    'Onam (Kerala)', 'Bihu (Assam)', 'Chhath Puja (Bihar/UP)',
    'Lohri (Punjab)', 'Baisakhi (Punjab)',
    'Ugadi (Andhra/Karnataka)', 'Gudi Padwa (Maharashtra)',
    'Karwa Chauth', 'Maha Shivratri', 'Krishna Janmashtami'
  ];
  const existingFestivalsCount = await db.festivals.count();
  if (existingFestivalsCount === 0) {
    const festivalsToInsert = defaultFestivals.map(f => ({
      id: 'fest_' + f.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      name: f,
      createdAt: Date.now()
    }));
    await db.festivals.bulkPut(festivalsToInsert);
    console.log("Pre-populated default festivals in database.");
  }

  // Pre-populate default event types if eventTypes table is empty
  const defaultEventTypes = [
    { name: 'live',            label: 'Live Show Link' },
    { name: 'exhibition',      label: 'Exhibition Pop-Up' },
    { name: 'product_launch',  label: 'Product Launch' },
    { name: 'biggest_offer',   label: 'Biggest Offer' },
    { name: 'other',           label: 'Other Boutique Event' },
  ];
  const existingEventTypesCount = await db.eventTypes.count();
  if (existingEventTypesCount === 0) {
    const eventTypesToInsert = defaultEventTypes.map(et => ({
      id: 'evtype_' + et.name,
      name: et.name,
      label: et.label,
      createdAt: Date.now()
    }));
    await db.eventTypes.bulkPut(eventTypesToInsert);
    console.log("Pre-populated default event types in database.");
  }

  const allowedCategoriesList = await db.categories.toArray();
  const allowedCategories = allowedCategoriesList.map(c => c.name);

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
