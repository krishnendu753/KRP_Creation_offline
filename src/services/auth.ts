import { db } from '../db/db';

async function hashPIN(pin: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function registerUser(phone: string, pin: string, name: string): Promise<number> {
  const existingUser = await db.users.where('phone').equals(phone).first();
  if (existingUser) {
    throw new Error('An account with this phone number already exists.');
  }

  const pinHash = await hashPIN(pin);
  const newUserId = await db.users.add({
    phone,
    pinHash,
    name,
    createdAt: Date.now()
  });

  return newUserId;
}

export async function loginUser(phone: string, pin: string) {
  const user = await db.users.where('phone').equals(phone).first();
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
