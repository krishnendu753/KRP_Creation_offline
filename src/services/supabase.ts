import { createClient } from '@supabase/supabase-js';
import { db, type Product, type Order, type Announcement, type EventItem, type Category, type Festival, type EventType } from '../db/db';

const DEFAULT_SUPABASE_URL = 'https://ggbevhaudwhbpevjbdhq.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnYmV2aGF1ZHdoYnBldmpiZGhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5ODc5ODYsImV4cCI6MjEwMDU2Mzk4Nn0.bFaffDeWkkLq0I3fHOGNvUa-8jV-wjXvsa7IR2-IDBI';

// Retrieve Supabase credentials dynamically from local storage configuration or fall back to defaults
export const getSupabaseClient = () => {
  const url = localStorage.getItem('supabase_url') || DEFAULT_SUPABASE_URL;
  const key = localStorage.getItem('supabase_key') || DEFAULT_SUPABASE_KEY;
  const adminSecret = localStorage.getItem('supabase_admin_secret') || '';
  if (!url || !key) return null;
  try {
    return createClient(url, key, {
      global: {
        headers: adminSecret ? { 'x-admin-secret': adminSecret } : {}
      }
    });
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
      sizes: product.sizes || [],
      color_variants: product.colorVariants || [],
      updated_at: product.updatedAt || new Date().toISOString(),
      whatsapp_enabled: product.whatsappEnabled !== false
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
      reviews: item.reviews || [],
      sizes: item.sizes || [],
      colorVariants: item.color_variants || [],
      updatedAt: item.updated_at,
      whatsappEnabled: item.whatsapp_enabled !== false
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
    cancellation_reason: order.cancellationReason || null,
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
        cancellationReason: item.cancellation_reason || undefined,
        createdAt: new Date(item.created_at).getTime()
      };

      const existingLocalId = localByReceiptId.get(cloudReceiptId);
      if (existingLocalId !== undefined) {
        // Update status/rejection/cancellation on existing local record
        await db.orders.update(existingLocalId, {
          status: orderPayload.status,
          rejectionReason: orderPayload.rejectionReason,
          cancellationReason: orderPayload.cancellationReason,
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
  whatsappChannelUrl: string;
  showProductWhatsapp: boolean;
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
      whatsapp_channel_url: settings.whatsappChannelUrl,
      show_product_whatsapp: settings.showProductWhatsapp,
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
  whatsappChannelUrl: string;
  showProductWhatsapp: boolean;
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
      sellerInfoEnabled: data.seller_info_enabled,
      whatsappChannelUrl: data.whatsapp_channel_url || 'https://whatsapp.com/channel/0029VbCSSzBATRSxGKvra03v',
      showProductWhatsapp: data.show_product_whatsapp !== false
    };
  }
  return null;
};

// Sync announcements to cloud
export const syncAnnouncementToCloud = async (ann: Announcement) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('announcements')
    .upsert({
      id: ann.id,
      content: ann.content,
      live_url: ann.liveUrl || null,
      big_notice: ann.bigNotice || null,
      updated_at: new Date(ann.updatedAt).toISOString()
    });

  if (error) {
    console.error("Failed to sync announcement to cloud: ", error.message);
    throw new Error(error.message);
  }
};

// Pull latest announcements from cloud
export const pullAnnouncementsFromCloud = async (): Promise<number> => {
  const supabase = getSupabaseClient();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from('announcements')
    .select('*');

  if (error) {
    console.error("Failed to pull announcements from cloud: ", error.message);
    throw new Error(error.message);
  }

  if (data && data.length > 0) {
    const formatted = data.map(item => ({
      id: item.id,
      content: item.content,
      liveUrl: item.live_url || undefined,
      bigNotice: item.big_notice || undefined,
      updatedAt: new Date(item.updated_at).getTime()
    }));
    await db.announcements.bulkPut(formatted);
    return data.length;
  }
  return 0;
};

// Sync a single event item to cloud
export const syncEventToCloud = async (ev: EventItem) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('events')
    .upsert({
      id: ev.id,
      title: ev.title,
      type: ev.type,
      event_date: ev.eventDate,
      event_end_date: ev.eventEndDate || null,
      description: ev.description,
      link_url: ev.linkUrl || null,
      created_at: new Date(ev.createdAt).toISOString()
    });

  if (error) {
    console.error("Failed to sync event to cloud: ", error.message);
    throw new Error(error.message);
  }
};

// Delete an event item from cloud
export const deleteEventFromCloud = async (eventId: string) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId);

  if (error) {
    console.error("Failed to delete event from cloud: ", error.message);
    throw new Error(error.message);
  }
};

