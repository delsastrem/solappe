import { getMessagingInstance } from "../firebase";
import { getToken, onMessage } from "firebase/messaging";
import { doc, setDoc, arrayUnion } from "firebase/firestore";
import { db } from "../firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

// Inyecta las variables de entorno en el service worker
const inyectarConfigEnSW = async (registration) => {
  if (!registration.active) return;
  registration.active.postMessage({
    type: "FIREBASE_CONFIG",
    config: {
      FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
      FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
    },
  });
};

export const suscribirNotificaciones = async (uid) => {
  try {
    // Verificar soporte
    if (!("Notification" in window)) {
      console.log("Este browser no soporta notificaciones");
      return;
    }
    if (!("serviceWorker" in navigator)) {
      console.log("Este browser no soporta service workers");
      return;
    }

    // Pedir permiso al usuario
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") {
      console.log("Permiso de notificaciones denegado");
      return;
    }

    // Registrar el service worker
    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
      { scope: "/" }
    );
    await navigator.serviceWorker.ready;

    // Inyectar config en el SW
    await inyectarConfigEnSW(registration);

    // Obtener messaging instance
    const messaging = await getMessagingInstance();
    if (!messaging) return;

    // Obtener token FCM
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      console.log("No se pudo obtener el token FCM");
      return;
    }

    // Guardar token en Firestore bajo el uid del usuario
    await setDoc(
      doc(db, "empleados", uid),
      { fcmTokens: arrayUnion(token) },
      { merge: true }
    );

    console.log("✅ Suscrito a notificaciones push");

    // Escuchar notificaciones con la app abierta (foreground)
    onMessage(messaging, (payload) => {
      console.log("[Foreground] Notificación recibida:", payload);
      // Mostrar notificación manual cuando la app está abierta
      const { title, body } = payload.notification;
      new Notification(title, {
        body,
        icon: "/favicon.svg",
      });
    });
  } catch (error) {
    console.error("Error al suscribir notificaciones:", error);
  }
};