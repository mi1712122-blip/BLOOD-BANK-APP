// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDCxQSMYuBhbvoLTBYyNMkTWVZQXcv-YbI",
  authDomain: "blood-bank-app-300e7.firebaseapp.com",
  projectId: "blood-bank-app-300e7",
  storageBucket: "blood-bank-app-300e7.firebasestorage.app",
  messagingSenderId: "289698316368",
  appId: "1:289698316368:web:0bf7b0752c5e8952f41155"
};

// Initialize Firebase once for the whole app
if (typeof firebase !== "undefined") {
  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = firebase.storage();

  window.firebaseApp = app;
  window.firebaseAuth = auth;
  window.firebaseDb = db;
  window.firebaseStorage = storage;
  window.firebaseConfig = firebaseConfig;
}
