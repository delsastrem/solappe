const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

// ─────────────────────────────────────────────
// HELPER: obtener tokens FCM de un usuario
// ─────────────────────────────────────────────
async function getTokensDeUsuario(uid) {
  const snap = await db.collection("empleados").doc(uid).get();
  if (!snap.exists) return [];
  return snap.data().fcmTokens || [];
}

// ─────────────────────────────────────────────
// HELPER: enviar notificacion a un usuario
// ─────────────────────────────────────────────
async function notificarUsuario(uid, title, body) {
  const tokens = await getTokensDeUsuario(uid);
  if (!tokens.length) return;

  const mensajes = tokens.map((token) => ({
    token,
    notification: { title, body },
    webpush: {
      notification: {
        icon: "https://solappe.vercel.app/favicon.svg",
        badge: "https://solappe.vercel.app/favicon.svg",
      },
    },
  }));

  const resultados = await messaging.sendEach(mensajes);

  // Limpiar tokens inválidos de Firestore
  const tokensInvalidos = [];
  resultados.responses.forEach((res, i) => {
    if (!res.success) tokensInvalidos.push(tokens[i]);
  });
  if (tokensInvalidos.length) {
    const tokensValidos = tokens.filter((t) => !tokensInvalidos.includes(t));
    await db.collection("empleados").doc(uid).update({ fcmTokens: tokensValidos });
  }
}

// ─────────────────────────────────────────────
// FUNCIÓN 1: Notificar cuando se genera distribución
// Se dispara cuando se crea un doc en "asignaciones"
// ─────────────────────────────────────────────
exports.notificarDistribucion = onDocumentCreated(
  "asignaciones/{asigId}",
  async (event) => {
    const data = event.data.data();
    const { empleadoId, mes, anio, quincena } = data;

    const nombreMes = new Date(anio, mes - 1, 1).toLocaleString("es-AR", {
      month: "long",
    });

    await notificarUsuario(
      empleadoId,
      "📅 Distribución publicada",
      `Ya podés ver tu turno de ${nombreMes} (Q${quincena}) en solAPPe`
    );
  }
);

// ─────────────────────────────────────────────
// FUNCIÓN 2: Notificar solicitud de cambio recibida
// Se dispara cuando se crea un doc en "solicitudesCambio"
// ─────────────────────────────────────────────
exports.notificarSolicitudCambio = onDocumentCreated(
  "solicitudesCambio/{solicitudId}",
  async (event) => {
    const data = event.data.data();
    const { receptorId, solicitanteId } = data;

    // Obtener nombre del solicitante
    const snapSol = await db.collection("empleados").doc(solicitanteId).get();
    const solicitante = snapSol.exists
      ? `${snapSol.data().apellido}, ${snapSol.data().nombre}`
      : "Un compañero";

    await notificarUsuario(
      receptorId,
      "🔄 Solicitud de cambio",
      `${solicitante} te pidió un cambio de día`
    );
  }
);

// ─────────────────────────────────────────────
// FUNCIÓN 3: Recordatorio nocturno (corre a las 20hs ARG = 23hs UTC)
// Avisa a empleados y admins sobre solapés del día siguiente
// ─────────────────────────────────────────────
exports.recordatorioSolape = onSchedule("0 23 * * *", async () => {
  const ahora = new Date();
  // Día siguiente en ARG (UTC-3)
  const manana = new Date(ahora.getTime() + 1000 * 60 * 60 * 24);
  const anio = manana.getUTCFullYear();
  const mes = manana.getUTCMonth() + 1;
  const dia = manana.getUTCDate();
  const fechaKey = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

  // Buscar asignaciones que incluyan el día de mañana
  const snap = await db.collection("asignaciones").get();

  const notificados = new Set();

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const { empleadoId, dias } = data;

    if (!dias || notificados.has(empleadoId)) continue;

    const diaEncontrado = dias.find((d) => {
      const fecha = d.fecha?.toDate?.() || new Date(d.fecha);
      const f = fecha.toISOString().split("T")[0];
      return f === fechaKey;
    });

    if (diaEncontrado) {
      notificados.add(empleadoId);
      const turno = diaEncontrado.label || diaEncontrado.turno;
      await notificarUsuario(
        empleadoId,
        "⏰ Recordatorio de turno",
        `Mañana tenés turno ${turno} — no te olvides de confirmar asistencia`
      );
    }
  }

  // Notificar a todos los admins sobre los solapés de mañana
  const snapAdmins = await db
    .collection("empleados")
    .where("esAdmin", "==", true)
    .get();

  const empleadosManana = [...notificados];
  if (!empleadosManana.length) return;

  // Armar lista de nombres para el admin
  const nombres = [];
  for (const uid of empleadosManana) {
    const s = await db.collection("empleados").doc(uid).get();
    if (s.exists) {
      nombres.push(`${s.data().apellido}, ${s.data().nombre}`);
    }
  }

  for (const adminDoc of snapAdmins.docs) {
    await notificarUsuario(
      adminDoc.id,
      "✅ Solapés de mañana",
      `${nombres.length} empleado${nombres.length > 1 ? "s" : ""} trabajan mañana: ${nombres.join(" / ")}`
    );
  }
});