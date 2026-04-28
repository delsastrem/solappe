import { db } from "../firebase";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  arrayUnion,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";

export const enviarAviso = async (mensaje, adminUid) => {
  await addDoc(collection(db, "notificaciones"), {
    mensaje,
    creadoPor: adminUid,
    creadoEn: new Date().toISOString(),
    leidoPor: [],
  });
};

export const marcarLeido = async (notifId, uid) => {
  await updateDoc(doc(db, "notificaciones", notifId), {
    leidoPor: arrayUnion(uid),
  });
};

export const suscribirAvisos = (uid, callback) => {
  const q = query(collection(db, "notificaciones"), orderBy("creadoEn", "desc"));
  return onSnapshot(q, (snap) => {
    const todas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(todas);
  });
};