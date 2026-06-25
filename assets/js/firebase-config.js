import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-analytics.js';

const firebaseConfig = {
  apiKey: "AIzaSyC779AnvgmLnH376S0Jrxs3nRYVo6ZQ_lo",
  authDomain: "blood-bank-app-ad002.firebaseapp.com",
  projectId: "blood-bank-app-ad002",
  storageBucket: "blood-bank-app-ad002.firebasestorage.app",
  messagingSenderId: "977784151189",
  appId: "1:977784151189:web:8fd52fd3ed699b8fb58f9c",
  measurementId: "G-9TPPKMKNCE"
};

console.log('Firebase Project:', firebaseConfig.projectId);
console.log('Firebase API Key:', firebaseConfig.apiKey);

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('Firebase config is incomplete. Check assets/js/firebase-config.js.');
}

let appInstance;
try {
  appInstance = initializeApp(firebaseConfig);
} catch (error) {
  console.error('Firebase initialization failed:', error);
  throw error;
}

export const app = appInstance;
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

window.firebaseApp = app;
window.firebaseAuth = auth;
window.firebaseDb = db;
window.firebaseStorage = storage;
window.firebaseConfig = firebaseConfig;
window.firebaseAnalytics = analytics;
