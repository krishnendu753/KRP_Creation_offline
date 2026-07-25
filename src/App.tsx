import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { useCart } from './context/CartContext';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { db, type Product, type Order } from './db/db';
import { loginUser, registerUser } from './services/auth';
import { useLiveQuery } from 'dexie-react-hooks';
import moment from 'moment';
import { isCloudConfigured, syncProductToCloud, deleteProductFromCloud, pullProductsFromCloud, syncOrdersToCloud, syncSettingsToCloud, pullSettingsFromCloud, getSupabaseClient } from './services/supabase';

type Page = 'home' | 'catalog' | 'cart' | 'login' | 'register' | 'admin' | 'my-orders';

const ADMIN_PHONES = ['7890784816', '7059782504'];
const isAdmin = (phone: string | undefined) => {
  if (!phone) return false;
  const cleanPhone = phone.replace(/\D/g, '');
  return ADMIN_PHONES.some(adminPhone => cleanPhone.endsWith(adminPhone));
};

const FESTIVAL_OPTIONS = [
  'January Sale',
  'February Sale',
  'March Sale',
  'April Sale',
  'May Sale',
  'June Sale',
  'July Sale',
  'August Sale',
  'September Sale',
  'October Sale',
  'November Sale',
  'December Sale',
  'Durga Puja',
  'Diwali',
  'Eid',
  'Holi',
  'Christmas',
  'Raksha Bandhan',
  'Dussehra',
  'Navratri',
  'Pongal / Makar Sankranti',
  'Ganesh Chaturthi',
  'Independence Day Sale',
  'Republic Day Sale',
  'Gandhi Jayanti Sale',
  'Onam (Kerala)',
  'Bihu (Assam)',
  'Chhath Puja (Bihar/UP)',
  'Lohri (Punjab)',
  'Baisakhi (Punjab)',
  'Ugadi (Andhra/Karnataka)',
  'Gudi Padwa (Maharashtra)',
  'Karwa Chauth',
  'Maha Shivratri',
  'Krishna Janmashtami'
];

