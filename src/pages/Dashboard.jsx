import { useState, useEffect } from "react";
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import Calendario from "./Calendario";

export default function Dashboard() {
  const [empleado, setEmpleado] = useState(null);
  const [inscripcion, setInscripcion] = useState(null);
  const [preferencia, setPreferencia] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);
  const [inscripcionAbierta, setInscripcionAbierta] = useState(false);
  const [seccion, setSeccion] = useState("inscripcion");
  const [passActual, setPassActual] = useState("");
  const [passNueva, setPassNueva] = useState("");
  const [passConfirm, setPassConfirm] = useState("");
  const [mensajePass, setMensajePass] = useState("");
  const [loadingPass, setLoadingPass] = useState(false);
  const [mobile, setMobile] = useState(window.innerWidth < 640);
  const [solicitudesPendientes, setSolicitudesPendientes] = useState([]);
  const [historialPropio, setHistorialPropio] = useState([]);
  const [empleados, setEmpleados] = useState({});
  const [procesando, setProcesando] = useState(null);
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
    cargarDatos();
    cargarEmpleados();
    cargarSolicitudes();
    cargarRatioPropio();
    cargarHistorialPropio();
  }, []);

  useEffect(() => {
    if (seccion === "cuenta") cargarRatioPropio();
    if (seccion === "cambios") cargarHistorialPropio();
  }, [seccion]);

  const cargarDatos = async () => {
    if (!user) return;
    const snapEmp = await getDoc(doc(db, "empleados", user.uid));
    if (snapEmp.exists()) setEmpleado(snapEmp.data());
    const inscKey = `${anioProximo}-${mesProximo}`;
    const snapInsc = await getDoc(doc(db, "inscripciones", `${user.uid}_${inscKey}`));
    if (snapInsc.exists()) setInscripcion(snapInsc.data());
    const snapConfig = await getDoc(doc(db, "config", "inscripcion"));
    if (snapConfig.exists()) setInscripcionAbierta(snapConfig.data().abierta === true);
  };

  const cargarEmpleados = async () => {
    const snap = await getDocs(collection(db, "empleados"));
    const mapa = {};
    snap.docs.forEach(d => { mapa[d.id] = d.data(); });
    setEmpleados(mapa);
  };

  const cargarSolicitudes = async () => {
    if (!user) return;
    const snap = await getDocs(collection(db, "solicitudesCambio"));
    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => s.receptorId === user.uid && s.estado === "pendiente");
    setSolicitudesPendientes(lista);
  };

  const cargarHistorialPropio = async () => {
    if (!user) return;
    const snap = await getDocs(collection(db, "solicitudesCambio"));
    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s =>
        s.estado !== "pendiente" &&
        (s.solicitanteId === user.uid || s.receptorId === user.uid)
      )
      .sort((a, b) => new Date(b.respondidoEn) - new Date(a.respondidoEn))
      .slice(0, 10);
    setHistorialPropio(lista);
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
      cargarHistorialPropio();
    } catch (err) {
      alert("Error: " + err.message);
    }
    setProcesando(null);
  };

  const inscribirse = async () => {
    if (!preferencia) {
      setMensaje("Elegí una preferencia antes de inscribirte");
      return;
    }
    setLoading(true);
    setMensaje("");
    const inscKey = `${anioProximo}-${mesProximo}`;
    await setDoc(doc(db, "inscripciones", `${user.uid}_${inscKey}`), {
      empleadoId: user.uid,
      nombre: empleado.nombre,
      apellido: empleado.apellido,
      preferencia,
      mes: mesProximo,
      anio: anioProximo,
      fechaInscripcion: new Date().toISOString(),
    });
    setMensaje("✓ Inscripción guardada correctamente");
    cargarDatos();
    setLoading(false);
  };

  const borrarInscripcion = async () => {
    if (!confirm("¿Seguro que querés borrar tu inscripción?")) return;
    const inscKey = `${anioProximo}-${mesProximo}`;
    await deleteDoc(doc(db, "inscripciones", `${user.uid}_${inscKey}`));
    setInscripcion(null);
    setPreferencia("");
    setMensaje("Inscripción cancelada");
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
    if (p === "q1") return "Primera quincena (1-15)";
    if (p === "q2") return "Segunda quincena (16-fin)";
    if (p === "ambas") return "Ambas quincenas";
    return p;
  };

  const labelTab = (s) => {
    if (s === "inscripcion") return `📋 ${mobile ? "Inscripción" : `Inscripción — ${nombreMes}`}`;
    if (s === "calendario") return "📅 Calendario";
    if (s === "cambios") return solicitudesPendientes.length > 0
      ? `🔄 Cambios (${solicitudesPendientes.length})`
      : "🔄 Cambios";
    return "🔑 Mi cuenta";
  };

  const renderHistorialItem = (s) => {
    const solicitante = empleados[s.solicitanteId];
    const receptor = empleados[s.receptorId];
    const esMiSolicitud = s.solicitanteId === user.uid;
    return (
      <div key={s.id} style={{
        ...styles.historialItem,
        borderLeft: `3px solid ${s.estado === "aceptado" ? "#27ae60" : "#e74c3c"}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={{ fontSize: 13, color: "#1a1a2e" }}>
            {esMiSolicitud
              ? <><strong>Pediste</strong> cambiar con {receptor ? `${receptor.apellido}, ${receptor.nombre}` : "..."}</>
              : <><strong>{solicitante ? `${solicitante.apellido}, ${solicitante.nombre}` : "..."}</strong> te pidió cambiar</>
            }
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
            background: s.estado === "aceptado" ? "#eafaf1" : "#fdf2f2",
            color: s.estado === "aceptado" ? "#27ae60" : "#e74c3c",
          }}>
            {s.estado === "aceptado" ? "✓ Aceptado" : "✕ Rechazado"}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
          {s.labelOrigen} ({s.turnoOrigen}) ⇄ {s.labelDestino} ({s.turnoDestino})
        </div>
        {s.respondidoEn && (
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>
            {new Date(s.respondidoEn).toLocaleDateString("es-AR")}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {solicitudesPendientes.length > 0 && seccion !== "cambios" && (
        <div style={styles.banner} onClick={() => setSeccion("cambios")}>
          🔔 Tenés {solicitudesPendientes.length} solicitud{solicitudesPendientes.length > 1 ? "es" : ""} de cambio pendiente{solicitudesPendientes.length > 1 ? "s" : ""}. Tocá para ver.
        </div>
      )}

      <div style={styles.header}>
        <h1 style={styles.title}>solAPPe</h1>
        <div style={styles.headerRight}>
          {empleado && !mobile && (
            <span style={styles.bienvenida}>{empleado.apellido}, {empleado.nombre}</span>
          )}
          <button style={styles.logout} onClick={() => signOut(auth)}>
            {mobile ? "Salir" : "Cerrar sesión"}
          </button>
        </div>
      </div>

      <div style={styles.tabs}>
        {["inscripcion", "calendario", "cambios", "cuenta"].map(s => (
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

        {seccion === "inscripcion" && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Inscripción — {nombreMes} {anioProximo}</h2>
            {!inscripcionAbierta && !inscripcion && (
              <div style={styles.aviso}>
                📅 Las inscripciones están cerradas por el momento.
                Cuando se abra el período vas a poder anotarte acá.
              </div>
            )}
            {inscripcionAbierta && !inscripcion && (
              <div>
                <p style={styles.label}>¿En qué quincena querés hacer el solape?</p>
                <div style={styles.opciones}>
                  {["q1", "q2", "ambas"].map(op => (
                    <button
                      key={op}
                      style={{ ...styles.opcion, ...(preferencia === op ? styles.opcionActiva : {}) }}
                      onClick={() => setPreferencia(op)}
                    >
                      {labelPreferencia(op)}
                    </button>
                  ))}
                </div>
                {mensaje && <p style={styles.mensaje}>{mensaje}</p>}
                <button style={styles.boton} onClick={inscribirse} disabled={loading}>
                  {loading ? "Guardando..." : "Confirmar inscripción"}
                </button>
              </div>
            )}
            {inscripcion && (
              <div>
                <div style={styles.inscriptoBox}>
                  <p style={styles.inscriptoTexto}>
                    ✓ Estás inscripto para <strong>{labelPreferencia(inscripcion.preferencia)}</strong>
                  </p>
                  <p style={styles.inscriptoFecha}>
                    Inscripto el {new Date(inscripcion.fechaInscripcion).toLocaleDateString("es-AR")}
                  </p>
                </div>
                {inscripcionAbierta && (
                  <button style={styles.botonCancelar} onClick={borrarInscripcion}>
                    Cancelar inscripción
                  </button>
                )}
                {mensaje && <p style={styles.mensaje}>{mensaje}</p>}
              </div>
            )}
          </div>
        )}

        {seccion === "calendario" && (
          <div style={styles.card}>
            <Calendario />
          </div>
        )}

        {seccion === "cambios" && (
          <>
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>🔄 Solicitudes pendientes</h2>
              {solicitudesPendientes.length === 0 ? (
                <div style={styles.aviso}>No tenés solicitudes de cambio pendientes.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {solicitudesPendientes.map(s => {
                    const solicitante = empleados[s.solicitanteId];
                    return (
                      <div key={s.id} style={styles.solicitudCard}>
                        <div style={styles.solicitudInfo}>
                          <p style={styles.solicitudTitulo}>
                            <strong>{solicitante ? `${solicitante.apellido}, ${solicitante.nombre}` : "..."}</strong>
                            {" "}quiere cambiar contigo
                          </p>
                          <div style={styles.solicitudDetalle}>
                            <div style={styles.solicitudDia}>
                              <span style={styles.solicitudLabel}>Te da:</span>
                              <span style={styles.solicitudValor}>{s.labelOrigen} — {s.turnoOrigen}</span>
                            </div>
                            <div style={styles.solicitudFlecha}>⇄</div>
                            <div style={styles.solicitudDia}>
                              <span style={styles.solicitudLabel}>Toma tu:</span>
                              <span style={styles.solicitudValor}>{s.labelDestino} — {s.turnoDestino}</span>
                            </div>
                          </div>
                        </div>
                        <div style={styles.solicitudBotones}>
                          <button style={styles.botonAceptar} onClick={() => responderSolicitud(s, true)} disabled={procesando === s.id}>
                            {procesando === s.id ? "..." : "✓ Aceptar"}
                          </button>
                          <button style={styles.botonRechazar} onClick={() => responderSolicitud(s, false)} disabled={procesando === s.id}>
                            ✕ Rechazar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={styles.card}>
              <h2 style={styles.cardTitle}>📋 Mis últimos cambios</h2>
              {historialPropio.length === 0 ? (
                <div style={styles.aviso}>No tenés cambios registrados todavía.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {historialPropio.map(s => renderHistorialItem(s))}
                </div>
              )}
            </div>
          </>
        )}

        {seccion === "cuenta" && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>🔑 Mi cuenta</h2>
            {empleado && (
              <p style={{ color: "#666", marginBottom: 16, fontSize: 14 }}>
                <strong>{empleado.apellido}, {empleado.nombre}</strong>
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
              <button style={styles.boton} onClick={cambiarPassword} disabled={loadingPass}>
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
    background: "#1a1a2e", color: "white", padding: "12px 16px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  title: { fontSize: 20, fontWeight: 800 },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  bienvenida: { fontSize: 14, opacity: 0.85 },
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
  tabActivo: { color: "#1a1a2e", fontWeight: 700, borderBottom: "3px solid #1a1a2e" },
  tabAlerta: { color: "#3f51b5", fontWeight: 700 },
  content: { padding: 16, maxWidth: 1000, margin: "0 auto" },
  card: {
    background: "white", borderRadius: 12, padding: 20, marginBottom: 16,
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  cardTitle: { fontSize: 17, fontWeight: 700, marginBottom: 16, color: "#1a1a2e" },
  aviso: {
    background: "#fef9e7", border: "1px solid #f39c12",
    borderRadius: 8, padding: 16, color: "#856404", fontSize: 15,
  },
  label: { fontWeight: 600, marginBottom: 12, color: "#333" },
  opciones: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 },
  opcion: {
    padding: "12px 16px", borderRadius: 8, border: "2px solid #ddd",
    background: "white", fontSize: 15, textAlign: "left", color: "#333",
  },
  opcionActiva: {
    border: "2px solid #1a1a2e", background: "#f0f2f5", fontWeight: 600, color: "#1a1a2e",
  },
  boton: {
    background: "#1a1a2e", color: "white", border: "none",
    padding: "12px 24px", borderRadius: 8, fontSize: 15, fontWeight: 600, width: "100%",
  },
  botonCancelar: {
    background: "transparent", color: "#e74c3c", border: "1px solid #e74c3c",
    padding: "10px 20px", borderRadius: 8, fontSize: 14, marginTop: 12,
  },
  inscriptoBox: {
    background: "#eafaf1", border: "1px solid #27ae60", borderRadius: 8, padding: 16, marginBottom: 12,
  },
  inscriptoTexto: { color: "#1e8449", fontWeight: 600, fontSize: 15 },
  inscriptoFecha: { color: "#666", fontSize: 13, marginTop: 4 },
  mensaje: { marginTop: 12, color: "#27ae60", fontWeight: 500 },
  input: {
    padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd",
    fontSize: 15, outline: "none", background: "white", color: "#1a1a2e",
    width: "100%", boxSizing: "border-box",
  },
  solicitudCard: { border: "1px solid #e8eaf6", borderRadius: 10, padding: 16, background: "#f8f9ff" },
  solicitudInfo: { marginBottom: 12 },
  solicitudTitulo: { fontSize: 14, color: "#1a1a2e", marginBottom: 10 },
  solicitudDetalle: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  solicitudDia: { display: "flex", flexDirection: "column", gap: 2 },
  solicitudLabel: { fontSize: 11, color: "#666", fontWeight: 600, textTransform: "uppercase" },
  solicitudValor: { fontSize: 14, color: "#1a1a2e", fontWeight: 700 },
  solicitudFlecha: { fontSize: 20, color: "#3f51b5", fontWeight: 700 },
  solicitudBotones: { display: "flex", gap: 8 },
  botonAceptar: {
    background: "#27ae60", color: "white", border: "none",
    padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  botonRechazar: {
    background: "transparent", color: "#e74c3c", border: "1px solid #e74c3c",
    padding: "8px 16px", borderRadius: 8, fontSize: 14, cursor: "pointer",
  },
  historialItem: {
    background: "white", borderRadius: 8, padding: "10px 14px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  ratioBox: {
    background: "#f0f2f5", borderRadius: 10, padding: "14px 18px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: 8,
  },
  ratioTitulo: { fontSize: 14, fontWeight: 600, color: "#1a1a2e" },
  ratioNumero: { fontSize: 15, fontWeight: 700 },
};