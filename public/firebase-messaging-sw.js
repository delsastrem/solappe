importScripts("https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js");

let messaging = null;

// Recibe la config de firebase desde el frontend
self.addEventListener("message", (event) => {
  if (event.data?.type === "FIREBASE_CONFIG") {
    const c = event.data.config;

    if (!firebase.apps.length) {
      firebase.initializeApp({
        apiKey: c.FIREBASE_API_KEY,
        authDomain: c.FIREBASE_AUTH_DOMAIN,
        projectId: c.FIREBASE_PROJECT_ID,
        storageBucket: c.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: c.FIREBASE_MESSAGING_SENDER_ID,
        appId: c.FIREBASE_APP_ID,
      });
    }

    messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      console.log("[SW] Notificación en background:", payload);
      const { title, body, icon } = payload.notification;
      self.registration.showNotification(title, {
        body,
        icon: icon || "/favicon.svg",
        badge: "/favicon.svg",
      });
    });
  }
});