// Pull all events from cloud
export const pullEventsFromCloud = async (): Promise<number> => {
  const supabase = getSupabaseClient();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from('events')
    .select('*');

  if (error) {
    console.error("Failed to pull events from cloud: ", error.message);
    throw new Error(error.message);
  }

  if (data && data.length > 0) {
    const formatted = data.map(item => ({
      id: item.id,
      title: item.title,
      type: item.type,
      eventDate: item.event_date,
      eventEndDate: item.event_end_date || undefined,
      description: item.description,
      linkUrl: item.link_url || undefined,
      isCompleted: item.is_completed || false,
      isExpired: item.is_expired || false,
      createdAt: new Date(item.created_at).getTime()
    }));
    await db.events.bulkPut(formatted);
    return data.length;
  }
  return 0;
};

// Sync category to cloud
export const syncCategoryToCloud = async (cat: Category) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('categories')
    .upsert({
      id: cat.id,
      name: cat.name,
      created_at: new Date(cat.createdAt).toISOString()
    });

  if (error) {
    console.error("Failed to sync category to cloud: ", error.message);
    throw new Error(error.message);
  }
};

// Delete category from cloud
export const deleteCategoryFromCloud = async (catId: string) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', catId);

  if (error) {
    console.error("Failed to delete category from cloud: ", error.message);
    throw new Error(error.message);
  }
};

// Pull all categories from cloud
export const pullCategoriesFromCloud = async (): Promise<number> => {
  const supabase = getSupabaseClient();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from('categories')
    .select('*');

  if (error) {
    console.error("Failed to pull categories from cloud: ", error.message);
    throw new Error(error.message);
  }

  if (data && data.length > 0) {
    const formatted = data.map(item => ({
      id: item.id,
      name: item.name,
      createdAt: new Date(item.created_at).getTime()
    }));
    await db.categories.bulkPut(formatted);
  }
  return 0;
};

// Push user profile to cloud
export const syncUserToCloud = async (user: { phone: string; pinHash: string; name: string; createdAt: number }) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('app_users')
    .upsert({
      phone: user.phone,
      pin_hash: user.pinHash,
      name: user.name,
      created_at: new Date(user.createdAt).toISOString()
    }, { onConflict: 'phone' });

  if (error) {
    console.error("Failed to push user to cloud: ", error.message);
    throw new Error(error.message);
  }
};

// Fetch user profile from cloud by phone number
export const fetchUserFromCloud = async (phone: string): Promise<{ phone: string; pinHash: string; name: string; createdAt: number } | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch user from cloud: ", error.message);
    throw new Error(error.message);
  }

  if (data) {
    return {
      phone: data.phone,
      pinHash: data.pin_hash,
      name: data.name,
      createdAt: new Date(data.created_at).getTime()
    };
  }
  return null;
};

// ─── Festivals ───────────────────────────────────────────────────────────────

// Sync a festival to cloud
export const syncFestivalToCloud = async (festival: Festival) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('festivals')
    .upsert({
      id: festival.id,
      name: festival.name,
      created_at: new Date(festival.createdAt).toISOString()
    });

  if (error) {
    console.error("Failed to sync festival to cloud: ", error.message);
    throw new Error(error.message);
  }
};

// Delete a festival from cloud
export const deleteFestivalFromCloud = async (festivalId: string) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('festivals')
    .delete()
    .eq('id', festivalId);

  if (error) {
    console.error("Failed to delete festival from cloud: ", error.message);
    throw new Error(error.message);
  }
};

// Pull all festivals from cloud
export const pullFestivalsFromCloud = async (): Promise<number> => {
  const supabase = getSupabaseClient();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from('festivals')
    .select('*');

  if (error) {
    console.error("Failed to pull festivals from cloud: ", error.message);
    throw new Error(error.message);
  }

  if (data && data.length > 0) {
    const formatted = data.map(item => ({
      id: item.id,
      name: item.name,
      createdAt: new Date(item.created_at).getTime()
    }));
    await db.festivals.bulkPut(formatted);
    return data.length;
  }
  return 0;
};

// ─── Event Types ─────────────────────────────────────────────────────────────

// Sync an event type to cloud
export const syncEventTypeToCloud = async (et: EventType) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('event_types')
    .upsert({
      id: et.id,
      name: et.name,
      label: et.label,
      created_at: new Date(et.createdAt).toISOString()
    });

  if (error) {
    console.error("Failed to sync event type to cloud: ", error.message);
    throw new Error(error.message);
  }
};

// Delete an event type from cloud
export const deleteEventTypeFromCloud = async (etId: string) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('event_types')
    .delete()
    .eq('id', etId);

  if (error) {
    console.error("Failed to delete event type from cloud: ", error.message);
    throw new Error(error.message);
  }
};

// Pull all event types from cloud
export const pullEventTypesFromCloud = async (): Promise<number> => {
  const supabase = getSupabaseClient();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from('event_types')
    .select('*');

  if (error) {
    console.error("Failed to pull event types from cloud: ", error.message);
    throw new Error(error.message);
  }

  if (data && data.length > 0) {
    const formatted = data.map(item => ({
      id: item.id,
      name: item.name,
      label: item.label,
      createdAt: new Date(item.created_at).getTime()
    }));
    await db.eventTypes.bulkPut(formatted);
    return data.length;
  }
  return 0;
};



