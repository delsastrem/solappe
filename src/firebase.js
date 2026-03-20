import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBt-tGrWowxH58ppJJEAHwL8rjrbzHltg0",
  authDomain: "solappe-2f600.firebaseapp.com",
  projectId: "solappe-2f600",
  storageBucket: "solappe-2f600.firebasestorage.app",
  messagingSenderId: "242224363679",
  appId: "1:242224363679:web:bbd624328fa0b43cc9caaa"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Segunda instancia solo para crear usuarios sin afectar la sesión actual
const appSecundaria = initializeApp(firebaseConfig, "secundaria");
export const authSecundaria = getAuth(appSecundaria);