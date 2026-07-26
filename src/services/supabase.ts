import { createClient } from '@supabase/supabase-js';
import { db, type Product, type Order } from '../db/db';

const DEFAULT_SUPABASE_URL = 'https://ggbevhaudwhbpevjbdhq.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnYmV2aGF1ZHdoYnBldmpiZGhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5ODc5ODYsImV4cCI6MjEwMDU2Mzk4Nn0.bFaffDeWkkLq0I3fHOGNvUa-8jV-wjXvsa7IR2-IDBI';

// Retrieve Supabase credentials dynamically from local storage configuration or fall back to defaults
export const getSupabaseClient = () => {
  const url = localStorage.getItem('supabase_url') || DEFAULT_SUPABASE_URL;
  const key = localStorage.getItem('supabase_key') || DEFAULT_SUPABASE_KEY;
  if (!url || !key) return null;
  try {
    return createClient(url, key);
  } catch (err) {
    console.error("Invalid Supabase connection parameters: ", err);
    return null;
  }
};

// Check if Cloud Database Connector is configured with any credential keys
export const isCloudConfigured = (): boolean => {
  const url = localStorage.getItem('supabase_url') || DEFAULT_SUPABASE_URL;
  const key = localStorage.getItem('supabase_key') || DEFAULT_SUPABASE_KEY;
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
    const productsToPut = data.map(item => ({
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
    }));
    await db.products.bulkPut(productsToPut);
    return data.length;
  }
  return 0;
};

// Sync orders to Supabase cloud using receiptId as unique key
export const syncOrdersToCloud = async (orders: Order[]) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const formatted = orders.map(order => ({
    receipt_id: order.receiptId,
    items: order.items,
    total_amount: order.totalAmount,
    shipping_info: order.shippingInfo,
    summary: order.summary,
    status: order.status,
    rejection_reason: order.rejectionReason || null,
    created_at: new Date(order.createdAt).toISOString()
  }));

  const { error } = await supabase
    .from('orders')
    .upsert(formatted, { onConflict: 'receipt_id' });

  if (error) {
    console.error("Failed to sync orders to cloud: ", error.message);
    throw new Error(error.message);
  }
};

// Fetch all customer orders from Supabase, merging into local Dexie by receiptId
export const pullOrdersFromCloud = async (): Promise<number> => {
  const supabase = getSupabaseClient();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from('orders')
    .select('*');

  if (error) {
    console.error("Failed to pull orders from cloud: ", error.message);
    throw new Error(error.message);
  }

  if (data && data.length > 0) {
    // Get all local orders and index by receiptId to avoid duplicates
    const localOrders = await db.orders.toArray();
    const localByReceiptId = new Map(localOrders.map(o => [o.receiptId, o.id!]));

    for (const item of data) {
      const cloudReceiptId = item.receipt_id;
      const orderPayload = {
        receiptId: cloudReceiptId,
        items: item.items,
        totalAmount: item.total_amount,
        shippingInfo: item.shipping_info,
        summary: item.summary,
        status: item.status || 'synced',
        rejectionReason: item.rejection_reason || undefined,
        createdAt: new Date(item.created_at).getTime()
      };

      const existingLocalId = localByReceiptId.get(cloudReceiptId);
      if (existingLocalId !== undefined) {
        // Update status/rejection on existing local record
        await db.orders.update(existingLocalId, {
          status: orderPayload.status,
          rejectionReason: orderPayload.rejectionReason,
        });
      } else {
        // Insert as new local order
        await db.orders.add(orderPayload);
      }
    }
    return data.length;
  }
  return 0;
};

// Push configurations to Supabase settings table
export const syncSettingsToCloud = async (settings: {
  gstEnabled: boolean;
  cgstRate: number;
  sgstRate: number;
  packagingFee: number;
  sellerInfoEnabled: boolean;
}) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('settings')
    .upsert({
      id: 'global',
      gst_enabled: settings.gstEnabled,
      cgst_rate: settings.cgstRate,
      sgst_rate: settings.sgstRate,
      packaging_fee: settings.packagingFee,
      seller_info_enabled: settings.sellerInfoEnabled,
      updated_at: new Date().toISOString()
    });

  if (error) {
    console.error("Failed to push settings to cloud: ", error.message);
    throw new Error(error.message);
  }
};

// Pull global settings from Supabase
export const pullSettingsFromCloud = async (): Promise<{
  gstEnabled: boolean;
  cgstRate: number;
  sgstRate: number;
  packagingFee: number;
  sellerInfoEnabled: boolean;
} | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('id', 'global')
    .single();

  if (error) {
    console.error("Failed to fetch settings from cloud: ", error.message);
    return null;
  }

  if (data) {
    return {
      gstEnabled: data.gst_enabled,
      cgstRate: Number(data.cgst_rate),
      sgstRate: Number(data.sgst_rate),
      packagingFee: Number(data.packaging_fee),
      sellerInfoEnabled: data.seller_info_enabled
    };
  }
  return null;
};
