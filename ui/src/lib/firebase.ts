/**
 * Firebase configuration for Saraswati.
 *
 * This file initializes Firebase Auth and Firestore.
 * The config values are loaded from environment variables
 * (set in .env) or fall back to the Saraswati project defaults.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import {
  getFirestore,
  type Firestore,
} from 'firebase/firestore'

// Firebase project config â will be set after project creation
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

function isConfigured(): boolean {
  return !!(firebaseConfig.apiKey && firebaseConfig.projectId)
}

function initFirebase() {
  if (!isConfigured()) {
    console.warn('Firebase not configured. Add VITE_FIREBASE_* vars to .env')
    return
  }
  if (!app) {
    app = initializeApp(firebaseConfig)
    auth = getAuth(app)
    db = getFirestore(app)
  }
}

// Auto-init if configured
if (isConfigured()) {
  initFirebase()
}

export { app, auth, db, isConfigured, initFirebase }
