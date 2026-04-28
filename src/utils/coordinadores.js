// src/utils/coordinadores.js
import { db } from "../firebase";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";

// Guardar o reemplazar coordinador de un día
export const guardarCoordinador = async (anio, mes, dia, datos) => {
  const id = `${anio}-${mes}-${dia}`;
  await setDoc(doc(db, "coordinadores", id), {
    ...datos,
    anio,
    mes,
    dia,
    creadoEn: new Date().toISOString(),
  });
};

// Quitar coordinador de un día
export const quitarCoordinador = async (anio, mes, dia) => {
  const id = `${anio}-${mes}-${dia}`;
  await deleteDoc(doc(db, "coordinadores", id));
};

// Obtener todos los coordinadores de un mes
export const getCoordinadoresMes = async (anio, mes) => {
  const snap = await getDocs(
    query(
      collection(db, "coordinadores"),
      where("anio", "==", anio),
      where("mes", "==", mes)
    )
  );
  const mapa = {};
  snap.docs.forEach(d => { mapa[d.data().dia] = { id: d.id, ...d.data() }; });
  return mapa;
};

// Obtener resumen de coordinaciones por admin en un rango de meses
export const getResumenCoordinadores = async () => {
  const snap = await getDocs(collection(db, "coordinadores"));
  const conteo = {};
  snap.docs.forEach(d => {
    const data = d.data();
    if (data.tipo === "admin" && data.adminId) {
      conteo[data.adminId] = (conteo[data.adminId] || 0) + 1;
    }
  });
  return conteo;
};