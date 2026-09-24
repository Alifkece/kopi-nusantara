/* =========================================================
   KOPI NUSANTARA — js/firebase-init.js
   -----------------------------------------------------------
   Single place where the Firebase App, Auth, and Firestore
   instances are created. Every other module (js/auth.js, and
   anything added later) imports the already-initialized
   instances from here instead of calling initializeApp() again,
   so Firebase is only ever initialized once.

   Project: kopi-nusantara-2d465
   OTP / email verification is intentionally NOT part of this
   stage — see js/auth.js.
========================================================= */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

var firebaseConfig = {
  apiKey: 'AIzaSyDIYCQ4nJSccorYsnMRFbkH12tSeV_mcdA',
  authDomain: 'kopi-nusantara-2d465.firebaseapp.com',
  projectId: 'kopi-nusantara-2d465',
  storageBucket: 'kopi-nusantara-2d465.firebasestorage.app',
  messagingSenderId: '1060169296386',
  appId: '1:1060169296386:web:6b23c16a783a0c08a5951b',
  measurementId: 'G-E1GR3TXELS'
};

export var app = initializeApp(firebaseConfig);
export var auth = getAuth(app);
export var db = getFirestore(app);

// Keep the user signed in across page reloads (persisted in the browser).
setPersistence(auth, browserLocalPersistence).catch(function (err) {
  console.error('Firebase auth persistence error:', err);
});