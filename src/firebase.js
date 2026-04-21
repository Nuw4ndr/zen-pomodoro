// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// TODO: Replace the following with your app's Firebase project configuration
// You can find this in your Firebase project settings
const firebaseConfig = {
    apiKey: "AIzaSyAwUZc96Zf-bCKd6zdLilWDn2H-p3xggsc",
    authDomain: "zen-pomodoro-f3f8c.firebaseapp.com",
    projectId: "zen-pomodoro-f3f8c",
    storageBucket: "zen-pomodoro-f3f8c.firebasestorage.app",
    messagingSenderId: "266792876377",
    appId: "1:266792876377:web:559648860f71afb6967448"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