const LOCATION_DATA: Record<string, Record<string, string[]>> = {
  'India': {
    'Bihar': ['Bhagalpur', 'Bihar Sharif', 'Darbhanga', 'Gaya', 'Muzaffarpur', 'Patna', 'Purnia'],
    'Delhi': ['Chandni Chowk', 'Connaught Place', 'Dwarka', 'Karol Bagh', 'Lajpat Nagar', 'New Delhi', 'Rohini', 'Saket', 'Vasant Kunj'],
    'Gujarat': ['Ahmedabad', 'Anand', 'Bhavnagar', 'Gandhinagar', 'Jamnagar', 'Junagadh', 'Rajkot', 'Surat', 'Vadodara'],
    'Karnataka': ['Ballari', 'Belagavi', 'Bengaluru', 'Davanagere', 'Hubballi', 'Mangaluru', 'Mysuru', 'Shivamogga', 'Tumakuru'],
    'Kerala': ['Alappuzha', 'Kannur', 'Kochi', 'Kollam', 'Kozhikode', 'Palakkad', 'Thiruvananthapuram', 'Thrissur'],
    'Maharashtra': ['Amravati', 'Aurangabad', 'Kolhapur', 'Mumbai', 'Nagpur', 'Nashik', 'Navi Mumbai', 'Pune', 'Sangli', 'Solapur', 'Thane'],
    'Rajasthan': ['Ajmer', 'Alwar', 'Bhilwara', 'Bikaner', 'Jaipur', 'Jodhpur', 'Kota', 'Sikar', 'Udaipur'],
    'Tamil Nadu': ['Chennai', 'Coimbatore', 'Erode', 'Madurai', 'Salem', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli', 'Tiruppur', 'Vellore'],
    'Telangana': ['Hyderabad', 'Karimnagar', 'Khammam', 'Nizamabad', 'Ramagundam', 'Warangal'],
    'Uttar Pradesh': ['Agra', 'Aligarh', 'Bareilly', 'Ghaziabad', 'Kanpur', 'Lucknow', 'Meerut', 'Moradabad', 'Noida', 'Prayagraj'],
    'West Bengal': ['Asansol', 'Bardhaman', 'Darjeeling', 'Durgapur', 'Haldia', 'Howrah', 'Jalpaiguri', 'Kharagpur', 'Kolkata', 'Malda', 'Midnapore', 'Siliguri']
  }
};

export default function App() {
  const { user, login: setAuthSession, logout } = useAuth();
  const { cartItems, addToCart, updateQuantity, clearCart } = useCart();
  const isOnline = useNetworkStatus();
  const [currentPage, setCurrentPage] = useState<Page>('home');

  // Input states
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');

  // Shipping Address Form states
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [shipName, setShipName] = useState('');
  const [shipPhone, setShipPhone] = useState('');
  const [shipAddress, setShipAddress] = useState('');
  const [shipCountry, setShipCountry] = useState('India');
  const [shipState, setShipState] = useState('');
  const [shipCity, setShipCity] = useState('');
  const [shipPincode, setShipPincode] = useState('');

  // Global Fee & Tax Settings (Persisted locally)
  const [gstEnabled, setGstEnabled] = useState(() => localStorage.getItem('fee_gst_enabled') !== 'false');
  const [cgstRate, setCgstRate] = useState(() => parseFloat(localStorage.getItem('fee_cgst') || '2.5'));
  const [sgstRate, setSgstRate] = useState(() => parseFloat(localStorage.getItem('fee_sgst') || '2.5'));
  const [packagingFee, setPackagingFee] = useState(() => parseFloat(localStorage.getItem('fee_packaging') || '20'));
  const [sellerInfoEnabled, setSellerInfoEnabled] = useState(() => localStorage.getItem('seller_info_enabled') !== 'false');

  // Payment states
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  // Bill/Receipt states
  const [activeReceiptOrder, setActiveReceiptOrder] = useState<Order | null>(null);

  // Admin states for adding products
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductDesc, setNewProductDesc] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('Saree');
  const [newProductImage, setNewProductImage] = useState('');
  const [newProductDelivery, setNewProductDelivery] = useState('50');
  const [newProductSafety, setNewProductSafety] = useState('10');
  const [newProductFestival, setNewProductFestival] = useState('');

  // Admin states for managing existing products
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editStock, setEditStock] = useState('');
  const [editDiscount, setEditDiscount] = useState('');
  const [editFestivalName, setEditFestivalName] = useState('');
  const [editDeliveryCharge, setEditDeliveryCharge] = useState('');
  const [editSafetyFee, setEditSafetyFee] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editProductImage, setEditProductImage] = useState('');
  const [productToDeleteId, setProductToDeleteId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [supabaseUrl, setSupabaseUrl] = useState(() => localStorage.getItem('supabase_url') || '');
  const [supabaseKey, setSupabaseKey] = useState(() => localStorage.getItem('supabase_key') || '');

  // Review states for customers
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');

  // Global UI States (Loader & Toast)
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Live Query from Dexie
  const products = useLiveQuery(() => db.products.toArray()) || [];
  const pendingOrders = useLiveQuery(() => db.orders.where('status').equals('pending_sync').toArray()) || [];
  const allOrders = useLiveQuery(() => db.orders.toArray()) || [];

  // Automatically redirect based on user authentication state (Allowing 'home' tab view first)
  useEffect(() => {
    if (user) {
      setCurrentPage('catalog');
    } else {
      setCurrentPage('home');
    }
  }, [user]);

  // Pull catalog products and global configurations from cloud on mount or online status change
  useEffect(() => {
    if (isOnline && isCloudConfigured()) {
      pullProductsFromCloud()
        .then((count) => {
          if (count > 0) {
            console.log(`Successfully synchronized ${count} products from Cloud Database.`);
          }
        })
        .catch((err) => {
          console.error("Cloud product sync failed: ", err);
        });

      pullSettingsFromCloud()
        .then((sets) => {
          if (sets) {
            setGstEnabled(sets.gstEnabled);
            setCgstRate(sets.cgstRate);
            setSgstRate(sets.sgstRate);
            setPackagingFee(sets.packagingFee);
            setSellerInfoEnabled(sets.sellerInfoEnabled);

            localStorage.setItem('fee_gst_enabled', String(sets.gstEnabled));
            localStorage.setItem('fee_cgst', String(sets.cgstRate));
            localStorage.setItem('fee_sgst', String(sets.sgstRate));
            localStorage.setItem('fee_packaging', String(sets.packagingFee));
            localStorage.setItem('seller_info_enabled', String(sets.sellerInfoEnabled));
            console.log("Successfully synchronized shop settings from Cloud Database.");
          }
        })
        .catch((err) => {
          console.error("Cloud settings sync failed: ", err);
        });

      // Subscribe to live database updates (Supabase Realtime)
      const supabase = getSupabaseClient();
      if (supabase) {
        // Products realtime subscription
        const productsChannel = supabase
          .channel('realtime-products')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async (payload) => {
            console.log('Realtime product change payload received: ', payload);
            if (payload.eventType === 'DELETE') {
              await db.products.delete(payload.old.id);
            } else {
              const item = payload.new;
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
          })
          .subscribe();

        // Settings realtime subscription
        const settingsChannel = supabase
          .channel('realtime-settings')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, async (payload) => {
            console.log('Realtime settings change payload received: ', payload);
            if (payload.eventType !== 'DELETE') {
              const sets = payload.new;
              setGstEnabled(sets.gst_enabled);
              setCgstRate(Number(sets.cgst_rate));
              setSgstRate(Number(sets.sgst_rate));
              setPackagingFee(Number(sets.packaging_fee));
              setSellerInfoEnabled(sets.seller_info_enabled);

              localStorage.setItem('fee_gst_enabled', String(sets.gst_enabled));
              localStorage.setItem('fee_cgst', String(sets.cgst_rate));
              localStorage.setItem('fee_sgst', String(sets.sgst_rate));
              localStorage.setItem('fee_packaging', String(sets.packaging_fee));
              localStorage.setItem('seller_info_enabled', String(sets.seller_info_enabled));
            }
          })
          .subscribe();

        return () => {
          supabase.removeChannel(productsChannel);
          supabase.removeChannel(settingsChannel);
        };
      }
    }
  }, [isOnline]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Open Checkout Form Modal
  const handleOpenCheckout = () => {
    if (!user) {
      setCurrentPage('login');
      return;
    }
    setShipName(user.name.trim());
    setShipPhone(user.phone.trim());
    setIsCheckoutOpen(true);
  };

  // Reset state/city when country changes
  useEffect(() => {
    setShipState('');
    setShipCity('');
  }, [shipCountry]);

  // Reset city when state changes
  useEffect(() => {
    setShipCity('');
  }, [shipState]);

  // Helper to calculate discounted price
  const getProductPrice = (product: Product) => {
    if (product.discount && product.discount > 0) {
      return parseFloat((product.price * (1 - product.discount / 100)).toFixed(2));
    }
    return product.price;
  };

  // Wrapper for Add to Cart
  const handleAddToCart = async (product: Product) => {
    if (product.stock <= 0) {
      showToast('This product is currently sold out.', 'error');
      return;
    }
    setIsLoading(true);
    try {
      await addToCart(product.id);
      showToast(`${product.name} added to cart successfully!`, 'success');
    } catch (err) {
      showToast('Failed to add item to cart.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // File Upload Helper (converts to Base64 String and compresses using Canvas)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const max_width = 800;
          const max_height = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > max_width) {
              height *= max_width / width;
              width = max_width;
            }
          } else {
            if (height > max_height) {
              width *= max_height / height;
              height = max_height;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.75);
            setter(compressedBase64);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  // Move from Shipping Form to Payment Scanner Modal
  const handleShippingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shipCountry || !shipState || !shipCity || !shipAddress || !shipPincode) {
      showToast('Please fill out all mandatory delivery fields.', 'error');
      return;
    }
    setIsCheckoutOpen(false);
    setIsPaymentOpen(true);
  };

  // Local Order submission & Stock deduction
  const handleConfirmPayment = async () => {
    if (!user) return;
    if (cartItems.length === 0) return;

    setIsLoading(true);
    try {
      const orderItems = [];
      let originalSubtotal = 0;
      let totalDiscountSaved = 0;
      let totalDeliverySum = 0;
      let totalSafetySum = 0;

      for (const item of cartItems) {
        const prod = products.find((p) => p.id === item.productId);
        if (prod) {
          const finalPrice = getProductPrice(prod);
          orderItems.push({
            productId: item.productId,
            quantity: item.quantity,
            priceAtPurchase: finalPrice,
          });
          
          originalSubtotal += prod.price * item.quantity;
          totalDiscountSaved += (prod.price - finalPrice) * item.quantity;
          totalDeliverySum += (prod.deliveryCharge || 0) * item.quantity;
          totalSafetySum += (prod.safetyFee || 0) * item.quantity;
          
          // Decrement stock count
          const newStock = Math.max(0, prod.stock - item.quantity);
          await db.products.update(prod.id, { stock: newStock });
        }
      }

      const netSubtotal = originalSubtotal - totalDiscountSaved;
      const cgstVal = gstEnabled ? parseFloat((netSubtotal * (cgstRate / 100)).toFixed(2)) : 0;
      const sgstVal = gstEnabled ? parseFloat((netSubtotal * (sgstRate / 100)).toFixed(2)) : 0;
      const finalGrandTotal = parseFloat(
        (netSubtotal + cgstVal + sgstVal + totalDeliverySum + packagingFee + totalSafetySum).toFixed(2)
      );

      const orderStatus = isOnline ? 'synced' : 'pending_sync';
      const orderData: Omit<Order, 'id'> = {
        items: orderItems,
        totalAmount: finalGrandTotal,
        status: orderStatus,
        shippingInfo: {
          fullName: shipName.trim(),
          phone: shipPhone.trim(),
          address: shipAddress.trim(),
          country: shipCountry.trim(),
          city: shipCity.trim(),
          state: shipState.trim(),
          pincode: shipPincode.trim(),
        },
        summary: {
          subtotal: parseFloat(originalSubtotal.toFixed(2)),
          discountSaved: parseFloat(totalDiscountSaved.toFixed(2)),
          cgst: cgstVal,
          sgst: sgstVal,
          delivery: totalDeliverySum,
          packaging: packagingFee,
          safety: totalSafetySum,
        },
        createdAt: Date.now(),
        receiptId: `KRP-${Math.floor(100000000000 + Math.random() * 900000000000).toString()}`
      };

      const newOrderId = await db.orders.add(orderData);
      const createdOrder = await db.orders.get(newOrderId);
      
      await clearCart();
      setIsPaymentOpen(false);

      // Save shipping fields
      setShipAddress('');
      setShipCountry('India');
      setShipState('');
      setShipCity('');
      setShipPincode('');

      if (createdOrder) {
        setActiveReceiptOrder(createdOrder);
        if (isOnline && isCloudConfigured()) {
          try {
            await syncOrdersToCloud([createdOrder]);
          } catch (e) {
            console.error("Direct order cloud sync failed: ", e);
          }
        }
      }

      if (isOnline) {
        showToast('Payment confirmed and order placed online!', 'success');
      } else {
        showToast('Currently offline. Payment confirmed and order queued locally.', 'info');
      }
    } catch (err) {
      showToast('Order placement failed.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Sync Offline Orders function
  const handleSyncOrders = async () => {
    if (!isOnline) {
      showToast('You must be online to sync orders.', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const unsynced = await db.orders.where('status').equals('pending_sync').toArray();
      if (unsynced.length === 0) {
        showToast('All orders are already synced!', 'info');
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (isCloudConfigured()) {
        await syncOrdersToCloud(unsynced);
      }

      for (const order of unsynced) {
        await db.orders.update(order.id!, { status: 'synced' });
      }
      showToast(`Successfully synchronized ${unsynced.length} pending orders.`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Sync failed.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Login handler
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const loggedUser = await loginUser(phone, pin);
      setAuthSession(loggedUser);
      showToast(`Welcome back, ${loggedUser.name}!`, 'success');
      setCurrentPage('catalog');
    } catch (err: any) {
      showToast(err.message || 'Login failed.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Register handler
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await registerUser(phone, pin, name);
      showToast('Account registered successfully! Please sign in.', 'success');
      setCurrentPage('login');
    } catch (err: any) {
      showToast(err.message || 'Registration failed.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Add Product (Admin Panel)
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      showToast('Adding products is strictly restricted to online mode.', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const newId = 'prod_' + Math.random().toString(36).substr(2, 9);
      const newProductObj: Product = {
        id: newId,
        name: newProductName.trim(),
        price: parseFloat(newProductPrice),
        description: newProductDesc.trim(),
        imageUrl: newProductImage || '',
        category: newProductCategory,
        stock: 10,
        discount: 0,
        isFestiveDiscount: !!newProductFestival,
        festiveName: newProductFestival || undefined,
        deliveryCharge: parseFloat(newProductDelivery) || 0,
        safetyFee: parseFloat(newProductSafety) || 0,
        isActive: true,
        reviews: []
      };
      await db.products.add(newProductObj);
      if (isCloudConfigured()) {
        await syncProductToCloud(newProductObj);
      }
      showToast('Product added successfully to catalog!', 'success');
      setNewProductName('');
      setNewProductPrice('');
      setNewProductDesc('');
      setNewProductImage('');
      setNewProductDelivery('50');
      setNewProductSafety('10');
      setNewProductFestival('');
      // Reset file input
      const fileInput = document.getElementById('newProductFileInput') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (err: any) {
      showToast('Failed to add product: ' + err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Admin update product details (restock, discount, status)
  const handleUpdateProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProductId) return;

    setIsLoading(true);
    try {
      const stockVal = parseInt(editStock);
      const discountVal = parseInt(editDiscount) || 0;
      const priceVal = parseFloat(editPrice);

      await db.products.update(editingProductId, {
        price: isNaN(priceVal) ? 0 : priceVal,
        stock: isNaN(stockVal) ? 0 : stockVal,
        discount: discountVal,
        isFestiveDiscount: !!editFestivalName,
        festiveName: editFestivalName || undefined,
        deliveryCharge: parseFloat(editDeliveryCharge) || 0,
        safetyFee: parseFloat(editSafetyFee) || 0,
        isActive: editIsActive,
        imageUrl: editProductImage || ''
      });

      if (isCloudConfigured()) {
        const updatedObj = await db.products.get(editingProductId);
        if (updatedObj) {
          await syncProductToCloud(updatedObj);
        }
      }

      showToast('Product details updated successfully!', 'success');
      setEditingProductId(null);
    } catch (err) {
      showToast('Failed to update product details.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Admin Toggle Active / Inactive direct from listing
  const handleToggleProductActive = async (productId: string, currentStatus: boolean) => {
    setIsLoading(true);
    try {
      await db.products.update(productId, { isActive: !currentStatus });
      if (isCloudConfigured()) {
        const updated = await db.products.get(productId);
        if (updated) {
          await syncProductToCloud(updated);
        }
      }
      showToast(`Product visibility updated to ${!currentStatus ? 'Active' : 'Inactive'}.`, 'success');
    } catch (err) {
      showToast('Failed to update product visibility status.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Admin Delete Product
  const handleDeleteProduct = async (productId: string) => {
    setIsLoading(true);
    try {
      await db.products.delete(productId);
      if (isCloudConfigured()) {
        await deleteProductFromCloud(productId);
      }
      showToast('Product deleted from catalog successfully.', 'success');
      if (editingProductId === productId) {
        setEditingProductId(null);
      }
    } catch (err) {
      showToast('Failed to delete product.', 'error');
    } finally {
      setIsLoading(false);
      setProductToDeleteId(null);
    }
  };

  // Customer submit review helper
  const handleAddReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !user) return;
    if (!reviewComment.trim()) {
      showToast('Please type a comment for your product review.', 'error');
      return;
    }

    setIsLoading(true);
    try {
      const currentReviews = selectedProduct.reviews || [];
      const updatedReviews = [
        ...currentReviews,
        {
          reviewerName: user.name || 'Valued Customer',
          rating: reviewRating,
          comment: reviewComment.trim(),
          createdAt: Date.now(),
        },
      ];

      await db.products.update(selectedProduct.id, { reviews: updatedReviews });
      setSelectedProduct({
        ...selectedProduct,
        reviews: updatedReviews,
      });

      setReviewComment('');
      setReviewRating(5);
      showToast('Thank you! Your product review was submitted successfully.', 'success');
    } catch (err) {
      showToast('Failed to save product review.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Admin save global settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('fee_gst_enabled', String(gstEnabled));
    localStorage.setItem('fee_cgst', String(cgstRate));
    localStorage.setItem('fee_sgst', String(sgstRate));
    localStorage.setItem('fee_packaging', String(packagingFee));
    localStorage.setItem('seller_info_enabled', String(sellerInfoEnabled));
    
    if (isCloudConfigured()) {
      setIsLoading(true);
      try {
        await syncSettingsToCloud({
          gstEnabled,
          cgstRate,
          sgstRate,
          packagingFee,
          sellerInfoEnabled
        });
        showToast('Taxes & Packaging configuration synced to Cloud!', 'success');
      } catch (err) {
        showToast('Failed to sync configurations to cloud.', 'error');
      } finally {
        setIsLoading(false);
      }
    } else {
      showToast('Taxes & Packaging configuration updated locally!', 'success');
    }
  };

  // Print invoice handler
  const handlePrintInvoice = () => {
    window.print();
  };

  // Cart Calculations snapshots
  const rawSubtotal = cartItems.reduce((acc, item) => {
    const prod = products.find((p) => p.id === item.productId);
    return acc + (prod ? prod.price * item.quantity : 0);
  }, 0);

  const discountSaved = cartItems.reduce((acc, item) => {
    const prod = products.find((p) => p.id === item.productId);
    if (!prod) return acc;
    const finalPrice = getProductPrice(prod);
    return acc + (prod.price - finalPrice) * item.quantity;
  }, 0);

  const cartDeliverySum = cartItems.reduce((acc, item) => {
    const prod = products.find((p) => p.id === item.productId);
    return acc + (prod ? (prod.deliveryCharge || 0) * item.quantity : 0);
  }, 0);

  const cartSafetySum = cartItems.reduce((acc, item) => {
    const prod = products.find((p) => p.id === item.productId);
    return acc + (prod ? (prod.safetyFee || 0) * item.quantity : 0);
  }, 0);

  const cartNetPrice = rawSubtotal - discountSaved;
  const cartCgst = gstEnabled ? cartNetPrice * (cgstRate / 100) : 0;
  const cartSgst = gstEnabled ? cartNetPrice * (sgstRate / 100) : 0;
  const cartGrandTotal = cartNetPrice + cartCgst + cartSgst + cartDeliverySum + packagingFee + cartSafetySum;

  // Filter products for customer: only display active ones
  const activeProducts = products.filter(p => p.isActive !== false);

  // Filter orders for the logged-in customer
  const customerOrders = allOrders.filter(order => order.shippingInfo?.phone === user?.phone);

  // Countries options list
  const countries = Object.keys(LOCATION_DATA);
  // States list based on selected country
  const states = shipCountry ? Object.keys(LOCATION_DATA[shipCountry] || {}) : [];
  // Cities list based on selected state
  const cities = shipCountry && shipState ? LOCATION_DATA[shipCountry][shipState] || [] : [];

  return (
    <div className="min-h-screen bg-rose-50/50 text-slate-800 font-sans flex flex-col relative print:bg-white print:text-black">

      {/* Toast Alert Notification */}
      {toast && (
        <div className="fixed top-5 right-5 z-55 max-w-sm w-full bg-white border border-rose-100 rounded-xl shadow-2xl p-4 flex items-center gap-3 animate-in slide-in-from-top-10 duration-200 print:hidden">
          <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${toast.type === 'success' ? 'bg-emerald-500' : toast.type === 'error' ? 'bg-rose-500' : 'bg-amber-500'
            }`} />
          <div className="text-sm font-medium text-slate-700">{toast.message}</div>
          <button onClick={() => setToast(null)} className="ml-auto text-slate-400 hover:text-slate-600 font-bold">✕</button>
        </div>
      )}

      {/* Fullscreen Loader Overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-55 flex flex-col items-center justify-center bg-slate-955/20 backdrop-blur-[2px] print:hidden">
          <div className="bg-white p-6 rounded-2xl shadow-2xl border border-rose-50 flex flex-col items-center gap-3">
            <span className="w-10 h-10 border-4 border-rose-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-rose-700 tracking-wider uppercase animate-pulse">Processing...</span>
          </div>
        </div>
      )}

      {/* Top Banner & Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-rose-100 px-4 py-3 flex items-center justify-between shadow-sm print:hidden">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentPage('home')}>
          <img src="/logo.jpg" alt="KRP Creation Logo" className="w-16 h-16 object-contain rounded-full border border-rose-100 shadow-sm shrink-0" />
          <div className="flex flex-col">
            <span className="text-2xl font-extrabold bg-gradient-to-r from-rose-500 to-pink-600 bg-clip-text text-transparent leading-none">
              KRP Creation
            </span>
            <span className="text-xs tracking-wider text-rose-500 font-semibold mt-0.5">Ladies Garments</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border border-rose-100 bg-white shadow-sm">
            <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className={isOnline ? 'text-emerald-600' : 'text-rose-600'}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-white border-b border-rose-100 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm shadow-sm print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCurrentPage('home')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${currentPage === 'home' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-505 hover:text-slate-700 hover:bg-rose-55'
              }`}
          >
            Home
          </button>
          <button
            onClick={() => setCurrentPage('catalog')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${currentPage === 'catalog' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-505 hover:text-slate-700 hover:bg-rose-55'
              }`}
          >
            Catalog
          </button>
          <button
            onClick={() => setCurrentPage('cart')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${currentPage === 'cart' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-505 hover:text-slate-700 hover:bg-rose-55'
              }`}
          >
            Cart
            {cartItems.length > 0 && (
              <span className="bg-rose-100 text-rose-700 text-xs px-2 py-0.5 rounded-full font-bold">
                {cartItems.reduce((acc, i) => acc + i.quantity, 0)}
              </span>
            )}
          </button>
          
          {/* Customer Past Orders tab */}
          {user && (
            <button
              onClick={() => setCurrentPage('my-orders')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${currentPage === 'my-orders' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-550 hover:text-slate-700 hover:bg-rose-55'
                }`}
            >
              My Orders
            </button>
          )}
          
          {/* Admin panel tab is strictly visible only to logged-in admin */}
          {isAdmin(user?.phone) && (
            <button
              onClick={() => setCurrentPage('admin')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${currentPage === 'admin' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-505 hover:text-slate-700 hover:bg-rose-55'
                }`}
            >
              Admin Panel
            </button>
          )}
        </div>

        {/* User Session Info & Logout Button */}
        {user ? (
          <div className="flex items-center gap-2 text-xs text-slate-600 bg-rose-50/40 px-3 py-1 rounded-xl border border-rose-100/50 max-w-full overflow-hidden shrink-0">
            <span className="font-semibold text-slate-700 truncate max-w-[100px] sm:max-w-[150px]">Hi, {user.name}</span>
            <span className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-bold ${isAdmin(user.phone)
                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              }`}>
              {isAdmin(user.phone) ? 'Admin' : 'User'}
            </span>
            <button
              onClick={logout}
              className="bg-rose-600 hover:bg-rose-550 text-white text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors shadow-sm cursor-pointer shrink-0"
            >
              Logout
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCurrentPage('login')}
            className="text-xs text-rose-650 hover:text-rose-700 font-bold bg-rose-50 hover:bg-rose-100 px-3 py-1 rounded-lg border border-rose-100 transition-all shrink-0"
          >
            Sign In
          </button>
        )}
      </nav>

      {/* Main Content Areas */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 print:hidden">
        
        {/* Home Landing Page */}
        {currentPage === 'home' && (
          <div className="space-y-12 animate-in fade-in duration-300">
            {/* Hero Section */}
            <div className="relative bg-white rounded-3xl overflow-hidden border border-rose-100 shadow-sm p-6 sm:p-12 flex flex-col md:flex-row items-center gap-8">
              <div className="flex-1 space-y-6 text-center md:text-left">
                <span className="text-xs uppercase tracking-widest bg-rose-100 text-rose-700 px-3.5 py-1 rounded-full border border-rose-200 font-bold">
                  Est. 2026 Boutique
                </span>
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 font-serif leading-tight">
                  Discover Handcrafted <br />
                  <span className="bg-gradient-to-r from-rose-500 to-pink-600 bg-clip-text text-transparent">
                    Ladies Garments
                  </span>
                </h1>
                <p className="text-slate-500 text-sm sm:text-base leading-relaxed max-w-xl">
                  Welcome to <strong className="font-semibold text-rose-600">KRP Creation</strong>, where elegance meets premium quality. We offer an exquisite range of Sarees, Dresses, Kurtis, Salwar Suits, and Jackets meticulously crafted for all occasions. Whether you are dressing up for a grand Indian festival or looking for elegant daily comforts, our collections guarantee rich textures, durable stitching, and premium fabrics.
                </p>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2">
                  <button
                    onClick={() => setCurrentPage('catalog')}
                    className="bg-rose-600 hover:bg-rose-550 text-white font-bold text-sm px-6 py-3 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    Explore Catalog
                  </button>
                  {!user ? (
                    <button
                      onClick={() => setCurrentPage('login')}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-sm px-6 py-3 rounded-xl transition-all active:scale-95 cursor-pointer"
                    >
                      Sign In
                    </button>
                  ) : (
                    <button
                      onClick={() => setCurrentPage('my-orders')}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-sm px-6 py-3 rounded-xl transition-all active:scale-95 cursor-pointer"
                    >
                      View My Orders
                    </button>
                  )}
                </div>
              </div>
              <div className="w-64 h-64 sm:w-80 sm:h-80 shrink-0 relative overflow-hidden rounded-full border border-rose-200 shadow-md">
                <img
                  src="/model_kurti.png"
                  alt="Model wearing premium KRP Kurti"
                  className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-500"
                />
              </div>
            </div>

            {/* Quality & Features Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white border border-rose-100 p-6 rounded-2xl shadow-sm text-center space-y-3">
                <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">✨</div>
                <h3 className="font-bold text-base text-slate-800 font-serif">Premium Quality Fabrics</h3>
                <p className="text-xs text-slate-505 leading-relaxed">
                  Every product is sourced using the finest silk, cotton, and georgette threads. Designed to feel lightweight on daily wear yet rich and heavy for ceremonies.
                </p>
              </div>

              <div className="bg-white border border-rose-100 p-6 rounded-2xl shadow-sm text-center space-y-3">
                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">🎉</div>
                <h3 className="font-bold text-base text-slate-800 font-serif">Festive & Daily Versatility</h3>
                <p className="text-xs text-slate-505 leading-relaxed">
                  From intricate golden zari borders on sarees for Durga Puja/Diwali to comfortable, breathable cotton kurtis for work or home chores.
                </p>
              </div>

              <div className="bg-white border border-rose-100 p-6 rounded-2xl shadow-sm text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">🔒</div>
                <h3 className="font-bold text-base text-slate-800 font-serif">Secure Local Shopping</h3>
                <p className="text-xs text-slate-505 leading-relaxed">
                  Our offline first setup stores all your credentials and shopping logs in secure sandbox memory, allowing complete access even in areas with zero network.
                </p>
              </div>
            </div>

            {/* Fabric Spotlight block */}
            <div className="bg-rose-50/40 border border-rose-100 p-6 sm:p-8 rounded-3xl text-center max-w-3xl mx-auto space-y-4">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800 font-serif">Crafted for Every Celebration</h2>
              <p className="text-xs sm:text-sm text-slate-550 leading-relaxed">
                "KRP Creation was built on the values of traditional Indian garment craftsmanship. Our sarees feature heavy handloom designs, our salwar suits are tailored for ease of movement, and our modern kurtis blend traditional aesthetics with contemporary silhouettes. Choose KRP Creation to add elegance to your wardrobe."
              </p>
              <div className="text-xs font-bold text-rose-700">— Ranu Das Pal, Founder</div>
            </div>
          </div>
        )}

        {/* Catalog Page */}
        {currentPage === 'catalog' && (
          <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 font-serif">Our Collection</h1>
                <p className="text-slate-505 text-sm mt-1">Browse and shop our exclusive range of ladies garments offline.</p>
                {sellerInfoEnabled && (
                  <div className="mt-3.5 inline-flex items-center gap-2 bg-rose-100/50 border border-rose-200/80 px-3.5 py-1.5 rounded-lg text-xs text-rose-800 font-bold shadow-sm">
                    <span>👤 Shop Seller:</span>
                    <span>Ranu Das Pal (Contact: 7890784816)</span>
                  </div>
                )}
              </div>
              {!isOnline && pendingOrders.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg flex items-center justify-between gap-4 text-sm">
                  <span>
                    You have <strong>{pendingOrders.length}</strong> unsynced order(s) placed offline!
                  </span>
                  <button disabled className="bg-amber-200/50 cursor-not-allowed text-amber-850 px-3 py-1 rounded text-xs font-semibold">
                    Connect Online to Sync
                  </button>
                </div>
              )}
              {isOnline && pendingOrders.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg flex items-center justify-between gap-4 text-sm">
                  <span>
                    You have <strong>{pendingOrders.length}</strong> pending local orders to synchronize.
                  </span>
                  <button
                    onClick={handleSyncOrders}
                    className="bg-emerald-600 hover:bg-emerald-505 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Sync Now
                  </button>
                </div>
              )}
            </div>

            {activeProducts.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-rose-100 shadow-sm">
                <p className="text-slate-550">Currently no products are visible in our catalog.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeProducts.map((product) => {
                  const onSale = product.discount && product.discount > 0;
                  const discountedPrice = getProductPrice(product);
                  const isSoldOut = product.stock <= 0;

                  // Calculate average rating
                  const productReviews = product.reviews || [];
                  const avgRating = productReviews.length > 0
                    ? parseFloat((productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length).toFixed(1))
                    : null;

                  return (
                    <div
                      key={product.id}
                      onClick={() => setSelectedProduct(product)}
                      className="bg-white border border-rose-100/80 rounded-2xl overflow-hidden shadow-sm hover:shadow-md flex flex-col hover:border-rose-300 transition-all duration-300 group cursor-pointer relative"
                    >
                      {/* Specific Festive Sale banner */}
                      {product.isFestiveDiscount && (
                        <div className="absolute top-3 left-3 z-10 bg-amber-500 text-white text-[10px] uppercase font-extrabold px-2.5 py-1 rounded-full shadow-md animate-bounce">
                          {product.festiveName || 'Festive'} Offer!
                        </div>
                      )}

                      {/* Sold Out banner overlay */}
                      {isSoldOut && (
                        <div className="absolute inset-0 bg-slate-955/45 backdrop-blur-[1px] z-10 flex items-center justify-center pointer-events-none">
                          <span className="bg-rose-600 text-white text-sm font-extrabold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-lg transform -rotate-12 border-2 border-white">
                            Sold Out
                          </span>
                        </div>
                      )}

                      <div className="h-72 overflow-hidden bg-rose-50 relative">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-350"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-rose-100 border border-dashed border-rose-200 text-rose-500 font-bold text-xs gap-1">
                            <span>👗 No Image Available</span>
                            <span className="text-[10px] text-rose-455 font-normal">KRP Creation</span>
                          </div>
                        )}
                        <span className="absolute top-3 right-3 bg-white/95 text-rose-600 border border-rose-100 text-xs px-2.5 py-1 rounded-full font-semibold shadow-sm">
                          {product.category}
                        </span>
                      </div>
                      <div className="p-5 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start gap-2">
                            <h3 className="font-bold text-lg text-slate-800 group-hover:text-rose-600 transition-colors truncate">
                              {product.name}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-slate-400">Stock: {product.stock} items</span>
                            {onSale && (
                              <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-bold">
                                {product.discount}% OFF
                              </span>
                            )}
                          </div>

                          {/* Stars display */}
                          <div className="flex items-center gap-1 mt-2">
                            {avgRating ? (
                              <>
                                <span className="text-amber-500 font-bold text-xs">★ {avgRating}</span>
                                <span className="text-slate-400 text-[10px]">({productReviews.length} reviews)</span>
                              </>
                            ) : (
                              <span className="text-slate-400 text-[10px]">No reviews yet</span>
                            )}
                          </div>

                          <p className="text-sm text-slate-550 mt-2 line-clamp-2">{product.description}</p>
                        </div>
                        <div className="mt-4 flex items-center justify-between pt-3 border-t border-rose-50/50">
                          <div>
                            {onSale ? (
                              <div className="flex items-baseline gap-2">
                                <span className="text-xl font-extrabold text-slate-900">₹{discountedPrice.toFixed(2)}</span>
                                <span className="text-xs text-slate-400 line-through">₹{product.price.toFixed(2)}</span>
                              </div>
                            ) : (
                              <span className="text-xl font-extrabold text-slate-900">₹{product.price.toFixed(2)}</span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddToCart(product);
                            }}
                            disabled={isSoldOut}
                            className={`text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm ${isSoldOut
                                ? 'bg-slate-300 text-slate-550 cursor-not-allowed'
                                : 'bg-rose-600 hover:bg-rose-500 text-white'
                              }`}
                          >
                            Add to Cart
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Cart Page */}
        {currentPage === 'cart' && (
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 mb-6 font-serif">Shopping Cart</h1>
            {cartItems.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-rose-100 shadow-sm">
                <p className="text-slate-550">Your offline cart is empty.</p>
                <button
                  onClick={() => setCurrentPage('catalog')}
                  className="mt-4 text-rose-600 font-semibold hover:text-rose-700"
                >
                  Go Browse Products
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  {cartItems.map((item) => {
                    const prod = products.find((p) => p.id === item.productId);
                    if (!prod) return null;
                    const finalPrice = getProductPrice(prod);
                    const hasDiscount = prod.discount && prod.discount > 0;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-4 bg-white border border-rose-100 p-4 rounded-2xl shadow-sm"
                      >
                        {prod.imageUrl ? (
                          <img src={prod.imageUrl} alt={prod.name} className="w-20 h-20 object-cover rounded-lg bg-rose-50" />
                        ) : (
                          <div className="w-20 h-20 flex flex-col items-center justify-center bg-rose-100 border border-rose-200 text-rose-500 rounded-lg font-bold text-[9px] text-center px-1">
                            <span>👗 No Image</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-slate-800 truncate">{prod.name}</h4>
                          <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-rose-600 font-bold text-sm">₹{finalPrice.toFixed(2)}</span>
                            {hasDiscount && (
                              <span className="text-xs text-slate-400 line-through">₹{prod.price.toFixed(2)}</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1">
                            Charges: Del ₹{prod.deliveryCharge || 0} • Saf ₹{prod.safetyFee || 0}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                            className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 hover:bg-rose-100 flex items-center justify-center font-bold text-rose-700"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-bold text-slate-700">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.productId, Math.min(prod.stock, item.quantity + 1))}
                            className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 hover:bg-rose-100 flex items-center justify-center font-bold text-rose-700"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Cart pricing summary including new taxes/charges */}
                <div className="bg-white border border-rose-100 rounded-2xl p-5 h-fit space-y-4 shadow-sm text-sm">
                  <h3 className="font-bold text-base border-b border-rose-50 pb-3 text-slate-850">Price Breakdowns</h3>

                  <div className="flex justify-between text-slate-655">
                    <span>Subtotal (Base)</span>
                    <span>₹{rawSubtotal.toFixed(2)}</span>
                  </div>

                  {discountSaved > 0 && (
                    <div className="flex justify-between text-emerald-605 font-medium">
                      <span>Total Savings</span>
                      <span>-₹{discountSaved.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="border-t border-rose-50/50 my-1 pt-1 space-y-2 text-xs text-slate-500">
                    <div className="flex justify-between">
                      <span>CGST ({gstEnabled ? `${cgstRate}%` : 'Disabled'})</span>
                      <span>₹{cartCgst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SGST ({gstEnabled ? `${sgstRate}%` : 'Disabled'})</span>
                      <span>₹{cartSgst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Delivery Charge (Product specific)</span>
                      <span>₹{cartDeliverySum.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Packaging Fee</span>
                      <span>₹{packagingFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Safety Fee (Product specific)</span>
                      <span>₹{cartSafetySum.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between text-slate-905 font-bold text-base pt-2 border-t border-rose-100">
                    <span>Grand Total</span>
                    <span className="text-rose-600 font-black">₹{cartGrandTotal.toFixed(2)}</span>
                  </div>

                  <div className="mt-6 space-y-3">
                    <div className="flex items-center gap-2 text-xs text-slate-555 bg-rose-50/50 p-3 rounded-lg border border-rose-100">
                      <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span>
                        {isOnline ? 'Online Checkout mode' : 'Offline mode: Order will queue'}
                      </span>
                    </div>

                    <button
                      onClick={handleOpenCheckout}
                      className="w-full bg-rose-600 hover:bg-rose-550 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md"
                    >
                      Checkout & Pay
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Customer Past Orders Tab */}
        {currentPage === 'my-orders' && (
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 mb-6 font-serif">My Order History</h1>

            {customerOrders.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-rose-100 shadow-sm">
                <p className="text-slate-500">You haven't placed any purchases yet using this phone number.</p>
                <button
                  onClick={() => setCurrentPage('catalog')}
                  className="mt-4 text-rose-600 font-semibold hover:text-rose-700"
                >
                  Go Shop Garments
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {customerOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white border border-rose-100 p-6 rounded-2xl flex flex-col gap-4 text-sm shadow-sm"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-rose-50 pb-3 gap-2">
                      <div>
                        <div className="font-bold text-slate-800 text-base font-mono">Order #{order.receiptId || `KRP-${order.id}`}</div>
                        <div className="text-slate-400 text-xs mt-1">
                          {moment(order.createdAt).format('D MMMM YYYY hh:mm A')}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setActiveReceiptOrder(order)}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs px-3.5 py-1.5 rounded-lg border border-rose-200 transition-colors"
                        >
                          View / Print Receipt Bill
                        </button>
                        <span
                          className={`text-xs px-3.5 py-1 rounded-full font-bold border ${order.status === 'synced'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                        >
                          {order.status === 'synced' ? 'Placed Online' : 'Queued Offline'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                      {/* Products Summary list */}
                      <div className="md:col-span-2 space-y-2">
                        <div className="font-bold text-slate-700 mb-1">Purchased Products:</div>
                        {order.items.map((item, idx) => {
                          const p = products.find(prod => prod.id === item.productId);
                          return (
                            <div key={idx} className="flex justify-between items-center bg-rose-50/20 p-2.5 rounded-xl border border-rose-100/30">
                              <span className="font-semibold text-slate-700">
                                {p ? p.name : 'Ladies Garment'} <span className="text-slate-450 font-normal">x {item.quantity}</span>
                              </span>
                              <span className="font-bold text-slate-800">₹{(item.priceAtPurchase * item.quantity).toFixed(2)}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Summary financials */}
                      {order.summary && (
                        <div className="bg-rose-50/30 border border-rose-100/60 rounded-xl p-4 space-y-1 text-slate-550">
                          <div className="font-bold text-slate-700 border-b border-rose-100/40 pb-1 mb-2 uppercase tracking-wider">Financial Breakdown:</div>
                          <div className="flex justify-between">
                            <span>Subtotal:</span>
                            <span>₹{order.summary.subtotal.toFixed(2)}</span>
                          </div>
                          {order.summary.discountSaved > 0 && (
                            <div className="flex justify-between text-emerald-600 font-semibold">
                              <span>Saved Discount:</span>
                              <span>-₹{order.summary.discountSaved.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>CGST/SGST Taxes:</span>
                            <span>₹{(order.summary.cgst + order.summary.sgst).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Delivery/Fees:</span>
                            <span>₹{(order.summary.delivery + order.summary.packaging + order.summary.safety).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between border-t border-rose-200 pt-1.5 font-bold text-slate-800">
                            <span>Total Paid:</span>
                            <span className="text-rose-600 font-black">₹{order.totalAmount.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Login Page */}
        {currentPage === 'login' && (
          <div className="max-w-md mx-auto bg-white border border-rose-100 rounded-2xl p-6 shadow-md">
            <div className="flex justify-center mb-4">
              <img src="/logo.jpg" alt="KRP Creation Logo" className="w-32 h-32 object-contain rounded-full border border-rose-100 shadow-sm" />
            </div>
            <h2 className="text-2xl font-bold text-center text-slate-800 mb-1 font-serif">Sign In</h2>
            <p className="text-center text-slate-455 text-xs mb-6">Authenticate locally and completely offline.</p>

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-505 uppercase tracking-wider mb-1">Phone Number</label>
                <input
                  type="tel"
                  required
                  pattern="[0-9]*"
                  inputMode="numeric"
                  placeholder="Phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-rose-50/30 border border-rose-100 rounded-lg p-2.5 text-slate-800 focus:border-rose-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-505 uppercase tracking-wider mb-1">PIN</label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  placeholder="6-digit PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-rose-50/30 border border-rose-100 rounded-lg p-2.5 text-slate-800 focus:border-rose-400 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-rose-600 hover:bg-rose-505 text-white font-bold py-2.5 rounded-lg transition-colors shadow-sm"
              >
                Sign In
              </button>
            </form>
            <div className="text-center mt-6 text-sm text-slate-500">
              Don't have a local account?{' '}
              <button onClick={() => setCurrentPage('register')} className="text-rose-600 hover:text-rose-700 font-semibold">
                Register
              </button>
            </div>
          </div>
        )}

        {/* Register Page */}
        {currentPage === 'register' && (
          <div className="max-w-md mx-auto bg-white border border-rose-100 rounded-2xl p-6 shadow-md">
            <div className="flex justify-center mb-4">
              <img src="/logo.jpg" alt="KRP Creation Logo" className="w-32 h-32 object-contain rounded-full border border-rose-100 shadow-sm" />
            </div>
            <h2 className="text-2xl font-bold text-center text-slate-800 mb-1 font-serif">Create Account</h2>
            <p className="text-center text-slate-455 text-xs mb-6">Credentials will be hashed & stored inside IndexedDB.</p>

            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-550 uppercase tracking-wider mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-rose-50/30 border border-rose-100 rounded-lg p-2.5 text-slate-800 focus:border-rose-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-550 uppercase tracking-wider mb-1">Phone Number </label>
                <input
                  type="tel"
                  required
                  pattern="[0-9]*"
                  inputMode="numeric"
                  placeholder="Phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-rose-50/30 border border-rose-100 rounded-lg p-2.5 text-slate-800 focus:border-rose-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-550 uppercase tracking-wider mb-1">PIN (6 Digits, Numbers Only)</label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  placeholder="6-digit PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-rose-50/30 border border-rose-100 rounded-lg p-2.5 text-slate-800 focus:border-rose-400 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-rose-600 hover:bg-rose-555 text-white font-bold py-2.5 rounded-lg transition-colors shadow-sm"
              >
                Register
              </button>
            </form>
            <div className="text-center mt-6 text-sm text-slate-500">
              Already registered?{' '}
              <button onClick={() => setCurrentPage('login')} className="text-rose-600 hover:text-rose-700 font-semibold">
                Sign In
              </button>
            </div>
          </div>
        )}

        {/* Admin Panel Page */}
        {currentPage === 'admin' && (
          <div>
            <div className="flex items-center justify-between border-b border-rose-100 pb-4 mb-6">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-800 font-serif">Admin Dashboard</h1>
                <p className="text-slate-505 text-sm mt-1">Requires stable internet connection to write modifications.</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border border-rose-100 bg-white">
                <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-555'}`} />
                <span className={isOnline ? 'text-emerald-600' : 'text-rose-600'}>
                  {isOnline ? 'Authorized (Online)' : 'Blocked (Offline)'}
                </span>
              </div>
            </div>

            {!isOnline ? (
              <div className="max-w-md mx-auto text-center py-12 bg-rose-50 border border-rose-100 rounded-2xl p-6 shadow-sm">
                <h3 className="text-xl font-bold text-rose-700 mb-2">Access Restrained</h3>
                <p className="text-sm text-slate-550 leading-relaxed">
                  The Admin Dashboard works strictly with live networks to update the pricing databases, configure catalogs, and view synced global transactions.
                </p>
                <div className="mt-4 text-xs text-rose-700 bg-rose-100/50 p-2.5 rounded-lg border border-rose-200">
                  Please connect to the internet to authorize access.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Add Product and Manage Product controls */}
                <div className="lg:col-span-1 space-y-6">

                  {/* Fee & Tax configuration panel (With GST toggle permission) */}
                  <div className="bg-white border border-rose-100 rounded-2xl p-5 shadow-sm space-y-4">
                    <h3 className="font-bold text-lg border-b border-rose-50 pb-2 text-slate-850">Taxes & Packaging Configuration</h3>
                    <form onSubmit={handleSaveSettings} className="space-y-3 text-xs">

                      {/* GST Toggle Switch */}
                      <div className="flex items-center gap-2 bg-rose-50/50 p-2.5 rounded-lg border border-rose-100/60 mb-2">
                        <input
                          type="checkbox"
                          id="gstToggle"
                          checked={gstEnabled}
                          onChange={(e) => setGstEnabled(e.target.checked)}
                          className="accent-rose-650 cursor-pointer h-4 w-4"
                        />
                        <label htmlFor="gstToggle" className="text-slate-700 font-bold cursor-pointer">
                          Enable GST & CGST Taxes
                        </label>
                      </div>

                      {gstEnabled && (
                        <div className="grid grid-cols-2 gap-2.5 animate-in fade-in duration-150">
                          <div>
                            <label className="block text-slate-500 mb-1">CGST (%)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={cgstRate}
                              onChange={(e) => setCgstRate(parseFloat(e.target.value) || 0)}
                              className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2 focus:outline-none focus:border-rose-400"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-500 mb-1">SGST (%)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={sgstRate}
                              onChange={(e) => setSgstRate(parseFloat(e.target.value) || 0)}
                              className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2 focus:outline-none focus:border-rose-400"
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-slate-500 mb-1">Packaging Fee (₹)</label>
                        <input
                          type="number"
                          value={packagingFee}
                          onChange={(e) => setPackagingFee(parseFloat(e.target.value) || 0)}
                          className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2 focus:outline-none focus:border-rose-400"
                        />
                      </div>

                      {/* Seller Info Toggle Switch */}
                      <div className="flex items-center gap-2 bg-rose-50/50 p-2.5 rounded-lg border border-rose-100/60 mb-2">
                        <input
                          type="checkbox"
                          id="sellerToggle"
                          checked={sellerInfoEnabled}
                          onChange={(e) => setSellerInfoEnabled(e.target.checked)}
                          className="accent-rose-650 cursor-pointer h-4 w-4"
                        />
                        <label htmlFor="sellerToggle" className="text-slate-700 font-bold cursor-pointer">
                          Show Seller Contact Details
                        </label>
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 rounded-lg transition-colors shadow-sm text-[11px]"
                      >
                        Save Configurations
                      </button>
                    </form>
                  </div>

                  {/* Cloud Sync Connector configuration */}
                  <div className="bg-white border border-rose-100 rounded-2xl p-5 shadow-sm space-y-4">
                    <h3 className="font-bold text-lg border-b border-rose-50 pb-2 text-slate-850">Cloud Sync Connector (Supabase)</h3>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      localStorage.setItem('supabase_url', supabaseUrl.trim());
                      localStorage.setItem('supabase_key', supabaseKey.trim());
                      showToast('Supabase Cloud credentials updated!', 'success');
                      if (supabaseUrl.trim() && supabaseKey.trim()) {
                        setIsLoading(true);
                        try {
                          const count = await pullProductsFromCloud();
                          showToast(`Initial sync completed: loaded ${count} products!`, 'success');
                        } catch (err) {
                          showToast('Initial sync failed: please verify URL and Key.', 'error');
                        } finally {
                          setIsLoading(false);
                        }
                      }
                    }} className="space-y-3 text-xs">
                      <div>
                        <label className="block text-slate-500 mb-1">Supabase Project URL</label>
                        <input
                          type="text"
                          required
                          placeholder="https://xxxx.supabase.co"
                          value={supabaseUrl}
                          onChange={(e) => setSupabaseUrl(e.target.value)}
                          className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2 focus:outline-none focus:border-rose-400"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 mb-1">Supabase Anon Key</label>
                        <input
                          type="password"
                          required
                          placeholder="eyJhbGciOi..."
                          value={supabaseKey}
                          onChange={(e) => setSupabaseKey(e.target.value)}
                          className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2 focus:outline-none focus:border-rose-400"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full bg-rose-600 hover:bg-rose-550 text-white font-bold py-2 rounded-lg transition-colors shadow-sm"
                      >
                        Save & Connect
                      </button>
                    </form>
                    {isCloudConfigured() && isAdmin(user?.phone) ? (
                      <div className="space-y-3">
                        <div className="text-[10px] text-emerald-600 font-bold bg-emerald-50 p-2.5 rounded-lg text-center border border-emerald-100">
                          Connected to Cloud Database
                        </div>
                        <div className="bg-rose-50/50 border border-rose-100 p-3 rounded-xl text-[10px] space-y-2 text-slate-700 font-medium">
                          <div className="font-bold text-rose-700 uppercase tracking-widest text-[9px] mb-1">Active Credentials:</div>
                          <div className="flex items-center justify-between gap-2 border-b border-rose-100/50 pb-1.5">
                            <span className="truncate">URL: <strong>{supabaseUrl}</strong></span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(supabaseUrl);
                                showToast('Project URL copied to clipboard!', 'success');
                              }}
                              className="text-[9px] bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold px-2 py-0.5 rounded border border-rose-200 cursor-pointer shrink-0"
                            >
                              Copy
                            </button>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">Key: <strong>{supabaseKey}</strong></span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(supabaseKey);
                                showToast('Anon Key copied to clipboard!', 'success');
                              }}
                              className="text-[9px] bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold px-2 py-0.5 rounded border border-rose-200 cursor-pointer shrink-0"
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-amber-600 font-bold bg-amber-50 p-2.5 rounded-lg text-center border border-amber-100">
                        Running in Local-Only Mode
                      </div>
                    )}
                  </div>

                  {/* Add Product form */}
                  <div className="bg-white border border-rose-100 rounded-2xl p-5 h-fit space-y-4 shadow-sm">
                    <h3 className="font-bold text-lg border-b border-rose-50 pb-2 text-slate-800">Add New Catalog Product</h3>
                    <form onSubmit={handleAddProduct} className="space-y-4 text-sm">
                      <div>
                        <label className="block text-slate-600 mb-1">Product Name</label>
                        <input
                          type="text"
                          required
                          value={newProductName}
                          onChange={(e) => setNewProductName(e.target.value)}
                          className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2 focus:border-rose-400 focus:outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-slate-600 mb-1">Price (₹)</label>
                          <input
                            type="number"
                            step="0.01"
                            required
                            min="0"
                            value={newProductPrice}
                            onChange={(e) => setNewProductPrice(e.target.value)}
                            className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2 focus:border-rose-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-600 mb-1">Del Charge (₹)</label>
                          <input
                            type="number"
                            required
                            min="0"
                            value={newProductDelivery}
                            onChange={(e) => setNewProductDelivery(e.target.value)}
                            className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2 focus:border-rose-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-600 mb-1">Safety Fee (₹)</label>
                          <input
                            type="number"
                            required
                            min="0"
                            value={newProductSafety}
                            onChange={(e) => setNewProductSafety(e.target.value)}
                            className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2 focus:border-rose-400 focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-slate-600 mb-1">Description</label>
                        <textarea
                          required
                          value={newProductDesc}
                          onChange={(e) => setNewProductDesc(e.target.value)}
                          className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2 focus:border-rose-400 focus:outline-none h-16"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-600 mb-1">Category</label>
                          <select
                            value={newProductCategory}
                            onChange={(e) => setNewProductCategory(e.target.value)}
                            className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2 focus:border-rose-400 focus:outline-none"
                          >
                            <option value="Saree">Saree</option>
                            <option value="Dress">Dress</option>
                            <option value="Kurti">Kurti</option>
                            <option value="Salwar Suit">Salwar Suit</option>
                            <option value="Jackets">Jackets</option>
                          </select>
                        </div>

                        {/* Festival selector */}
                        <div>
                          <label className="block text-slate-600 mb-1">Festive Offer</label>
                          <select
                            value={newProductFestival}
                            onChange={(e) => setNewProductFestival(e.target.value)}
                            className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2 focus:border-rose-400 focus:outline-none"
                          >
                            <option value="">None / Standard</option>
                            {FESTIVAL_OPTIONS.map(f => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Image Source - URL or File upload options */}
                      <div className="space-y-3 pt-1 border-t border-rose-50">
                        <div>
                          <label className="block text-slate-600 mb-1">Upload Product Image</label>
                          <input
                            id="newProductFileInput"
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleFileUpload(e, setNewProductImage)}
                            className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-1.5 focus:outline-none text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-600 mb-1">Or Paste Image URL</label>
                          <input
                            type="text"
                            placeholder="https://example.com/image.jpg"
                            value={newProductImage}
                            onChange={(e) => setNewProductImage(e.target.value)}
                            className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2 focus:border-rose-400 focus:outline-none text-xs"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-rose-600 hover:bg-rose-550 text-white font-bold py-2 rounded-lg transition-colors shadow-sm"
                      >
                        Save Product to Database
                      </button>
                    </form>
                  </div>

                </div>

                {/* Orders dashboard + Manage stock list */}
                <div className="lg:col-span-2 space-y-6">

                  {/* Products stock, pricing fees, and visibility management list */}
                  <div className="bg-white border border-rose-100 rounded-2xl p-5 shadow-sm">
                    <h3 className="font-bold text-lg text-slate-800 border-b border-rose-50 pb-2 mb-4">Stock, Fees & Visibility Editor</h3>
                    <div className="space-y-3 max-h-72 overflow-y-auto pr-2">
                      {products.map((prod) => (
                        <div key={prod.id} className="bg-rose-50/20 border border-rose-100/60 p-3 rounded-xl flex items-center justify-between gap-4 text-xs shadow-inner">
                          <div className="flex gap-2.5 items-center">
                            {prod.imageUrl ? (
                              <img src={prod.imageUrl} alt={prod.name} className="w-12 h-12 object-cover rounded bg-rose-50 shrink-0" />
                            ) : (
                              <div className="w-12 h-12 flex items-center justify-center bg-rose-100 text-rose-505 rounded shrink-0 font-bold text-[8px]">
                                No Image
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-slate-805 flex items-center gap-1.5">
                                <span>{prod.name}</span>
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${prod.isActive !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                  }`}>
                                  {prod.isActive !== false ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              <div className="text-slate-500 mt-0.5">
                                Price: ₹{prod.price.toFixed(2)} • Stock: <span className={`font-semibold ${prod.stock <= 0 ? 'text-rose-600' : 'text-slate-700'}`}>{prod.stock}</span>
                              </div>
                              <div className="text-[10px] text-slate-450 mt-0.5">
                                Del Charge: ₹{prod.deliveryCharge || 0} • Safety Fee: ₹{prod.safetyFee || 0}
                              </div>
                              {prod.discount && prod.discount > 0 ? (
                                <div className="text-rose-600 font-bold mt-0.5">Offer: {prod.discount}% OFF {prod.isFestiveDiscount ? `(${prod.festiveName || 'Festive'} Active)` : ''}</div>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex gap-1.5 shrink-0">
                            {/* Fast Active / Inactive toggle */}
                            <button
                              onClick={() => handleToggleProductActive(prod.id, prod.isActive !== false)}
                              className={`px-2 py-1 rounded font-semibold border ${prod.isActive !== false
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                }`}
                            >
                              {prod.isActive !== false ? 'Hide' : 'Show'}
                            </button>
                            <button
                              onClick={() => {
                                setEditingProductId(prod.id);
                                setEditStock(String(prod.stock));
                                setEditPrice(String(prod.price));
                                setEditDiscount(String(prod.discount || ''));
                                setEditFestivalName(prod.festiveName || '');
                                setEditDeliveryCharge(String(prod.deliveryCharge || 0));
                                setEditSafetyFee(String(prod.safetyFee || 0));
                                setEditIsActive(prod.isActive !== false);
                                setEditProductImage(prod.imageUrl || '');
                              }}
                              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-1 rounded font-semibold"
                            >
                              Edit details
                            </button>
                            <button
                              onClick={() => setProductToDeleteId(prod.id)}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2 py-1 rounded font-semibold transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Orders Log */}
                  <div className="bg-white border border-rose-100 rounded-2xl p-5 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-lg text-slate-805">Orders Log</h3>
                      {pendingOrders.length > 0 && (
                        <button
                          onClick={handleSyncOrders}
                          className="bg-emerald-600 hover:bg-emerald-550 text-white font-semibold py-1 px-3 rounded-lg text-xs transition-colors"
                        >
                          Sync Offline Orders ({pendingOrders.length})
                        </button>
                      )}
                    </div>
                    {allOrders.length === 0 ? (
                      <p className="text-slate-400 text-sm">No orders registered on this device.</p>
                    ) : (
                      <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                        {allOrders.map((order) => (
                          <div
                            key={order.id}
                            className="bg-rose-50/30 border border-rose-100 p-4 rounded-2xl flex flex-col gap-3 text-sm shadow-sm"
                          >
                            <div className="flex justify-between items-start border-b border-rose-100/50 pb-2">
                              <div>
                                <span className="font-bold text-slate-800 font-mono">Order #{order.receiptId || `KRP-${order.id}`}</span>
                                <span className="text-slate-400 text-xs ml-3">
                                  {moment(order.createdAt).format('D MMMM YYYY hh:mm A')}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {/* Admin Invoice / Bill trigger option */}
                                <button
                                  onClick={() => setActiveReceiptOrder(order)}
                                  className="bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-xs px-2.5 py-0.5 rounded border border-rose-250 transition-colors"
                                >
                                  View / Print Bill
                                </button>
                                <span
                                  className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${order.status === 'synced'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                    }`}
                                >
                                  {order.status === 'synced' ? 'Synced' : 'Pending Sync'}
                                </span>
                              </div>
                            </div>

                            {order.shippingInfo && (
                              <div className="bg-white p-3 rounded-xl border border-rose-100/80 space-y-1 text-slate-600 text-xs shadow-inner">
                                <div className="font-bold text-slate-700 mb-1">Customer & Delivery Info:</div>
                                <div><strong>Name:</strong> {order.shippingInfo.fullName}</div>
                                <div><strong>Phone:</strong> {order.shippingInfo.phone}</div>
                                <div><strong>Address:</strong> {order.shippingInfo.address}, {order.shippingInfo.city}, {order.shippingInfo.state}, {order.shippingInfo.country} - {order.shippingInfo.pincode}</div>
                              </div>
                            )}

                            {order.summary && (
                              <div className="bg-rose-50/20 p-3 rounded-xl border border-rose-100/40 text-xs space-y-1 text-slate-550">
                                <div className="font-bold text-slate-605 mb-1">Cost Breakdown:</div>
                                <div className="flex justify-between">
                                  <span>Subtotal:</span>
                                  <span>₹{order.summary.subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-emerald-600">
                                  <span>Discount Saved:</span>
                                  <span>-₹{order.summary.discountSaved.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>CGST/SGST Taxes:</span>
                                  <span>₹{(order.summary.cgst + order.summary.sgst).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Extra Fees (Delivery, Pkg, Safety):</span>
                                  <span>₹{(order.summary.delivery + order.summary.packaging + order.summary.safety).toFixed(2)}</span>
                                </div>
                              </div>
                            )}

                            <div className="flex justify-between items-center text-xs text-slate-555 font-medium">
                              <span>{order.items.reduce((acc, i) => acc + i.quantity, 0)} items purchased</span>
                              <span>Total: <strong className="font-bold text-rose-600 text-sm">₹{order.totalAmount.toFixed(2)}</strong></span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>
        )}
      </main>

      {/* Checkout Shipping Form Modal */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm print:hidden">
          <div className="bg-white border border-rose-100 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl relative animate-in fade-in zoom-in duration-200 text-slate-805 p-6">
            <button
              onClick={() => setIsCheckoutOpen(false)}
              className="absolute top-3 right-3 bg-rose-50 hover:bg-rose-100 text-rose-700 w-8 h-8 rounded-full flex items-center justify-center font-bold transition-colors border border-rose-100"
            >
              ✕
            </button>
            <h3 className="text-xl font-bold text-slate-800 mb-2 border-b border-rose-55 pb-2 font-serif">Delivery Information</h3>
            <p className="text-xs text-slate-505 mb-4">All delivery address fields are mandatory.</p>

            <form onSubmit={handleShippingSubmit} className="space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-655 mb-1">Receiver's Name *</label>
                <input
                  type="text"
                  required
                  value={shipName}
                  onChange={(e) => setShipName(e.target.value)}
                  className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2.5 focus:border-rose-450 focus:outline-none text-slate-850"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-655 mb-1">Contact Phone *</label>
                <input
                  type="tel"
                  required
                  pattern="[0-9]*"
                  inputMode="numeric"
                  value={shipPhone}
                  onChange={(e) => setShipPhone(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2.5 focus:border-rose-455 focus:outline-none text-slate-850"
                />
              </div>

              {/* Relative dropdown: Country */}
              <div>
                <label className="block text-xs font-semibold text-slate-655 mb-1">Country *</label>
                <select
                  required
                  value={shipCountry}
                  onChange={(e) => setShipCountry(e.target.value)}
                  className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2.5 focus:border-rose-455 focus:outline-none text-slate-850"
                >
                  <option value="">Select Country</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Relative dropdown: State */}
              <div>
                <label className="block text-xs font-semibold text-slate-655 mb-1">State *</label>
                <select
                  required
                  disabled={!shipCountry}
                  value={shipState}
                  onChange={(e) => setShipState(e.target.value)}
                  className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2.5 focus:border-rose-455 focus:outline-none text-slate-850 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Select State</option>
                  {states.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Relative dropdown: City */}
              <div>
                <label className="block text-xs font-semibold text-slate-655 mb-1">City *</label>
                <select
                  required
                  disabled={!shipState}
                  value={shipCity}
                  onChange={(e) => setShipCity(e.target.value)}
                  className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2.5 focus:border-rose-455 focus:outline-none text-slate-850 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Select City</option>
                  {cities.map((ci) => (
                    <option key={ci} value={ci}>{ci}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-655 mb-1">Street Address *</label>
                <textarea
                  required
                  placeholder="Flat No, Building, Street Name..."
                  value={shipAddress}
                  onChange={(e) => setShipAddress(e.target.value)}
                  className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2.5 focus:border-rose-455 focus:outline-none h-16 resize-none text-slate-850"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-655 mb-1">Pincode / ZIP * </label>
                <input
                  type="text"
                  required
                  pattern="[0-9]*"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit Pincode"
                  value={shipPincode}
                  onChange={(e) => setShipPincode(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2.5 focus:border-rose-450 focus:outline-none text-slate-850"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-rose-600 hover:bg-rose-550 text-white font-bold py-2.5 rounded-lg transition-colors shadow-md mt-4 text-sm"
              >
                Proceed to Payment
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Payment Scan QR & UPI ID Modal */}
      {isPaymentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm print:hidden">
          <div className="bg-white border border-rose-100 w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl relative animate-in fade-in zoom-in duration-200 text-slate-805 p-6 text-center">
            <button
              onClick={() => setIsPaymentOpen(false)}
              className="absolute top-3 right-3 bg-rose-50 hover:bg-rose-100 text-rose-700 w-8 h-8 rounded-full flex items-center justify-center font-bold border border-rose-100"
            >
              ✕
            </button>
            <h3 className="text-xl font-bold text-slate-800 mb-2 font-serif border-b border-rose-50 pb-2">Scan & Pay</h3>
            <p className="text-xs text-slate-505 mb-5">Scan this QR code using any UPI application to complete payment.</p>

            <div className="my-5">
              <svg className="w-48 h-48 mx-auto border-2 border-rose-100 p-2.5 rounded-2xl bg-white shadow-sm" viewBox="0 0 100 100">
                <rect width="100" height="100" fill="#fff" />
                <rect x="5" y="5" width="20" height="20" fill="#e11d48" />
                <rect x="8" y="8" width="14" height="14" fill="#fff" />
                <rect x="11" y="11" width="8" height="8" fill="#e11d48" />

                <rect x="75" y="5" width="20" height="20" fill="#e11d48" />
                <rect x="78" y="8" width="14" height="14" fill="#fff" />
                <rect x="81" y="11" width="8" height="8" fill="#e11d48" />

                <rect x="5" y="75" width="20" height="20" fill="#e11d48" />
                <rect x="8" y="78" width="14" height="14" fill="#fff" />
                <rect x="11" y="81" width="8" height="8" fill="#e11d48" />

                <rect x="75" y="75" width="20" height="20" fill="#e11d48" />
                <rect x="78" y="78" width="14" height="14" fill="#fff" />
                <rect x="81" y="81" width="8" height="8" fill="#e11d48" />

                <rect x="35" y="15" width="8" height="8" fill="#1e293b" />
                <rect x="50" y="25" width="12" height="6" fill="#1e293b" />
                <rect x="35" y="45" width="10" height="10" fill="#1e293b" />
                <rect x="55" y="45" width="15" height="5" fill="#1e293b" />
                <rect x="40" y="70" width="8" height="15" fill="#1e293b" />
                <rect x="60" y="70" width="10" height="10" fill="#1e293b" />

                <circle cx="50" cy="50" r="10" fill="#e11d48" />
                <text x="50" y="53" fontSize="8" fontWeight="bold" fill="#fff" textAnchor="middle">KRP</text>
              </svg>
            </div>

            <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl mb-4 text-xs space-y-1">
              <div className="text-[10px] text-slate-455 uppercase tracking-widest font-semibold">Payment Details</div>
              <div className="text-xs font-bold text-slate-700 select-all">UPI ID: payment@krpcreation</div>
              {sellerInfoEnabled && (
                <div className="text-[10px] text-slate-500 border-t border-rose-100/40 pt-1 mt-1 font-medium">
                  Seller: <strong>Ranu Das Pal</strong> (7890784816)
                </div>
              )}
            </div>

            <div className="flex justify-between items-center text-sm font-bold mb-5 px-1 text-slate-700">
              <span>Amount to Pay:</span>
              <span className="text-lg text-rose-600 font-black">₹{cartGrandTotal.toFixed(2)}</span>
            </div>

            <button
              onClick={handleConfirmPayment}
              className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-lg transition-colors shadow-md text-sm"
            >
              Confirm Payment & Finalize
            </button>
          </div>
        </div>
      )}

      {/* Bill / Invoice Receipt Modal (Supports full window print or download layout) */}
      {activeReceiptOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm print:fixed print:inset-0 print:bg-white print:p-0">
          <div className="bg-white border border-rose-150 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl relative animate-in fade-in zoom-in duration-200 text-slate-800 p-6 flex flex-col justify-between print:border-none print:shadow-none print:w-full print:max-w-none print:rounded-none">

            {/* Bill Header */}
            <div className="border-b border-rose-100 pb-4 mb-4 flex justify-between items-start">
              <div className="flex items-center gap-4">
                <img src="/logo.jpg" alt="KRP Creation Logo" className="w-24 h-24 object-contain rounded-full border border-rose-100 shadow-sm shrink-0" />
                <div>
                  <h1 className="text-3xl font-black text-rose-600 tracking-tight leading-none">KRP Creation</h1>
                  <p className="text-sm text-slate-500 mt-1.5 font-semibold">Exclusive Ladies Garments Boutique</p>
                  <p className="text-xs text-slate-455 mt-1">Receipt ID: {activeReceiptOrder.receiptId || `KRP-${activeReceiptOrder.id}`}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs bg-rose-100 text-rose-700 px-2.5 py-0.5 rounded-full font-bold uppercase border border-rose-200 print:border">
                  PAID
                </span>
                <p className="text-xs text-slate-400 mt-2">
                  {moment(activeReceiptOrder.createdAt).format('D MMMM YYYY hh:mm A')}
                </p>
              </div>
            </div>

            {/* Bill Body - Delivery & Seller Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-rose-50/30 border border-rose-100/60 rounded-xl p-4 text-xs space-y-1.5 shadow-inner">
                <div className="font-bold text-slate-700 border-b border-rose-100/40 pb-1 mb-2 uppercase tracking-wider">Shipping & Billing Address:</div>
                <div><strong>Recipient Name:</strong> {activeReceiptOrder.shippingInfo.fullName}</div>
                <div><strong>Phone Number:</strong> {activeReceiptOrder.shippingInfo.phone}</div>
                <div><strong>Street Address:</strong> {activeReceiptOrder.shippingInfo.address}</div>
                <div><strong>City, State, Country:</strong> {activeReceiptOrder.shippingInfo.city}, {activeReceiptOrder.shippingInfo.state}, {activeReceiptOrder.shippingInfo.country}</div>
                <div><strong>Pincode / ZIP:</strong> {activeReceiptOrder.shippingInfo.pincode}</div>
              </div>

              {sellerInfoEnabled ? (
                <div className="bg-rose-50/30 border border-rose-100/60 rounded-xl p-4 text-xs space-y-1.5 shadow-inner">
                  <div className="font-bold text-slate-700 border-b border-rose-100/40 pb-1 mb-2 uppercase tracking-wider">Seller Details:</div>
                  <div className="text-sm font-bold text-rose-700">Ranu Das Pal</div>
                  <div><strong>Contact Phone:</strong> 7890784816</div>
                  <div className="text-slate-450 text-[10px] mt-2">For inquiries, returns, or support relating to this receipt, please call the number above.</div>
                </div>
              ) : (
                <div className="border border-dashed border-rose-100/60 rounded-xl p-4 flex items-center justify-center text-xs text-slate-455">
                  Seller details hidden by administrator
                </div>
              )}
            </div>

            {/* Purchased Items Table - Displays discounts clearly */}
            <div className="mb-4 flex-1 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-rose-100 text-slate-400 uppercase font-semibold">
                    <th className="py-2">Item Description</th>
                    <th className="py-2 text-center">Qty</th>
                    <th className="py-2 text-right">Original Price</th>
                    <th className="py-2 text-right">Discount</th>
                    <th className="py-2 text-right">Final Price</th>
                    <th className="py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {activeReceiptOrder.items.map((item, idx) => {
                    const prod = products.find((p) => p.id === item.productId);
                    const originalPrice = prod ? prod.price : item.priceAtPurchase;
                    const discount = prod && prod.discount ? prod.discount : 0;
                    return (
                      <tr key={idx} className="border-b border-rose-50/50">
                        <td className="py-2.5 font-semibold text-slate-700">{prod ? prod.name : ' Ladies Garment'}</td>
                        <td className="py-2.5 text-center text-slate-600">{item.quantity}</td>
                        <td className="py-2.5 text-right text-slate-505">₹{originalPrice.toFixed(2)}</td>
                        <td className="py-2.5 text-right text-rose-600 font-semibold">{discount > 0 ? `${discount}% OFF` : '-'}</td>
                        <td className="py-2.5 text-right text-slate-600">₹{item.priceAtPurchase.toFixed(2)}</td>
                        <td className="py-2.5 text-right font-bold text-slate-700">₹{(item.priceAtPurchase * item.quantity).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bill Summary totals itemized including taxes and admin-configured fees */}
            {activeReceiptOrder.summary && (
              <div className="border-t border-rose-100 pt-3 flex flex-col items-end gap-1 text-xs text-slate-600 font-medium mb-4">
                <div className="flex justify-between w-64">
                  <span>Subtotal (Base Price):</span>
                  <span>₹{activeReceiptOrder.summary.subtotal.toFixed(2)}</span>
                </div>
                {activeReceiptOrder.summary.discountSaved > 0 && (
                  <div className="flex justify-between w-64 text-emerald-600 font-semibold">
                    <span>Discount Saved:</span>
                    <span>-₹{activeReceiptOrder.summary.discountSaved.toFixed(2)}</span>
                  </div>
                )}
                {activeReceiptOrder.summary.cgst > 0 && (
                  <div className="flex justify-between w-64 border-t border-rose-50/30 pt-1">
                    <span>CGST:</span>
                    <span>₹{activeReceiptOrder.summary.cgst.toFixed(2)}</span>
                  </div>
                )}
                {activeReceiptOrder.summary.sgst > 0 && (
                  <div className="flex justify-between w-64">
                    <span>SGST:</span>
                    <span>₹{activeReceiptOrder.summary.sgst.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between w-64">
                  <span>Delivery Charge:</span>
                  <span>₹{activeReceiptOrder.summary.delivery.toFixed(2)}</span>
                </div>
                <div className="flex justify-between w-64">
                  <span>Packaging Fee:</span>
                  <span>₹{activeReceiptOrder.summary.packaging.toFixed(2)}</span>
                </div>
                <div className="flex justify-between w-64">
                  <span>Safety Fee:</span>
                  <span>₹{activeReceiptOrder.summary.safety.toFixed(2)}</span>
                </div>
                <div className="flex justify-between w-64 border-t border-rose-200 pt-1.5 text-slate-900 font-bold">
                  <span>Grand Total Paid:</span>
                  <span className="text-rose-600 font-black text-sm">₹{activeReceiptOrder.totalAmount.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Print action buttons */}
            <div className="flex gap-3 justify-end border-t border-rose-50 pt-4 print:hidden">
              <button
                onClick={() => setActiveReceiptOrder(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold text-xs transition-colors"
              >
                Close Receipt
              </button>
              <button
                onClick={handlePrintInvoice}
                className="bg-rose-600 hover:bg-rose-550 text-white px-5 py-2 rounded-lg font-bold text-xs transition-colors flex items-center gap-1.5 shadow-md"
              >
                Print / Save PDF
              </button>
            </div>

            {/* Printed invoice note */}
            <div className="hidden print:block text-center text-[10px] text-slate-400 mt-10 border-t border-slate-200 pt-3">
              Thank you for shopping at KRP Creation! Save this copy for warranty and returns.
            </div>

          </div>
        </div>
      )}

      {/* Product Detail Modal (Shows and lets customers add reviews) */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm print:hidden">
          <div className="bg-white border border-rose-100 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl relative animate-in fade-in zoom-in duration-200 text-slate-800 flex flex-col max-h-[90vh]">

            <button
              onClick={() => {
                setSelectedProduct(null);
                setReviewComment('');
                setReviewRating(5);
              }}
              className="absolute top-3 right-3 z-10 bg-white/90 hover:bg-rose-50 text-rose-600 w-8 h-8 rounded-full flex items-center justify-center font-bold border border-rose-100 transition-colors shadow-sm"
            >
              ✕
            </button>

            <div className="overflow-y-auto p-6 space-y-5">
              <div className="flex flex-col sm:flex-row gap-5">
                <div className="w-full sm:w-1/2 h-56 bg-rose-50 rounded-xl overflow-hidden border border-rose-100 shrink-0">
                  {selectedProduct.imageUrl ? (
                    <img
                      src={selectedProduct.imageUrl}
                      alt={selectedProduct.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-rose-100 border border-dashed border-rose-250 text-rose-505 font-bold text-sm gap-1">
                      <span>👗 No Image Available</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="bg-rose-100 text-rose-700 border border-rose-200 text-xs px-2.5 py-1 rounded-full font-semibold shadow-sm">
                      {selectedProduct.category}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${selectedProduct.stock <= 0 ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      }`}>
                      {selectedProduct.stock <= 0 ? 'Out of Stock' : `Stock: ${selectedProduct.stock} items left`}
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold text-slate-800 font-serif leading-tight">{selectedProduct.name}</h2>

                  {/* Base / Discount prices */}
                  <div>
                    {selectedProduct.discount && selectedProduct.discount > 0 ? (
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold text-slate-900">₹{getProductPrice(selectedProduct).toFixed(2)}</span>
                        <span className="text-sm text-slate-400 line-through">₹{selectedProduct.price.toFixed(2)}</span>
                      </div>
                    ) : (
                      <span className="text-2xl font-extrabold text-slate-900">₹{selectedProduct.price.toFixed(2)}</span>
                    )}
                  </div>

                  {/* Extra charges */}
                  <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-[11px] text-slate-505 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Delivery Charge:</span>
                      <span className="font-bold text-slate-700">₹{selectedProduct.deliveryCharge || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Safety Fee:</span>
                      <span className="font-bold text-slate-700">₹{selectedProduct.safetyFee || 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Offer highlights container - Displays Custom Indian Festivals */}
              {(selectedProduct.discount && selectedProduct.discount > 0 || selectedProduct.isFestiveDiscount) && (
                <div className="bg-rose-50/50 border border-rose-100/70 p-3.5 rounded-xl text-xs space-y-2 shadow-inner">
                  <div className="font-bold text-rose-700 uppercase tracking-wider">Active Promotional Offers:</div>
                  {selectedProduct.discount && selectedProduct.discount > 0 && (
                    <div className="flex justify-between items-center text-slate-650">
                      <span>🏷️ Special Catalog Discount:</span>
                      <span className="font-extrabold text-rose-600">{selectedProduct.discount}% OFF (Save ₹{(selectedProduct.price - getProductPrice(selectedProduct)).toFixed(2)})</span>
                    </div>
                  )}
                  {selectedProduct.isFestiveDiscount && (
                    <div className="text-amber-700 font-semibold flex items-center gap-1.5 mt-1">
                      <span>🎉 {selectedProduct.festiveName || 'Festive'} Special Sale:</span>
                      <span>Enjoy exclusive pricing during KRP Festive Deals!</span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Product Description</div>
                <p className="text-slate-650 text-sm leading-relaxed">{selectedProduct.description}</p>
              </div>

              {/* Customer Reviews Section */}
              <div className="border-t border-rose-100 pt-4 space-y-4">
                <h3 className="font-bold text-base text-slate-800 font-serif">Customer Reviews</h3>

                {/* Reviews List */}
                <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                  {!selectedProduct.reviews || selectedProduct.reviews.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No reviews yet for this product. Be the first to leave one below!</p>
                  ) : (
                    selectedProduct.reviews.map((rev, idx) => (
                      <div key={idx} className="bg-rose-50/20 border border-rose-100/50 p-3 rounded-xl space-y-1 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-800">{rev.reviewerName}</span>
                          <span className="text-[10px] text-slate-400">{moment(rev.createdAt).format('D MMM YYYY')}</span>
                        </div>
                        <div className="text-amber-500 font-bold">{'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}</div>
                        <p className="text-slate-600 italic">"{rev.comment}"</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Write Review Form */}
                {user ? (
                  <form onSubmit={handleAddReview} className="bg-rose-50/30 border border-rose-100 p-4 rounded-xl space-y-3">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Leave a Product Review</h4>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">Rating:</span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            type="button"
                            key={star}
                            onClick={() => setReviewRating(star)}
                            className="text-lg focus:outline-none transition-transform active:scale-125"
                          >
                            <span className={star <= reviewRating ? 'text-amber-500' : 'text-slate-300'}>★</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <textarea
                        required
                        placeholder="Share your thoughts about this ladies garment..."
                        value={reviewComment}
                        onChange={(e) => setReviewComment(e.target.value)}
                        className="w-full bg-white border border-rose-100 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-rose-455 h-16 resize-none"
                      />
                    </div>
                    <button
                      type="submit"
                      className="bg-rose-600 hover:bg-rose-550 text-white font-bold text-xs py-1.5 px-4 rounded-lg shadow transition-colors"
                    >
                      Submit Review
                    </button>
                  </form>
                ) : (
                  <div className="text-xs text-center text-slate-400 bg-rose-50/20 border border-rose-100 p-3 rounded-xl italic">
                    Please sign in to write a review.
                  </div>
                )}
              </div>

            </div>

            {/* Bottom Add to Cart banner */}
            <div className="bg-rose-50/50 p-4 border-t border-rose-100 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-450">Base Price: ₹{selectedProduct.price.toFixed(2)}</span>
              <button
                onClick={() => {
                  handleAddToCart(selectedProduct);
                  setSelectedProduct(null);
                  setReviewComment('');
                  setReviewRating(5);
                }}
                disabled={selectedProduct.stock <= 0}
                className={`font-bold py-2 px-6 rounded-lg transition-colors text-xs shadow-md ${selectedProduct.stock <= 0
                  ? 'bg-slate-300 text-slate-550 cursor-not-allowed'
                  : 'bg-rose-600 hover:bg-rose-550 text-white'
                  }`}
              >
                {selectedProduct.stock <= 0 ? 'Sold Out' : 'Add to Cart'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Edit/Update stock, pricing fees, and visibility active slide-out sidebar */}
      {editingProductId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-[2px] print:hidden animate-in fade-in duration-200">
          {/* Dismiss overlay */}
          <div className="absolute inset-0" onClick={() => setEditingProductId(null)} />

          <div className="relative bg-white w-full max-w-md h-full shadow-2xl p-6 flex flex-col justify-between animate-in slide-in-from-right duration-300 text-slate-800 border-l border-rose-100/60 overflow-y-auto">
            <div>
              <div className="flex justify-between items-center border-b border-rose-100 pb-3 mb-4">
                <h3 className="font-bold text-lg text-slate-800 font-serif">Edit Product Details</h3>
                <button
                  onClick={() => setEditingProductId(null)}
                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 w-8 h-8 rounded-full flex items-center justify-center font-bold border border-rose-100 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Show the selected editing product metadata */}
              {(() => {
                const editingProduct = products.find((p) => p.id === editingProductId);
                if (!editingProduct) return null;
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 bg-rose-50/50 p-3 rounded-xl border border-rose-100/60 mb-5 animate-in fade-in duration-150">
                      {editingProduct.imageUrl ? (
                        <img
                          src={editingProduct.imageUrl}
                          alt={editingProduct.name}
                          className="w-12 h-12 object-cover rounded-lg bg-rose-50 border border-rose-100 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 flex items-center justify-center bg-rose-100 text-rose-500 rounded shrink-0 font-bold text-[8px] border border-rose-200">
                          No Image
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 text-sm truncate">{editingProduct.name}</div>
                        <div className="text-[10px] text-slate-455 mt-0.5">
                          {editingProduct.category} • Base Price: ₹{editingProduct.price.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <form id="editProductForm" onSubmit={handleUpdateProductSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-655 font-semibold mb-1">Edit Base Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    min="0"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2.5 text-sm focus:border-rose-450 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-655 font-semibold mb-1">Update Stock Count *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={editStock}
                    onChange={(e) => setEditStock(e.target.value)}
                    className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2.5 text-sm focus:border-rose-450 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-655 font-semibold mb-1">Catalog Discount Percentage (%) *</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editDiscount}
                      onChange={(e) => setEditDiscount(e.target.value)}
                      className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2.5 text-sm focus:border-rose-450 focus:outline-none"
                    />
                  </div>

                  {/* Edit Festival selector */}
                  <div>
                    <label className="block text-slate-655 font-semibold mb-1">Active Festive Event Offer</label>
                    <select
                      value={editFestivalName}
                      onChange={(e) => setEditFestivalName(e.target.value)}
                      className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2.5 text-sm focus:border-rose-450 focus:outline-none"
                    >
                      <option value="">None / Standard</option>
                      {FESTIVAL_OPTIONS.map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-655 font-semibold mb-1">Delivery Charge (₹) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={editDeliveryCharge}
                      onChange={(e) => setEditDeliveryCharge(e.target.value)}
                      className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2.5 text-sm focus:border-rose-450 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-655 font-semibold mb-1">Safety Fee (₹) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={editSafetyFee}
                      onChange={(e) => setEditSafetyFee(e.target.value)}
                      className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2.5 text-sm focus:border-rose-450 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Edit Product Image upload option */}
                <div className="space-y-3 pt-3 border-t border-rose-50 mt-1">
                  <div>
                    <label className="block text-slate-655 font-semibold mb-1">Upload New Image File</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, setEditProductImage)}
                      className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-1.5 focus:outline-none text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-655 font-semibold mb-1">Or Edit Image URL</label>
                    <input
                      type="text"
                      placeholder="https://example.com/image.jpg"
                      value={editProductImage}
                      onChange={(e) => setEditProductImage(e.target.value)}
                      className="w-full bg-rose-50/20 border border-rose-100 rounded-lg p-2.5 text-sm focus:border-rose-450 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-3.5 border-t border-rose-50 pt-4 mt-1">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      id="editActive"
                      checked={editIsActive}
                      onChange={(e) => setEditIsActive(e.target.checked)}
                      className="accent-rose-600 h-4 w-4 cursor-pointer"
                    />
                    <label htmlFor="editActive" className="text-slate-700 font-bold cursor-pointer text-xs">
                      Product is Active (Visible to Customers)
                    </label>
                  </div>
                </div>
              </form>

              {/* Admin view reviews block */}
              {(() => {
                const editingProduct = products.find((p) => p.id === editingProductId);
                if (!editingProduct) return null;
                const revList = editingProduct.reviews || [];
                return (
                  <div className="border-t border-rose-100 pt-4 mt-5 space-y-3 text-xs">
                    <div className="font-bold text-slate-800 uppercase tracking-wider flex justify-between">
                      <span>Customer Reviews</span>
                      <span className="text-[10px] text-slate-450 normal-case font-normal">({revList.length} total)</span>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {revList.length === 0 ? (
                        <p className="text-slate-405 italic">No reviews written for this product yet.</p>
                      ) : (
                        revList.map((r, i) => (
                          <div key={i} className="bg-rose-50/25 border border-rose-100/50 p-2.5 rounded-xl space-y-1 text-[11px]">
                            <div className="flex justify-between items-center font-bold text-slate-700">
                              <span>{r.reviewerName}</span>
                              <span className="text-amber-500 font-normal">{'★'.repeat(r.rating)}</span>
                            </div>
                            <p className="text-slate-550 italic leading-relaxed">"{r.comment}"</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })()}

            </div>

            <div className="border-t border-rose-100 pt-4 mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setEditingProductId(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-lg text-xs transition-colors"
              >
                Close
              </button>
              <button
                type="submit"
                form="editProductForm"
                className="flex-1 bg-rose-600 hover:bg-rose-550 text-white font-bold py-2.5 rounded-lg text-xs transition-colors shadow-md"
              >
                Save Modifications
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {productToDeleteId && (
        <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm print:hidden">
          <div className="bg-white border border-rose-100 w-full max-w-sm rounded-2xl p-6 shadow-2xl relative animate-in fade-in zoom-in duration-200 text-center text-slate-800">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold mb-3">⚠️</div>
            <h3 className="text-lg font-bold font-serif mb-2 text-slate-800">Confirm Deletion</h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Are you sure you want to permanently delete this product? This action will remove the garment from the database and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setProductToDeleteId(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-705 font-bold py-2 rounded-lg text-xs transition-colors border border-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteProduct(productToDeleteId)}
                className="flex-1 bg-rose-600 hover:bg-rose-550 text-white font-bold py-2 rounded-lg text-xs transition-colors shadow-md"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-rose-100 text-center py-4 text-xs text-slate-400 shadow-inner mt-6 print:hidden">
        © {new Date().getFullYear()} KRP Creation. All local browser states are persisted.
      </footer>
    </div>
  );
}
