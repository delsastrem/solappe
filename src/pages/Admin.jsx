import { useState, useEffect } from "react";
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { auth, db, authSecundaria } from "../firebase";
import {
  collection, getDocs, deleteDoc, doc, setDoc, getDoc
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
  }, []);

  useEffect(() => {
    if (seccion === "resumen") cargarResumen();
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

  const cargarResumen = async () => {
    const snap = await getDocs(collection(db, "asignaciones"));
    const asigs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => a.mes === mesProximo && a.anio === anioProximo);

    const mapaEmpleados = {};
    empleados.forEach(e => { mapaEmpleados[e.id] = e; });

    const q1 = asigs
      .filter(a => a.quincena === 1)
      .map(a => {
        const emp = mapaEmpleados[a.empleadoId];
        return {
          nombre: emp ? `${emp.apellido}, ${emp.nombre}` : a.empleadoId,
          dias: a.dias.length,
          detalle: a.dias,
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    const q2 = asigs
      .filter(a => a.quincena === 2)
      .map(a => {
        const emp = mapaEmpleados[a.empleadoId];
        return {
          nombre: emp ? `${emp.apellido}, ${emp.nombre}` : a.empleadoId,
          dias: a.dias.length,
          detalle: a.dias,
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    setResumenQ1(q1);
    setResumenQ2(q2);
  };

  const ejecutarDistribucion = async () => {
    if (!confirm(`¿Ejecutar la distribución para ${nombreMes} ${anioProximo}?`)) return;
    setDistribuyendo(true);
    setMensajeDistribucion("");
    try {
      const snapEmps = await getDocs(collection(db, "empleados"));
      const historial = {};
      snapEmps.docs.forEach(d => {
        historial[d.id] = d.data().historialDescartes || 0;
      });

      const snapInsc = await getDocs(collection(db, "inscripciones"));
      const inscriptos = snapInsc.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(i => i.mes === mesProximo && i.anio === anioProximo);

      const snapAsig = await getDocs(collection(db, "asignaciones"));
      const borrar = snapAsig.docs.filter(d => {
        const data = d.data();
        return data.mes === mesProximo && data.anio === anioProximo;
      });
      for (const d of borrar) {
        await deleteDoc(doc(db, "asignaciones", d.id));
      }

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
        await setDoc(
          doc(db, "empleados", desc.empleadoId),
          { historialDescartes: actual + 1 },
          { merge: true }
        );
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
    return "🔑 Mi cuenta";
  };

  const COLORES_TURNO = {
    mañana: { bg: "#fff8e1", text: "#856404" },
    tarde:  { bg: "#e8f5e9", text: "#1e8449" },
    noche:  { bg: "#e8eaf6", text: "#283593" },
  };

  const renderColumnaResumen = (lista, titulo, quincena) => (
    <div style={styles.resumenCol}>
      <div style={styles.resumenHeader}>
        <h3 style={styles.resumenTitulo}>{titulo}</h3>
        <span style={styles.resumenCount}>{lista.length} personas</span>
      </div>
      {lista.length === 0 ? (
        <p style={{ color: "#999", fontSize: 13, padding: 12 }}>
          Sin distribución generada
        </p>
      ) : (
        lista.map((emp, i) => (
          <div key={i} style={styles.resumenFila}>
            <div style={styles.resumenNombre}>{emp.nombre}</div>
            <div style={styles.resumenDias}>
              {emp.detalle.map((d, j) => {
                const color = COLORES_TURNO[d.turno] || { bg: "#f5f5f5", text: "#333" };
                return (
                  <span key={j} style={{
                    ...styles.resumenChip,
                    background: color.bg,
                    color: color.text,
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

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>solAPPe {mobile ? "" : "— Admin"}</h1>
        <button style={styles.logout} onClick={() => signOut(auth)}>
          {mobile ? "Salir" : "Cerrar sesión"}
        </button>
      </div>

      <div style={styles.tabs}>
        {["empleados", "inscripciones", "resumen", "calendario", "cuenta"].map(s => (
          <button
            key={s}
            style={{ ...styles.tab, ...(seccion === s ? styles.tabActivo : {}) }}
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
                  <div>
                    <span style={styles.empleadoNombre}>{e.apellido}, {e.nombre}</span>
                    {!mobile && <span style={styles.empleadoEmail}> — {e.email}</span>}
                    {e.esAdmin && <span style={styles.badgeAdmin}>ADMIN</span>}
                    {mobile && <div style={styles.empleadoEmail}>{e.email}</div>}
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
            <h2 style={styles.cardTitle}>
              Resumen de distribución — {nombreMes} {anioProximo}
            </h2>
            {resumenQ1.length === 0 && resumenQ2.length === 0 ? (
              <div style={styles.aviso}>
                📊 Todavía no se generó la distribución para este mes.
              </div>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: mobile ? "1fr" : "1fr 1fr",
                gap: 16,
              }}>
                {renderColumnaResumen(resumenQ1, "1ra Quincena (1-15)", 1)}
                {renderColumnaResumen(resumenQ2, "2da Quincena (16-fin)", 2)}
              </div>
            )}
          </div>
        )}

        {seccion === "calendario" && (
          <div style={styles.card}>
            <Calendario esAdmin={true} />
          </div>
        )}

        {seccion === "cuenta" && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Cambiar contraseña</h2>
            {empleadoActual && (
              <p style={{ color: "#666", marginBottom: 16, fontSize: 14 }}>
                Usuario: <strong>{empleadoActual.apellido}, {empleadoActual.nombre}</strong>
              </p>
            )}
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
    borderBottom: "2px solid #f0f2f5", padding: "0 8px",
    overflowX: "auto",
  },
  tab: {
    padding: "12px 14px", border: "none", background: "transparent",
    fontSize: 13, color: "#666", borderBottom: "3px solid transparent",
    marginBottom: -2, whiteSpace: "nowrap",
  },
  tabActivo: { color: "#c0392b", fontWeight: 700, borderBottom: "3px solid #c0392b" },
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
  empleadoEmail: { color: "#666", fontSize: 13 },
  badgeAdmin: {
    background: "#c0392b", color: "white", fontSize: 11, fontWeight: 700,
    padding: "2px 8px", borderRadius: 4, marginLeft: 8,
  },
  rowBotones: { display: "flex", gap: 8 },
  estadoRow: { display: "flex", alignItems: "center", gap: 16 },
  estadoBadge: { padding: "10px 16px", borderRadius: 8, fontWeight: 600, fontSize: 14, flex: 1 },
  resumenCol: {
    border: "1px solid #eee", borderRadius: 10, overflow: "hidden",
  },
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
  resumenFila: {
    padding: "10px 14px", borderBottom: "1px solid #f5f5f5",
  },
  resumenNombre: { fontWeight: 600, fontSize: 14, color: "#1a1a2e", marginBottom: 6 },
  resumenDias: { display: "flex", flexWrap: "wrap", gap: 4 },
  resumenChip: {
    fontSize: 12, padding: "2px 8px", borderRadius: 6, fontWeight: 500,
  },
};
