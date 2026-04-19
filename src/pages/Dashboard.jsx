import { useState, useEffect } from "react";
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import Calendario from "./Calendario";
import Wordle from "./Wordle";
import { suscribirNotificaciones } from "../utils/notificaciones";

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
  const [solicitudesEnviadas, setSolicitudesEnviadas] = useState([]);
  const [historialPropio, setHistorialPropio] = useState([]);
  const [empleados, setEmpleados] = useState({});
  const [procesando, setProcesando] = useState(null);
  const [ratioPropio, setRatioPropio] = useState(null);
  const [misAsignaciones, setMisAsignaciones] = useState([]);
  const [resumenMeses, setResumenMeses] = useState([]);
  const [mesResumenSeleccionado, setMesResumenSeleccionado] = useState(null);

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
    cargarMisAsignaciones();
    if (user) suscribirNotificaciones(user.uid);
  }, []);

  useEffect(() => {
    if (seccion === "cuenta") cargarRatioPropio();
    if (seccion === "cambios") { cargarSolicitudes(); cargarHistorialPropio(); }
    if (seccion === "resumen") cargarResumen();
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

  const cargarMisAsignaciones = async () => {
    if (!user) return;
    const snap = await getDocs(collection(db, "asignaciones"));
    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => a.empleadoId === user.uid);
    setMisAsignaciones(lista);
  };

  const cargarSolicitudes = async () => {
    if (!user) return;
    const snap = await getDocs(collection(db, "solicitudesCambio"));
    const todas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setSolicitudesPendientes(todas.filter(s => s.receptorId === user.uid && s.estado === "pendiente"));
    setSolicitudesEnviadas(todas.filter(s => s.solicitanteId === user.uid && s.estado === "pendiente"));
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

  const cargarResumen = async () => {
    const snapAsig = await getDocs(collection(db, "asignaciones"));
    const mapaEmp = { ...empleados };
    const porMes = {};
    snapAsig.docs.forEach(d => {
      const data = d.data();
      const key = `${data.anio}-${data.mes}`;
      if (!porMes[key]) porMes[key] = { anio: data.anio, mes: data.mes, docs: [] };
      porMes[key].docs.push(data);
    });
    const meses = Object.values(porMes).sort((a, b) => {
      if (a.anio !== b.anio) return b.anio - a.anio;
      return b.mes - a.mes;
    });
    const resultado = meses.map(({ anio: a, mes: m, docs }) => {
      const label = new Date(a, m - 1, 1).toLocaleString("es-AR", { month: "long", year: "numeric" });
      const esFuturo = a > anio || (a === anio && m > mes);
      const mapear = (quincena) =>
        docs.filter(d => d.quincena === quincena).map(d => {
          const emp = mapaEmp[d.empleadoId];
          const esMio = d.empleadoId === user.uid;
          return {
            nombre: emp ? `${emp.apellido}, ${emp.nombre}` : d.empleadoId,
            dias: d.dias.length, detalle: d.dias, esMio,
          };
        }).sort((a, b) => a.nombre.localeCompare(b.nombre));
      return { key: `${a}-${m}`, label, anio: a, mes: m, esFuturo, q1: mapear(1), q2: mapear(2) };
    });
    setResumenMeses(resultado);
    if (resultado.length > 0 && !mesResumenSeleccionado) {
      setMesResumenSeleccionado(resultado[0].key);
    }
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
    if (!preferencia) { setMensaje("Elegí una preferencia antes de inscribirte"); return; }
    setLoading(true);
    setMensaje("");
    const inscKey = `${anioProximo}-${mesProximo}`;
    await setDoc(doc(db, "inscripciones", `${user.uid}_${inscKey}`), {
      empleadoId: user.uid, nombre: empleado.nombre, apellido: empleado.apellido,
      preferencia, mes: mesProximo, anio: anioProximo,
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
    if (!passActual || !passNueva || !passConfirm) { setMensajePass("Completá todos los campos"); return; }
    if (passNueva !== passConfirm) { setMensajePass("Las contraseñas nuevas no coinciden"); return; }
    if (passNueva.length < 6) { setMensajePass("La contraseña nueva debe tener al menos 6 caracteres"); return; }
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

  const exportarICS = () => {
    let dias = [];
    misAsignaciones.forEach(asig => {
      asig.dias.forEach(d => { dias.push({ fecha: d.fecha, turno: d.turno, label: d.label }); });
    });
    if (dias.length === 0) { alert("No tenés días asignados para exportar."); return; }
    const turnoHoras = {
      mañana: { inicio: "070000", fin: "150000" },
      tarde:  { inicio: "150000", fin: "230000" },
      noche:  { inicio: "230000", fin: "070000" },
    };
    const formatFecha = (isoStr, horaStr) => {
      const f = new Date(isoStr);
      return `${f.getFullYear()}${String(f.getMonth()+1).padStart(2,"0")}${String(f.getDate()).padStart(2,"0")}T${horaStr}`;
    };
    const formatFechaSiguiente = (isoStr, horaStr) => {
      const f = new Date(isoStr);
      f.setDate(f.getDate() + 1);
      return `${f.getFullYear()}${String(f.getMonth()+1).padStart(2,"0")}${String(f.getDate()).padStart(2,"0")}T${horaStr}`;
    };
    let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//solAPPe//ES\r\nCALSCALE:GREGORIAN\r\n";
    dias.forEach((d, i) => {
      const horas = turnoHoras[d.turno] || { inicio: "080000", fin: "160000" };
      const esNoche = d.turno === "noche";
      const dtStart = formatFecha(d.fecha, horas.inicio);
      const dtEnd = esNoche ? formatFechaSiguiente(d.fecha, horas.fin) : formatFecha(d.fecha, horas.fin);
      const turnoLabel = d.turno === "mañana" ? "☀️ Mañana" : d.turno === "tarde" ? "🌅 Tarde" : "🌙 Noche";
      ics += `BEGIN:VEVENT\r\nUID:solappe-${user.uid}-${i}@solappe\r\nDTSTART;TZID=America/Argentina/Buenos_Aires:${dtStart}\r\nDTEND;TZID=America/Argentina/Buenos_Aires:${dtEnd}\r\nSUMMARY:Solape — ${turnoLabel}\r\nDESCRIPTION:Turno de solape generado por solAPPe\r\nEND:VEVENT\r\n`;
    });
    ics += "END:VCALENDAR";
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `solape-mis-dias.ics`;
    link.click();
  };

  const labelPreferencia = (p) => {
    if (p === "q1") return "Primera quincena (1-15)";
    if (p === "q2") return "Segunda quincena (16-fin)";
    if (p === "ambas") return "Ambas quincenas";
    return p;
  };

  const labelTab = (s) => {
    const total = solicitudesPendientes.length + solicitudesEnviadas.length;
    if (s === "inscripcion") return `📋 ${mobile ? "Inscripción" : `Inscripción — ${nombreMes}`}`;
    if (s === "calendario") return "📅 Calendario";
    if (s === "resumen") return "📊 Resumen";
    if (s === "cambios") return total > 0 ? `🔄 Cambios (${total})` : "🔄 Cambios";
    if (s === "wordle") return "✈️ AeroWordle";
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
          <div key={i} style={{
            ...styles.resumenFila,
            background: emp.esMio ? "#f0f4ff" : "white",
            borderLeft: emp.esMio ? "3px solid #3f51b5" : "none",
          }}>
            <div style={{ ...styles.resumenNombre, color: emp.esMio ? "#283593" : "#1a1a2e" }}>
              {emp.nombre} {emp.esMio ? "👈" : ""}
            </div>
            <div style={styles.resumenDias}>
              {emp.detalle.map((d, j) => {
                const color = COLORES_TURNO[d.turno] || { bg: "#f5f5f5", text: "#333" };
                const yaOcurrio = new Date(d.fecha) < ahora;
                return (
                  <span key={j} style={{
                    ...styles.resumenChip,
                    background: yaOcurrio ? "#f0f2f5" : color.bg,
                    color: yaOcurrio ? "#aaa" : color.text,
                    textDecoration: yaOcurrio ? "line-through" : "none",
                  }}>
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

  const mesSeleccionado = resumenMeses.find(m => m.key === mesResumenSeleccionado);

  return (
    <div style={styles.container}>
      {(solicitudesPendientes.length > 0 || solicitudesEnviadas.length > 0) && seccion !== "cambios" && (
        <div style={styles.banner} onClick={() => setSeccion("cambios")}>
          🔔{" "}
          {solicitudesPendientes.length > 0 && `Tenés ${solicitudesPendientes.length} solicitud${solicitudesPendientes.length > 1 ? "es" : ""} pendiente${solicitudesPendientes.length > 1 ? "s" : ""}`}
          {solicitudesPendientes.length > 0 && solicitudesEnviadas.length > 0 && " · "}
          {solicitudesEnviadas.length > 0 && `${solicitudesEnviadas.length} solicitud${solicitudesEnviadas.length > 1 ? "es" : ""} enviada${solicitudesEnviadas.length > 1 ? "s" : ""} en espera`}
          {". Tocá para ver."}
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
        {["inscripcion", "calendario", "resumen", "cambios", "wordle", "cuenta"].map(s => (
          <button
            key={s}
            style={{
              ...styles.tab,
              ...(seccion === s ? styles.tabActivo : {}),
              ...((s === "cambios" && (solicitudesPendientes.length > 0 || solicitudesEnviadas.length > 0)) ? styles.tabAlerta : {}),
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
            <Calendario solicitudesEnviadas={solicitudesEnviadas} solicitudesPendientes={solicitudesPendientes} />
            <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
              <button
                style={{ ...styles.boton, background: "#3f51b5", width: "auto", padding: "10px 20px", fontSize: 14 }}
                onClick={() => exportarICS()}
              >
                📅 Exportar mis días a Google Calendar
              </button>
            </div>
          </div>
        )}

        {seccion === "resumen" && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>📊 Distribuciones</h2>
            {resumenMeses.length === 0 ? (
              <div style={styles.aviso}>No hay distribuciones generadas todavía.</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                  {resumenMeses.map(m => (
                    <button
                      key={m.key}
                      style={{
                        padding: "6px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                        background: mesResumenSeleccionado === m.key ? "#1a1a2e" : "white",
                        color: mesResumenSeleccionado === m.key ? "white" : "#666",
                        border: `1px solid ${mesResumenSeleccionado === m.key ? "#1a1a2e" : "#ddd"}`,
                        fontWeight: mesResumenSeleccionado === m.key ? 700 : 400,
                        textTransform: "capitalize",
                      }}
                      onClick={() => setMesResumenSeleccionado(m.key)}
                    >
                      {m.label}
                      {m.esFuturo && (
                        <span style={{ marginLeft: 4, fontSize: 10, color: mesResumenSeleccionado === m.key ? "#adf" : "#3f51b5" }}>
                          próximo
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {mesSeleccionado && (
                  <>
                    <div style={{ fontSize: 12, color: "#999", marginBottom: 12, fontStyle: "italic" }}>
                      {mesSeleccionado.esFuturo
                        ? "Distribución generada para el próximo mes."
                        : "Distribución original tal como fue lanzada. Los días tachados ya ocurrieron. Tu fila aparece resaltada."
                      }
                    </div>
                    {mesSeleccionado.q1.length === 0 && mesSeleccionado.q2.length === 0 ? (
                      <div style={styles.aviso}>Sin datos para este mes.</div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                        {renderColumnaResumen(mesSeleccionado.q1, "1ra Quincena (1-15)")}
                        {renderColumnaResumen(mesSeleccionado.q2, "2da Quincena (16-fin)")}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {seccion === "cambios" && (
          <>
            {solicitudesEnviadas.length > 0 && (
              <div style={styles.card}>
                <h2 style={styles.cardTitle}>⏳ Solicitudes enviadas en espera</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {solicitudesEnviadas.map(s => {
                    const receptor = empleados[s.receptorId];
                    return (
                      <div key={s.id} style={{
                        ...styles.solicitudCard,
                        borderLeft: "4px solid #f39c12",
                        background: "#fffbf0",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                          <span style={{ fontSize: 13, color: "#1a1a2e" }}>
                            Esperando respuesta de{" "}
                            <strong>{receptor ? `${receptor.apellido}, ${receptor.nombre}` : "..."}</strong>
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: "#fef3cd", color: "#856404" }}>
                            ⏳ Pendiente
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "#666" }}>
                          {s.labelOrigen} ({s.turnoOrigen}) ⇄ {s.labelDestino} ({s.turnoDestino})
                        </div>
                        <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                          Enviada el {new Date(s.creadoEn).toLocaleDateString("es-AR")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={styles.card}>
              <h2 style={styles.cardTitle}>🔄 Solicitudes recibidas</h2>
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

        {seccion === "wordle" && (
          <div style={styles.card}>
            <Wordle />
          </div>
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
  resumenNombre: { fontWeight: 600, fontSize: 14, marginBottom: 6 },
  resumenDias: { display: "flex", flexWrap: "wrap", gap: 4 },
  resumenChip: { fontSize: 12, padding: "2px 8px", borderRadius: 6, fontWeight: 500 },
};