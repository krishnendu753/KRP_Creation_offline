import { createClient } from '@supabase/supabase-js';
import { db, type Product, type Order } from '../db/db';

// Retrieve Supabase credentials dynamically from local storage configuration
export const getSupabaseClient = () => {
  const url = localStorage.getItem('supabase_url');
  const key = localStorage.getItem('supabase_key');
  if (!url || !key) return null;
  try {
    return createClient(url, key);
  } catch (err) {
    console.error("Invalid Supabase connection parameters: ", err);
    return null;
  }
};

// Check if Cloud Database Connector is fully configured
export const isCloudConfigured = (): boolean => {
  const url = localStorage.getItem('supabase_url');
  const key = localStorage.getItem('supabase_key');
  return !!url && !!key;
};

// Push a single product update to Supabase
export const syncProductToCloud = async (product: Product) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('products')
    .upsert({
      id: product.id,
      name: product.name,
      price: product.price,
      description: product.description,
      image_url: product.imageUrl,
      category: product.category,
      stock: product.stock,
      discount: product.discount,
      is_festive_discount: product.isFestiveDiscount,
      festive_name: product.festiveName,
      delivery_charge: product.deliveryCharge,
      safety_fee: product.safetyFee,
      is_active: product.isActive !== false,
      reviews: product.reviews || [],
      updated_at: new Date().toISOString()
    });

  if (error) {
    console.error("Failed to push product changes to cloud: ", error.message);
    throw new Error(error.message);
  }
};

// Delete a product from Supabase
export const deleteProductFromCloud = async (productId: string) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', productId);

  if (error) {
    console.error("Failed to delete product from cloud: ", error.message);
    throw new Error(error.message);
  }
};

// Fetch latest products from Supabase and cache/merge into Dexie IndexedDB
export const pullProductsFromCloud = async (): Promise<number> => {
  const supabase = getSupabaseClient();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from('products')
    .select('*');

  if (error) {
    console.error("Failed to pull products from cloud: ", error.message);
    throw new Error(error.message);
  }

  if (data && data.length > 0) {
    for (const item of data) {
      await db.products.put({
        id: item.id,
        name: item.name,
        price: item.price,
        description: item.description,
        imageUrl: item.image_url,
        category: item.category,
        stock: item.stock,
        discount: item.discount,
        isFestiveDiscount: item.is_festive_discount,
        festiveName: item.festive_name,
        deliveryCharge: item.delivery_charge,
        safetyFee: item.safety_fee,
        isActive: item.is_active,
        reviews: item.reviews || []
      });
    }
    return data.length;
  }
  return 0;
};

// Sync orders to Supabase cloud
export const syncOrdersToCloud = async (orders: Order[]) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const formatted = orders.map(order => ({
    id: order.id,
    receipt_id: order.receiptId,
    items: order.items,
    total_amount: order.totalAmount,
    shipping_info: order.shippingInfo,
    summary: order.summary,
    created_at: new Date(order.createdAt).toISOString()
  }));

  const { error } = await supabase
    .from('orders')
    .upsert(formatted);

  if (error) {
    console.error("Failed to sync orders to cloud: ", error.message);
    throw new Error(error.message);
  }
};
