import { useState, useEffect } from "react";
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { auth, db, authSecundaria } from "../firebase";
import {
  collection, getDocs, deleteDoc, doc, setDoc, getDoc, updateDoc
} from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { distribuir, distribuirAmbasQuincenas } from "../utils/distribucion";
import Calendario from "./Calendario";

export default function Admin() {
  const [empleados, setEmpleados] = useState([]);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);
  const [inscripcionAbierta, setInscripcionAbierta] = useState(false);
  const [inscripciones, setInscripciones] = useState([]);
  const [empSeleccionado, setEmpSeleccionado] = useState("");
  const [prefSeleccionada, setPrefSeleccionada] = useState("");
  const [mensajeInsc, setMensajeInsc] = useState("");
  const [seccion, setSeccion] = useState("empleados");
  const [distribuyendo, setDistribuyendo] = useState(false);
  const [mensajeDistribucion, setMensajeDistribucion] = useState("");
  const [mobile, setMobile] = useState(window.innerWidth < 640);
  const [passActual, setPassActual] = useState("");
  const [passNueva, setPassNueva] = useState("");
  const [passConfirm, setPassConfirm] = useState("");
  const [mensajePass, setMensajePass] = useState("");
  const [loadingPass, setLoadingPass] = useState(false);
  const [empleadoActual, setEmpleadoActual] = useState(null);
  const [resumenQ1, setResumenQ1] = useState([]);
  const [resumenQ2, setResumenQ2] = useState([]);
  const [solicitudesPendientes, setSolicitudesPendientes] = useState([]);
  const [historialCambios, setHistorialCambios] = useState([]);
  const [historialExpandido, setHistorialExpandido] = useState(false);
  const [procesando, setProcesando] = useState(null);
  const [diasAsistencia, setDiasAsistencia] = useState([]);
  const [asistencias, setAsistencias] = useState({});
  const [reemplazante, setReemplazante] = useState({});
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [ratios, setRatios] = useState({});
  const [ratioPropio, setRatioPropio] = useState(null);

  const user = auth.currentUser;
  const ahora = new Date();
  const mes = ahora.getMonth() + 1;
  const anio = ahora.getFullYear();
  const mesProximo = mes === 12 ? 1 : mes + 1;
  const anioProximo = mes === 12 ? anio + 1 : anio;
  const nombreMes = new Date(anioProximo, mesProximo - 1, 1)
    .toLocaleString("es-AR", { month: "long" });

  useEffect(() => {
    const handleResize = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    cargarEmpleados();
    cargarEstadoInscripcion();
    cargarInscripciones();
    cargarEmpleadoActual();
    cargarSolicitudes();
  }, []);

  useEffect(() => {
    if (seccion === "resumen") cargarResumen();
    if (seccion === "cambios") cargarHistorial();
    if (seccion === "asistencia") cargarAsistencia();
    if (seccion === "empleados") cargarRatios();
    if (seccion === "cuenta") cargarRatioPropio();
  }, [seccion, empleados]);

  const cargarEmpleadoActual = async () => {
    if (!user) return;
    const snap = await getDoc(doc(db, "empleados", user.uid));
    if (snap.exists()) setEmpleadoActual(snap.data());
  };

  const cargarEmpleados = async () => {
    const snap = await getDocs(collection(db, "empleados"));
    const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    lista.sort((a, b) => a.apellido.localeCompare(b.apellido));
    setEmpleados(lista);
  };

  const cargarRatios = async () => {
    const snapAsig = await getDocs(collection(db, "asignaciones"));
    const asignados = {};
    snapAsig.docs.forEach(d => {
      const data = d.data();
      if (!asignados[data.empleadoId]) asignados[data.empleadoId] = 0;
      asignados[data.empleadoId] += data.dias.length;
    });
    const snapAsis = await getDocs(collection(db, "asistencias"));
    const confirmados = {};
    snapAsis.docs.forEach(d => {
      const data = d.data();
      if (data.confirmado) {
        if (!confirmados[data.empleadoId]) confirmados[data.empleadoId] = 0;
        confirmados[data.empleadoId]++;
      }
    });
    const mapa = {};
    empleados.forEach(e => {
      mapa[e.id] = {
        asignados: asignados[e.id] || 0,
        confirmados: confirmados[e.id] || 0,
      };
    });
    setRatios(mapa);
  };

  const cargarRatioPropio = async () => {
    if (!user) return;
    const snapAsig = await getDocs(collection(db, "asignaciones"));
    let asignados = 0;
    snapAsig.docs.forEach(d => {
      const data = d.data();
      if (data.empleadoId === user.uid) asignados += data.dias.length;
    });
    const snapAsis = await getDocs(collection(db, "asistencias"));
    let confirmados = 0;
    snapAsis.docs.forEach(d => {
      const data = d.data();
      if (data.empleadoId === user.uid && data.confirmado) confirmados++;
    });
    setRatioPropio({ asignados, confirmados });
  };

  const cargarEstadoInscripcion = async () => {
    const snap = await getDoc(doc(db, "config", "inscripcion"));
    if (snap.exists()) setInscripcionAbierta(snap.data().abierta === true);
  };

  const cargarInscripciones = async () => {
    const snap = await getDocs(collection(db, "inscripciones"));
    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(i => i.mes === mesProximo && i.anio === anioProximo);
    setInscripciones(lista);
  };

  const cargarSolicitudes = async () => {
    if (!user) return;
    const snap = await getDocs(collection(db, "solicitudesCambio"));
    const todas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setSolicitudesPendientes(todas.filter(s => s.receptorId === user.uid && s.estado === "pendiente"));
  };

  const cargarHistorial = async () => {
    const snap = await getDocs(collection(db, "solicitudesCambio"));
    const todas = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => s.estado !== "pendiente")
      .sort((a, b) => new Date(b.respondidoEn) - new Date(a.respondidoEn));
    setHistorialCambios(todas);
    setHistorialExpandido(false);
  };

  const cargarResumen = async () => {
    const snap = await getDocs(collection(db, "asignaciones"));
    const asigs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => a.mes === mesProximo && a.anio === anioProximo);
    const mapaEmp = {};
    empleados.forEach(e => { mapaEmp[e.id] = e; });
    const mapear = (list) => list.map(a => {
      const emp = mapaEmp[a.empleadoId];
      return { nombre: emp ? `${emp.apellido}, ${emp.nombre}` : a.empleadoId, dias: a.dias.length, detalle: a.dias };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre));
    setResumenQ1(mapear(asigs.filter(a => a.quincena === 1)));
    setResumenQ2(mapear(asigs.filter(a => a.quincena === 2)));
  };

  const cargarAsistencia = async () => {
    const dias = [];
    for (let i = 0; i < 3; i++) {
      const fecha = new Date(ahora);
      fecha.setDate(ahora.getDate() - i);
      const diaNum = fecha.getDate();
      const mesNum = fecha.getMonth() + 1;
      const anioNum = fecha.getFullYear();
      const label = `${diaNum}/${mesNum}`;
      const key = `${anioNum}-${mesNum}-${diaNum}`;
      const snapAsig = await getDocs(collection(db, "asignaciones"));
      const asignados = [];
      snapAsig.docs.forEach(d => {
        const data = d.data();
        data.dias.forEach(dia => {
          const fechaDia = new Date(dia.fecha);
          if (fechaDia.getDate() === diaNum && fechaDia.getMonth() + 1 === mesNum && fechaDia.getFullYear() === anioNum) {
            asignados.push({ empleadoId: data.empleadoId, turno: dia.turno, label: dia.label });
          }
        });
      });
      dias.push({ fecha, diaNum, mesNum, anioNum, label, key, asignados });
    }
    setDiasAsistencia(dias);
    setDiaSeleccionado(dias[0]?.key);
    const snapAsis = await getDocs(collection(db, "asistencias"));
    const mapaAsis = {};
    snapAsis.docs.forEach(d => { mapaAsis[d.id] = d.data(); });
    setAsistencias(mapaAsis);
  };

  const toggleConfirmado = async (diaKey, empleadoId) => {
    const docId = `${diaKey}_${empleadoId}`;
    const actual = asistencias[docId];
    if (actual?.confirmado) {
      await deleteDoc(doc(db, "asistencias", docId));
      setAsistencias(prev => { const n = { ...prev }; delete n[docId]; return n; });
    } else {
      const data = { diaKey, empleadoId, confirmado: true, esReemplazante: false, creadoEn: new Date().toISOString() };
      await setDoc(doc(db, "asistencias", docId), data);
      setAsistencias(prev => ({ ...prev, [docId]: data }));
    }
  };

  const agregarReemplazante = async (diaKey, empId, turno) => {
    if (!empId) return;
    const docId = `${diaKey}_${empId}_reemplazo`;
    const data = { diaKey, empleadoId: empId, confirmado: true, esReemplazante: true, turno, creadoEn: new Date().toISOString() };
    await setDoc(doc(db, "asistencias", docId), data);
    setAsistencias(prev => ({ ...prev, [docId]: data }));
    setReemplazante(prev => ({ ...prev, [diaKey]: "" }));
  };

  const borrarReemplazante = async (diaKey, empId) => {
    const docId = `${diaKey}_${empId}_reemplazo`;
    await deleteDoc(doc(db, "asistencias", docId));
    setAsistencias(prev => { const n = { ...prev }; delete n[docId]; return n; });
  };

  const responderSolicitud = async (solicitud, aceptar) => {
    setProcesando(solicitud.id);
    try {
      if (aceptar) {
        const snapAsigOrigen = await getDoc(doc(db, "asignaciones", solicitud.asigIdOrigen));
        const snapAsigDestino = await getDoc(doc(db, "asignaciones", solicitud.asigIdDestino));
        if (snapAsigOrigen.exists() && snapAsigDestino.exists()) {
          const diasOrigen = snapAsigOrigen.data().dias;
          const diasDestino = snapAsigDestino.data().dias;
          const diaAQuitar = diasOrigen.find(d => d.label === solicitud.labelOrigen && d.turno === solicitud.turnoOrigen);
          const diaADar = diasDestino.find(d => d.label === solicitud.labelDestino && d.turno === solicitud.turnoDestino);
          if (diaAQuitar && diaADar) {
            const nuevosDiasOrigen = diasOrigen.filter(d => !(d.label === solicitud.labelOrigen && d.turno === solicitud.turnoOrigen));
            nuevosDiasOrigen.push(diaADar);
            const nuevosDiasDestino = diasDestino.filter(d => !(d.label === solicitud.labelDestino && d.turno === solicitud.turnoDestino));
            nuevosDiasDestino.push(diaAQuitar);
            await updateDoc(doc(db, "asignaciones", solicitud.asigIdOrigen), { dias: nuevosDiasOrigen });
            await updateDoc(doc(db, "asignaciones", solicitud.asigIdDestino), { dias: nuevosDiasDestino });
          }
        }
      }
      await updateDoc(doc(db, "solicitudesCambio", solicitud.id), {
        estado: aceptar ? "aceptado" : "rechazado",
        respondidoEn: new Date().toISOString(),
      });
      cargarSolicitudes();
      cargarHistorial();
    } catch (err) {
      alert("Error: " + err.message);
    }
    setProcesando(null);
  };

  const ejecutarDistribucion = async () => {
    if (!confirm(`¿Ejecutar la distribución para ${nombreMes} ${anioProximo}?`)) return;
    setDistribuyendo(true);
    setMensajeDistribucion("");
    try {
      const snapEmps = await getDocs(collection(db, "empleados"));
      const historial = {};
      snapEmps.docs.forEach(d => { historial[d.id] = d.data().historialDescartes || 0; });
      const snapInsc = await getDocs(collection(db, "inscripciones"));
      const inscriptos = snapInsc.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(i => i.mes === mesProximo && i.anio === anioProximo);
      const snapAsig = await getDocs(collection(db, "asignaciones"));
      const borrar = snapAsig.docs.filter(d => {
        const data = d.data();
        return data.mes === mesProximo && data.anio === anioProximo;
      });
      for (const d of borrar) await deleteDoc(doc(db, "asignaciones", d.id));
      const { q1, q2 } = distribuirAmbasQuincenas(inscriptos, anioProximo, mesProximo, historial);
      const inscKey = `${anioProximo}-${mesProximo}`;
      const asignacionesQ1 = distribuir(q1.seleccionados, anioProximo, mesProximo, 1);
      for (const [empleadoId, dias] of Object.entries(asignacionesQ1)) {
        await setDoc(doc(db, "asignaciones", `${empleadoId}_${inscKey}_q1`), {
          empleadoId, mes: mesProximo, anio: anioProximo, quincena: 1, dias,
        });
      }
      const asignacionesQ2 = distribuir(q2.seleccionados, anioProximo, mesProximo, 2);
      for (const [empleadoId, dias] of Object.entries(asignacionesQ2)) {
        await setDoc(doc(db, "asignaciones", `${empleadoId}_${inscKey}_q2`), {
          empleadoId, mes: mesProximo, anio: anioProximo, quincena: 2, dias,
        });
      }
      for (const desc of [...q1.descartados, ...q2.descartados]) {
        const actual = historial[desc.empleadoId] || 0;
        await setDoc(doc(db, "empleados", desc.empleadoId), { historialDescartes: actual + 1 }, { merge: true });
      }
      setMensajeDistribucion("✓ Distribución generada correctamente");
    } catch (err) {
      setMensajeDistribucion("Error: " + err.message);
    }
    setDistribuyendo(false);
  };

  const toggleInscripcion = async () => {
    const nuevo = !inscripcionAbierta;
    await setDoc(doc(db, "config", "inscripcion"), { abierta: nuevo });
    setInscripcionAbierta(nuevo);
  };

  const agregarEmpleado = async () => {
    if (!nombre || !apellido || !email || !password) {
      setMensaje("Completá todos los campos");
      return;
    }
    setLoading(true);
    setMensaje("");
    try {
      const cred = await createUserWithEmailAndPassword(authSecundaria, email, password);
      await setDoc(doc(db, "empleados", cred.user.uid), {
        nombre, apellido, email, esAdmin: false,
        historialDescartes: 0, creadoEn: new Date().toISOString(),
      });
      setMensaje(`✓ Empleado ${apellido}, ${nombre} creado correctamente`);
      setNombre(""); setApellido(""); setEmail(""); setPassword("");
      cargarEmpleados();
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setMensaje("Ese email ya está registrado");
      } else {
        setMensaje("Error: " + err.message);
      }
    }
    setLoading(false);
  };

  const eliminarEmpleado = async (id, nombreCompleto) => {
    if (!confirm(`¿Eliminar a ${nombreCompleto}?`)) return;
    await deleteDoc(doc(db, "empleados", id));
    cargarEmpleados();
  };

  const hacerAdmin = async (id, esAdmin) => {
    await setDoc(doc(db, "empleados", id), { esAdmin: !esAdmin }, { merge: true });
    cargarEmpleados();
  };

  const inscribirEmpleado = async () => {
    if (!empSeleccionado || !prefSeleccionada) {
      setMensajeInsc("Seleccioná empleado y preferencia");
      return;
    }
    const emp = empleados.find(e => e.id === empSeleccionado);
    if (!emp) return;
    const inscKey = `${anioProximo}-${mesProximo}`;
    await setDoc(doc(db, "inscripciones", `${emp.id}_${inscKey}`), {
      empleadoId: emp.id, nombre: emp.nombre, apellido: emp.apellido,
      preferencia: prefSeleccionada, mes: mesProximo, anio: anioProximo,
      fechaInscripcion: new Date().toISOString(),
    });
    setMensajeInsc(`✓ ${emp.apellido}, ${emp.nombre} inscripto correctamente`);
    setEmpSeleccionado(""); setPrefSeleccionada("");
    cargarInscripciones();
  };

  const borrarInscripcion = async (inscId, nombreCompleto) => {
    if (!confirm(`¿Borrar inscripción de ${nombreCompleto}?`)) return;
    await deleteDoc(doc(db, "inscripciones", inscId));
    cargarInscripciones();
  };

  const cambiarPassword = async () => {
    if (!passActual || !passNueva || !passConfirm) {
      setMensajePass("Completá todos los campos");
      return;
    }
    if (passNueva !== passConfirm) {
      setMensajePass("Las contraseñas nuevas no coinciden");
      return;
    }
    if (passNueva.length < 6) {
      setMensajePass("La contraseña nueva debe tener al menos 6 caracteres");
      return;
    }
    setLoadingPass(true);
    setMensajePass("");
    try {
      const credential = EmailAuthProvider.credential(user.email, passActual);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, passNueva);
      setMensajePass("✓ Contraseña actualizada correctamente");
      setPassActual(""); setPassNueva(""); setPassConfirm("");
    } catch (err) {
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setMensajePass("La contraseña actual es incorrecta");
      } else {
        setMensajePass("Error: " + err.message);
      }
    }
    setLoadingPass(false);
  };

  const labelPreferencia = (p) => {
    if (p === "q1") return "1ra quincena";
    if (p === "q2") return "2da quincena";
    if (p === "ambas") return "Ambas";
    return p;
  };

  const labelTab = (s) => {
    if (s === "empleados") return "👥 Empleados";
    if (s === "inscripciones") return "📋 Inscripciones";
    if (s === "calendario") return "📅 Calendario";
    if (s === "resumen") return "📊 Resumen";
    if (s === "asistencia") return "✅ Asistencia";
    if (s === "cambios") return solicitudesPendientes.length > 0
      ? `🔄 Cambios (${solicitudesPendientes.length})`
      : "🔄 Cambios";
    return "🔑 Mi cuenta";
  };

  const COLORES_TURNO = {
    mañana: { bg: "#fff8e1", text: "#856404" },
    tarde:  { bg: "#e8f5e9", text: "#1e8449" },
    noche:  { bg: "#e8eaf6", text: "#283593" },
  };

  const renderColumnaResumen = (lista, titulo) => (
    <div style={styles.resumenCol}>
      <div style={styles.resumenHeader}>
        <h3 style={styles.resumenTitulo}>{titulo}</h3>
        <span style={styles.resumenCount}>{lista.length} personas</span>
      </div>
      {lista.length === 0 ? (
        <p style={{ color: "#999", fontSize: 13, padding: 12 }}>Sin distribución generada</p>
      ) : (
        lista.map((emp, i) => (
          <div key={i} style={styles.resumenFila}>
            <div style={styles.resumenNombre}>{emp.nombre}</div>
            <div style={styles.resumenDias}>
              {emp.detalle.map((d, j) => {
                const color = COLORES_TURNO[d.turno] || { bg: "#f5f5f5", text: "#333" };
                return (
                  <span key={j} style={{ ...styles.resumenChip, background: color.bg, color: color.text }}>
                    {d.label} {d.turno === "mañana" ? "☀️" : d.turno === "tarde" ? "🌅" : "🌙"}
                  </span>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );

  const mapaEmpleados = {};
  empleados.forEach(e => { mapaEmpleados[e.id] = e; });

  const renderSolicitudCard = (s, conBotones = false) => {
    const solicitante = mapaEmpleados[s.solicitanteId];
    const receptor = mapaEmpleados[s.receptorId];
    return (
      <div key={s.id} style={{
        ...styles.solicitudCard,
        borderLeft: `4px solid ${s.estado === "aceptado" ? "#27ae60" : s.estado === "rechazado" ? "#e74c3c" : "#3f51b5"}`,
      }}>
        <div style={styles.solicitudInfo}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <p style={styles.solicitudTitulo}>
              <strong>{solicitante ? `${solicitante.apellido}, ${solicitante.nombre}` : "..."}</strong>
              {" → "}
              <strong>{receptor ? `${receptor.apellido}, ${receptor.nombre}` : "..."}</strong>
            </p>
            {!conBotones && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                background: s.estado === "aceptado" ? "#eafaf1" : "#fdf2f2",
                color: s.estado === "aceptado" ? "#27ae60" : "#e74c3c",
              }}>
                {s.estado === "aceptado" ? "✓" : "✕"}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#666" }}>
            {s.labelOrigen} ({s.turnoOrigen}) ⇄ {s.labelDestino} ({s.turnoDestino})
          </div>
          {!conBotones && s.respondidoEn && (
            <p style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
              {new Date(s.respondidoEn).toLocaleDateString("es-AR")}
            </p>
          )}
        </div>
        {conBotones && (
          <div style={styles.solicitudBotones}>
            <button style={styles.botonAceptar} onClick={() => responderSolicitud(s, true)} disabled={procesando === s.id}>
              {procesando === s.id ? "..." : "✓ Aceptar"}
            </button>
            <button style={styles.botonRechazar} onClick={() => responderSolicitud(s, false)} disabled={procesando === s.id}>
              ✕ Rechazar
            </button>
          </div>
        )}
      </div>
    );
  };

  const diaActual = diasAsistencia.find(d => d.key === diaSeleccionado);
  const reemplazantesDelDia = diaActual
    ? Object.entries(asistencias)
        .filter(([k, v]) => k.startsWith(diaActual.key) && v.esReemplazante)
        .map(([k, v]) => ({ docId: k, ...v }))
    : [];

  const renderRatio = (empId) => {
    const r = ratios[empId];
    if (!r) return null;
    const color = r.asignados === 0 ? "#999"
      : r.confirmados === r.asignados ? "#27ae60"
      : r.confirmados === 0 ? "#e74c3c"
      : "#f39c12";
    return (
      <span style={{ fontSize: 12, color, fontWeight: 600, marginLeft: 8 }}>
        {r.confirmados}/{r.asignados} asistencias
      </span>
    );
  };

  // Historial: mostrar los primeros 5, expandir para ver hasta 10
  const historialVisible = historialExpandido
    ? historialCambios.slice(0, 10)
    : historialCambios.slice(0, 5);

  return (
    <div style={styles.container}>
      {solicitudesPendientes.length > 0 && seccion !== "cambios" && (
        <div style={styles.banner} onClick={() => setSeccion("cambios")}>
          🔔 Tenés {solicitudesPendientes.length} solicitud{solicitudesPendientes.length > 1 ? "es" : ""} de cambio pendiente{solicitudesPendientes.length > 1 ? "s" : ""}. Tocá para ver.
        </div>
      )}

      <div style={styles.header}>
        <h1 style={styles.title}>solAPPe {mobile ? "" : "— Admin"}</h1>
        <button style={styles.logout} onClick={() => signOut(auth)}>
          {mobile ? "Salir" : "Cerrar sesión"}
        </button>
      </div>

      <div style={styles.tabs}>
        {["empleados", "inscripciones", "resumen", "calendario", "asistencia", "cambios", "cuenta"].map(s => (
          <button
            key={s}
            style={{
              ...styles.tab,
              ...(seccion === s ? styles.tabActivo : {}),
              ...(s === "cambios" && solicitudesPendientes.length > 0 ? styles.tabAlerta : {}),
            }}
            onClick={() => setSeccion(s)}
          >
            {labelTab(s)}
          </button>
        ))}
      </div>

      <div style={styles.content}>

        {seccion === "empleados" && (
          <>
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Agregar empleado</h2>
              <div style={{ ...styles.grid, gridTemplateColumns: mobile ? "1fr" : "1fr 1fr" }}>
                <input style={styles.input} placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} />
                <input style={styles.input} placeholder="Apellido" value={apellido} onChange={e => setApellido(e.target.value)} />
                <input style={styles.input} placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
                <input style={styles.input} placeholder="Contraseña inicial" type="password" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              {mensaje && <p style={styles.mensajeOk}>{mensaje}</p>}
              <button style={{ ...styles.boton, width: mobile ? "100%" : "auto" }} onClick={agregarEmpleado} disabled={loading}>
                {loading ? "Creando..." : "Crear empleado"}
              </button>
            </div>

            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Empleados ({empleados.length})</h2>
              {empleados.length === 0 && <p style={{ color: "#999" }}>No hay empleados cargados</p>}
              {empleados.map(e => (
                <div key={e.id} style={{
                  ...styles.empleadoRow,
                  flexDirection: mobile ? "column" : "row",
                  alignItems: mobile ? "flex-start" : "center",
                  gap: mobile ? 8 : 0,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
                      <span style={styles.empleadoNombre}>{e.apellido}, {e.nombre}</span>
                      {e.esAdmin && <span style={styles.badgeAdmin}>ADMIN</span>}
                      {renderRatio(e.id)}
                    </div>
                    <div style={styles.empleadoEmail}>{e.email}</div>
                  </div>
                  <div style={styles.rowBotones}>
                    <button style={styles.botonSecundario} onClick={() => hacerAdmin(e.id, e.esAdmin)}>
                      {e.esAdmin ? "Quitar admin" : "Hacer admin"}
                    </button>
                    <button style={styles.botonEliminar} onClick={() => eliminarEmpleado(e.id, `${e.apellido}, ${e.nombre}`)}>
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {seccion === "inscripciones" && (
          <>
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Estado de la inscripción</h2>
              <div style={{ ...styles.estadoRow, flexDirection: mobile ? "column" : "row", alignItems: mobile ? "stretch" : "center" }}>
                <div style={{
                  ...styles.estadoBadge,
                  background: inscripcionAbierta ? "#eafaf1" : "#fdf2f2",
                  border: `1px solid ${inscripcionAbierta ? "#27ae60" : "#e74c3c"}`,
                  color: inscripcionAbierta ? "#1e8449" : "#c0392b",
                }}>
                  {inscripcionAbierta ? "🟢 Inscripción ABIERTA" : "🔴 Inscripción CERRADA"}
                </div>
                <button
                  style={{ ...styles.boton, background: inscripcionAbierta ? "#c0392b" : "#27ae60", width: mobile ? "100%" : "auto" }}
                  onClick={toggleInscripcion}
                >
                  {inscripcionAbierta ? "Cerrar inscripción" : "Abrir inscripción"}
                </button>
              </div>
              {!inscripcionAbierta && (
                <div style={{ marginTop: 16 }}>
                  {mensajeDistribucion && <p style={styles.mensajeOk}>{mensajeDistribucion}</p>}
                  <button
                    style={{ ...styles.boton, background: "#1a1a2e", marginTop: 8, width: mobile ? "100%" : "auto" }}
                    onClick={ejecutarDistribucion}
                    disabled={distribuyendo}
                  >
                    {distribuyendo ? "Distribuyendo..." : `Generar distribución — ${nombreMes} ${anioProximo}`}
                  </button>
                </div>
              )}
            </div>

            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Inscribir empleado</h2>
              <div style={{ ...styles.grid, gridTemplateColumns: mobile ? "1fr" : "1fr 1fr" }}>
                <select style={styles.input} value={empSeleccionado} onChange={e => setEmpSeleccionado(e.target.value)}>
                  <option value="">Seleccioná un empleado</option>
                  {empleados.map(e => (
                    <option key={e.id} value={e.id}>{e.apellido}, {e.nombre}</option>
                  ))}
                </select>
                <select style={styles.input} value={prefSeleccionada} onChange={e => setPrefSeleccionada(e.target.value)}>
                  <option value="">Seleccioná quincena</option>
                  <option value="q1">Primera quincena (1-15)</option>
                  <option value="q2">Segunda quincena (16-fin)</option>
                  <option value="ambas">Ambas quincenas</option>
                </select>
              </div>
              {mensajeInsc && <p style={styles.mensajeOk}>{mensajeInsc}</p>}
              <button style={{ ...styles.boton, width: mobile ? "100%" : "auto" }} onClick={inscribirEmpleado}>
                Inscribir
              </button>
            </div>

            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Inscriptos ({inscripciones.length})</h2>
              {inscripciones.length === 0 && <p style={{ color: "#999" }}>Nadie inscripto todavía</p>}
              {inscripciones.map(i => (
                <div key={i.id} style={{
                  ...styles.empleadoRow,
                  flexDirection: mobile ? "column" : "row",
                  alignItems: mobile ? "flex-start" : "center",
                  gap: mobile ? 8 : 0,
                }}>
                  <div>
                    <span style={styles.empleadoNombre}>{i.apellido}, {i.nombre}</span>
                    <span style={styles.empleadoEmail}> — {labelPreferencia(i.preferencia)}</span>
                  </div>
                  <button style={styles.botonEliminar} onClick={() => borrarInscripcion(i.id, `${i.apellido}, ${i.nombre}`)}>
                    Borrar
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {seccion === "resumen" && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Resumen de distribución — {nombreMes} {anioProximo}</h2>
            {resumenQ1.length === 0 && resumenQ2.length === 0 ? (
              <div style={styles.aviso}>📊 Todavía no se generó la distribución para este mes.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                {renderColumnaResumen(resumenQ1, "1ra Quincena (1-15)")}
                {renderColumnaResumen(resumenQ2, "2da Quincena (16-fin)")}
              </div>
            )}
          </div>
        )}

        {seccion === "calendario" && (
          <div style={styles.card}>
            <Calendario esAdmin={false} />
          </div>
        )}

        {seccion === "asistencia" && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>✅ Control de asistencia</h2>
            <div style={styles.diasSelectorRow}>
              {diasAsistencia.map(d => {
                const nombreDia = d.fecha.toLocaleString("es-AR", { weekday: "short" });
                const esHoy = d.diaNum === ahora.getDate() && d.mesNum === ahora.getMonth() + 1;
                return (
                  <button
                    key={d.key}
                    style={{ ...styles.diaBtn, ...(diaSeleccionado === d.key ? styles.diaBtnActivo : {}) }}
                    onClick={() => setDiaSeleccionado(d.key)}
                  >
                    <span style={{ fontSize: 11, textTransform: "capitalize" }}>{nombreDia}</span>
                    <span style={{ fontWeight: 800, fontSize: 18 }}>{d.diaNum}</span>
                    {esHoy && <span style={{ fontSize: 10, color: "#27ae60" }}>Hoy</span>}
                  </button>
                );
              })}
            </div>

            {diaActual && (
              <>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e", margin: "16px 0 10px" }}>
                  Asignados para el {diaActual.label}
                </h3>
                {diaActual.asignados.length === 0 ? (
                  <div style={styles.aviso}>No hay empleados asignados para este día.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                    {diaActual.asignados.map((a, i) => {
                      const emp = mapaEmpleados[a.empleadoId];
                      const docId = `${diaActual.key}_${a.empleadoId}`;
                      const confirmado = asistencias[docId]?.confirmado;
                      const color = COLORES_TURNO[a.turno] || { bg: "#f5f5f5", text: "#333" };
                      return (
                        <div key={i} style={{
                          ...styles.asistenciaFila,
                          background: confirmado ? "#eafaf1" : "white",
                          border: `1px solid ${confirmado ? "#27ae60" : "#eee"}`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 20 }}>{confirmado ? "✅" : "⬜"}</span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a2e" }}>
                                {emp ? `${emp.apellido}, ${emp.nombre}` : a.empleadoId}
                              </div>
                              <span style={{ ...styles.resumenChip, background: color.bg, color: color.text, fontSize: 11 }}>
                                {a.turno} {a.turno === "mañana" ? "☀️" : a.turno === "tarde" ? "🌅" : "🌙"}
                              </span>
                            </div>
                          </div>
                          <button
                            style={{ ...styles.botonSecundario, background: confirmado ? "#e74c3c" : "#27ae60" }}
                            onClick={() => toggleConfirmado(diaActual.key, a.empleadoId)}
                          >
                            {confirmado ? "Quitar" : "Confirmar"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e", marginBottom: 10 }}>
                  Reemplazantes / adicionales
                </h3>
                {reemplazantesDelDia.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    {reemplazantesDelDia.map((r) => {
                      const emp = mapaEmpleados[r.empleadoId];
                      return (
                        <div key={r.docId} style={{ ...styles.asistenciaFila, background: "#e8f4fd", border: "1px solid #3f51b5" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 20 }}>🔄</span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a2e" }}>
                                {emp ? `${emp.apellido}, ${emp.nombre}` : r.empleadoId}
                              </div>
                              <span style={{ fontSize: 11, color: "#3f51b5" }}>Reemplazante</span>
                            </div>
                          </div>
                          <button style={{ ...styles.botonEliminar }} onClick={() => borrarReemplazante(diaActual.key, r.empleadoId)}>
                            Quitar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ ...styles.grid, gridTemplateColumns: mobile ? "1fr" : "2fr 1fr", gap: 8 }}>
                  <select
                    style={styles.input}
                    value={reemplazante[diaActual.key] || ""}
                    onChange={e => setReemplazante(prev => ({ ...prev, [diaActual.key]: e.target.value }))}
                  >
                    <option value="">Seleccioná reemplazante</option>
                    {empleados
                      .filter(e => !diaActual.asignados.find(a => a.empleadoId === e.id))
                      .map(e => (
                        <option key={e.id} value={e.id}>{e.apellido}, {e.nombre}</option>
                      ))
                    }
                  </select>
                  <button
                    style={{ ...styles.boton, background: "#3f51b5" }}
                    onClick={() => agregarReemplazante(diaActual.key, reemplazante[diaActual.key], "solape")}
                  >
                    Agregar
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {seccion === "cambios" && (
          <>
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>🔄 Mis solicitudes pendientes</h2>
              {solicitudesPendientes.length === 0 ? (
                <div style={styles.aviso}>No tenés solicitudes de cambio pendientes.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {solicitudesPendientes.map(s => renderSolicitudCard(s, true))}
                </div>
              )}
            </div>

            <div style={styles.card}>
              <h2 style={styles.cardTitle}>
                📋 Historial de cambios
                <span style={{ fontSize: 12, fontWeight: 400, color: "#999", marginLeft: 8 }}>
                  ({historialCambios.length} total)
                </span>
              </h2>
              {historialCambios.length === 0 ? (
                <div style={styles.aviso}>Todavía no hay cambios registrados.</div>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {historialVisible.map(s => renderSolicitudCard(s, false))}
                  </div>
                  {historialCambios.length > 5 && (
                    <button
                      style={{ ...styles.botonVerMas }}
                      onClick={() => setHistorialExpandido(!historialExpandido)}
                    >
                      {historialExpandido
                        ? "▲ Ver menos"
                        : `▼ Ver más (${Math.min(historialCambios.length - 5, 5)} más)`
                      }
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {seccion === "cuenta" && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>🔑 Mi cuenta</h2>
            {empleadoActual && (
              <p style={{ color: "#666", marginBottom: 16, fontSize: 14 }}>
                <strong>{empleadoActual.apellido}, {empleadoActual.nombre}</strong>
              </p>
            )}

            {ratioPropio && (
              <div style={styles.ratioBox}>
                <span style={styles.ratioTitulo}>📊 Mis asistencias</span>
                <span style={{
                  ...styles.ratioNumero,
                  color: ratioPropio.asignados === 0 ? "#999"
                    : ratioPropio.confirmados === ratioPropio.asignados ? "#27ae60"
                    : ratioPropio.confirmados === 0 ? "#e74c3c"
                    : "#f39c12",
                }}>
                  {ratioPropio.confirmados} confirmadas / {ratioPropio.asignados} asignadas
                </span>
              </div>
            )}

            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e", margin: "20px 0 12px" }}>
              Cambiar contraseña
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 400 }}>
              <input style={styles.input} type="password" placeholder="Contraseña actual" value={passActual} onChange={e => setPassActual(e.target.value)} />
              <input style={styles.input} type="password" placeholder="Nueva contraseña" value={passNueva} onChange={e => setPassNueva(e.target.value)} />
              <input style={styles.input} type="password" placeholder="Repetir nueva contraseña" value={passConfirm} onChange={e => setPassConfirm(e.target.value)} />
              {mensajePass && (
                <p style={{ color: mensajePass.startsWith("✓") ? "#27ae60" : "#e74c3c", fontWeight: 500, fontSize: 14 }}>
                  {mensajePass}
                </p>
              )}
              <button style={{ ...styles.boton, background: "#1a1a2e" }} onClick={cambiarPassword} disabled={loadingPass}>
                {loadingPass ? "Guardando..." : "Cambiar contraseña"}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: "100vh", background: "#f0f2f5" },
  banner: {
    background: "#e8f4fd", border: "1px solid #3f51b5", color: "#283593",
    padding: "12px 16px", textAlign: "center", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  header: {
    background: "#c0392b", color: "white", padding: "12px 16px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  title: { fontSize: 20, fontWeight: 800 },
  logout: {
    background: "transparent", border: "1px solid white", color: "white",
    padding: "6px 12px", borderRadius: 8, fontSize: 13,
  },
  tabs: {
    display: "flex", background: "white",
    borderBottom: "2px solid #f0f2f5", padding: "0 8px", overflowX: "auto",
  },
  tab: {
    padding: "12px 14px", border: "none", background: "transparent",
    fontSize: 13, color: "#666", borderBottom: "3px solid transparent",
    marginBottom: -2, whiteSpace: "nowrap",
  },
  tabActivo: { color: "#c0392b", fontWeight: 700, borderBottom: "3px solid #c0392b" },
  tabAlerta: { color: "#3f51b5", fontWeight: 700 },
  content: { padding: 16, maxWidth: 1000, margin: "0 auto" },
  card: {
    background: "white", borderRadius: 12, padding: 16, marginBottom: 16,
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  cardTitle: { fontSize: 16, fontWeight: 700, marginBottom: 14, color: "#1a1a2e" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 },
  input: {
    padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd",
    fontSize: 15, outline: "none", background: "white", color: "#1a1a2e",
    width: "100%", boxSizing: "border-box",
  },
  boton: {
    background: "#c0392b", color: "white", border: "none",
    padding: "12px 24px", borderRadius: 8, fontSize: 15, fontWeight: 600,
  },
  botonSecundario: {
    background: "#1a1a2e", color: "white", border: "none",
    padding: "6px 12px", borderRadius: 6, fontSize: 13,
  },
  botonEliminar: {
    background: "#e74c3c", color: "white", border: "none",
    padding: "6px 12px", borderRadius: 6, fontSize: 13,
  },
  botonVerMas: {
    width: "100%", marginTop: 10, padding: "8px", borderRadius: 8,
    border: "1px solid #ddd", background: "white", fontSize: 13,
    color: "#666", cursor: "pointer",
  },
  mensajeOk: { marginBottom: 12, color: "#27ae60", fontWeight: 500 },
  aviso: {
    background: "#fef9e7", border: "1px solid #f39c12",
    borderRadius: 8, padding: 16, color: "#856404", fontSize: 15,
  },
  empleadoRow: {
    display: "flex", justifyContent: "space-between",
    padding: "12px 0", borderBottom: "1px solid #f0f2f5",
  },
  empleadoNombre: { fontWeight: 600, fontSize: 14 },
  empleadoEmail: { color: "#666", fontSize: 13, marginTop: 2 },
  badgeAdmin: {
    background: "#c0392b", color: "white", fontSize: 11, fontWeight: 700,
    padding: "2px 8px", borderRadius: 4,
  },
  rowBotones: { display: "flex", gap: 8 },
  estadoRow: { display: "flex", alignItems: "center", gap: 16 },
  estadoBadge: { padding: "10px 16px", borderRadius: 8, fontWeight: 600, fontSize: 14, flex: 1 },
  resumenCol: { border: "1px solid #eee", borderRadius: 10, overflow: "hidden" },
  resumenHeader: {
    background: "#f0f2f5", padding: "10px 14px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    borderBottom: "1px solid #eee",
  },
  resumenTitulo: { fontSize: 14, fontWeight: 700, color: "#1a1a2e" },
  resumenCount: {
    background: "#1a1a2e", color: "white", fontSize: 12,
    padding: "2px 8px", borderRadius: 12, fontWeight: 600,
  },
  resumenFila: { padding: "10px 14px", borderBottom: "1px solid #f5f5f5" },
  resumenNombre: { fontWeight: 600, fontSize: 14, color: "#1a1a2e", marginBottom: 6 },
  resumenDias: { display: "flex", flexWrap: "wrap", gap: 4 },
  resumenChip: { fontSize: 12, padding: "2px 8px", borderRadius: 6, fontWeight: 500 },
  solicitudCard: { border: "1px solid #e8eaf6", borderRadius: 10, padding: 12, background: "#f8f9ff" },
  solicitudInfo: { marginBottom: 8 },
  solicitudTitulo: { fontSize: 13, color: "#1a1a2e", marginBottom: 6 },
  solicitudDetalle: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  solicitudDia: { display: "flex", flexDirection: "column", gap: 2 },
  solicitudLabel: { fontSize: 11, color: "#666", fontWeight: 600, textTransform: "uppercase" },
  solicitudValor: { fontSize: 13, color: "#1a1a2e", fontWeight: 700 },
  solicitudFlecha: { fontSize: 18, color: "#3f51b5", fontWeight: 700 },
  solicitudBotones: { display: "flex", gap: 8 },
  botonAceptar: {
    background: "#27ae60", color: "white", border: "none",
    padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  botonRechazar: {
    background: "transparent", color: "#e74c3c", border: "1px solid #e74c3c",
    padding: "8px 16px", borderRadius: 8, fontSize: 14, cursor: "pointer",
  },
  diasSelectorRow: { display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  diaBtn: {
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "10px 16px", borderRadius: 10, border: "1px solid #ddd",
    background: "white", cursor: "pointer", minWidth: 70, gap: 2,
  },
  diaBtnActivo: { background: "#1a1a2e", color: "white", border: "1px solid #1a1a2e" },
  asistenciaFila: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 14px", borderRadius: 8,
  },
  ratioBox: {
    background: "#f0f2f5", borderRadius: 10, padding: "14px 18px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: 8,
  },
  ratioTitulo: { fontSize: 14, fontWeight: 600, color: "#1a1a2e" },
  ratioNumero: { fontSize: 15, fontWeight: 700 },
};
