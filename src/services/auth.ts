import { db } from '../db/db';
import { syncUserToCloud, fetchUserFromCloud, isCloudConfigured } from './supabase';

export async function hashPIN(pin: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function registerUser(phone: string, pin: string, name: string): Promise<number> {
  // Check locally first
  let existingUser = await db.users.where('phone').equals(phone).first();
  
  // If not found locally, check cloud to prevent duplicate registrations
  if (!existingUser && isCloudConfigured()) {
    try {
      const cloudUser = await fetchUserFromCloud(phone);
      if (cloudUser) {
        existingUser = cloudUser;
        // Save to local IndexedDB
        await db.users.put({
          phone: cloudUser.phone,
          pinHash: cloudUser.pinHash,
          name: cloudUser.name,
          createdAt: cloudUser.createdAt
        });
      }
    } catch (err) {
      console.warn("Could not reach cloud database to check user existence: ", err);
    }
  }

  if (existingUser) {
    throw new Error('An account with this phone number already exists.');
  }

  const pinHash = await hashPIN(pin);
  const now = Date.now();
  const newUserId = await db.users.add({
    phone,
    pinHash,
    name,
    createdAt: now
  });

  // Sync user registration to cloud database
  if (isCloudConfigured()) {
    try {
      await syncUserToCloud({ phone, pinHash, name, createdAt: now });
    } catch (err) {
      console.error("Failed to sync registration to cloud: ", err);
      // We don't fail registration since offline capability is primary
    }
  }

  return newUserId;
}

export async function loginUser(phone: string, pin: string) {
  let user = await db.users.where('phone').equals(phone).first();
  
  // If not found in local IndexedDB (e.g. new device), pull from Supabase Cloud
  if (!user && isCloudConfigured()) {
    try {
      const cloudUser = await fetchUserFromCloud(phone);
      if (cloudUser) {
        // Save to local IndexedDB so they can log in offline next time
        const newLocalId = await db.users.add({
          phone: cloudUser.phone,
          pinHash: cloudUser.pinHash,
          name: cloudUser.name,
          createdAt: cloudUser.createdAt
        });
        user = {
          id: newLocalId,
          phone: cloudUser.phone,
          pinHash: cloudUser.pinHash,
          name: cloudUser.name,
          createdAt: cloudUser.createdAt
        };
      }
    } catch (err) {
      console.error("Failed to fetch user from cloud: ", err);
    }
  }

  if (!user) {
    throw new Error('No account found with this phone number. Please register first.');
  }

  const pinHash = await hashPIN(pin);
  if (user.pinHash !== pinHash) {
    throw new Error('Incorrect PIN. Please try again.');
  }

  return {
    id: user.id,
    phone: user.phone,
    name: user.name
  };
}
