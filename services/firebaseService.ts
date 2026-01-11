import { initializeApp, getApps } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getDatabase, ref, set, get, child } from 'firebase/database';
import type { Database } from 'firebase/database';
import { SheetConfig } from '../types';

// =========================================================================
// 🟢 Firebase Configuration
// =========================================================================

const firebaseConfig: any = {
  apiKey: "AIzaSyDvtjq2TM5NItSqu7LKzJpzbqX3bdJgJQw",
  authDomain: "linkdate-eb7c4.firebaseapp.com",
  projectId: "linkdate-eb7c4",
  storageBucket: "linkdate-eb7c4.firebasestorage.app",
  messagingSenderId: "139797723982",
  appId: "1:139797723982:web:8c90eafce95f3d1222bc1f",
  measurementId: "G-HHDF9J6QY8",
  // ⚠️ Confirming correct region (Singapore / asia-southeast1)
  databaseURL: "https://linkdate-eb7c4-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// =========================================================================

let app: FirebaseApp | undefined;
let db: Database | undefined;

const initFirebase = () => {
  try {
    // If apps are already initialized, use the existing one to avoid "App already exists"
    if (getApps().length > 0) {
      app = getApps()[0];
    } else {
      app = initializeApp(firebaseConfig);
    }

    // Initialize Database with explicit URL
    // Note: passing URL to getDatabase is required for non-default regions
    if (app) {
        db = getDatabase(app, firebaseConfig.databaseURL);
        return true;
    }
    return false;

  } catch (e: any) {
    console.error("Firebase Init Error:", e);
    
    // Helper to debug "Service database is not available"
    if (e.code === 'app/component-not-available') {
        console.error("Check importmap versions. 'firebase/app' and 'firebase/database' must be consistent.");
    }
    
    return false;
  }
};

// Key ที่ใช้เก็บข้อมูล
const DB_KEY = 'store_viz_settings/sheet_urls';
const LOGO_DB_KEY = 'store_viz_settings/logo_url';
const INFO_DB_KEY = 'store_viz_settings/store_info';

// Returns any because it might be string[] (old format) or SheetConfig[] (new format)
export const getSheetUrlsFromFirebase = async (): Promise<any | null> => {
  // Ensure init is called
  if (!app || !db) {
      const success = initFirebase();
      if (!success) return null;
  }

  if (!db) return null;

  try {
    const dbRef = ref(db);
    const snapshot = await get(child(dbRef, DB_KEY));
    if (snapshot.exists()) {
      return snapshot.val();
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error getting data from Firebase. Check databaseURL or Security Rules.", error);
    return null;
  }
};

export const saveSheetUrlsToFirebase = async (data: SheetConfig[]): Promise<void> => {
  // Ensure init is called
  if (!app || !db) {
      const success = initFirebase();
      if (!success) return;
  }

  if (!db) return;

  try {
    await set(ref(db, DB_KEY), data);
    console.log("Saved to Firebase successfully");
  } catch (error) {
    console.error("Error saving to Firebase. Check databaseURL or Security Rules.", error);
  }
};

// --- NEW: Logo Sync Functions ---

export const getLogoUrlFromFirebase = async (): Promise<string | null> => {
  if (!app || !db) {
      const success = initFirebase();
      if (!success) return null;
  }
  if (!db) return null;

  try {
    const dbRef = ref(db);
    const snapshot = await get(child(dbRef, LOGO_DB_KEY));
    if (snapshot.exists()) {
      return snapshot.val();
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error getting logo from Firebase", error);
    return null;
  }
};

export const saveLogoUrlToFirebase = async (url: string): Promise<void> => {
  if (!app || !db) {
      const success = initFirebase();
      if (!success) return;
  }
  if (!db) return;

  try {
    await set(ref(db, LOGO_DB_KEY), url);
  } catch (error) {
    console.error("Error saving logo to Firebase", error);
  }
};

// --- NEW: Store Info Sync Functions (Name & Branch) ---

export const getStoreInfoFromFirebase = async (): Promise<{name: string, branch: string} | null> => {
  if (!app || !db) {
      const success = initFirebase();
      if (!success) return null;
  }
  if (!db) return null;

  try {
    const dbRef = ref(db);
    const snapshot = await get(child(dbRef, INFO_DB_KEY));
    if (snapshot.exists()) {
      return snapshot.val();
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error getting store info from Firebase", error);
    return null;
  }
};

export const saveStoreInfoToFirebase = async (name: string, branch: string): Promise<void> => {
  if (!app || !db) {
      const success = initFirebase();
      if (!success) return;
  }
  if (!db) return;

  try {
    await set(ref(db, INFO_DB_KEY), { name, branch });
  } catch (error) {
    console.error("Error saving store info to Firebase", error);
  }
};