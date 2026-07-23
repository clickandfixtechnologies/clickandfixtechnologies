// Firebase App
import { initializeApp }
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";


// Firebase Authentication
import { getAuth }
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


// Firebase Firestore
import { getFirestore }
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// Firebase Configuration

export const firebaseConfig = {

    apiKey: "AIzaSyAkiGy6KcF5rKPp-I0Dq-MYAfNGPc-cYx8",

    authDomain: "click-n-fix-crm.firebaseapp.com",

    projectId: "click-n-fix-crm",

    storageBucket: "click-n-fix-crm.firebasestorage.app",

    messagingSenderId: "890129754553",

    appId: "1:890129754553:web:07c87e5fa8766ac7456e68"

};


// Initialize Firebase

const app = initializeApp(firebaseConfig);


// Initialize Authentication

const auth = getAuth(app);


// Initialize Firestore

const db = getFirestore(app);


// Export

export {

    auth,

    db

};

