import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import Calendario from "./Calendario";

export default function Dashboard() {
  const [empleado, setEmpleado] = useState(null);
  const [inscripcion, setInscripcion] = useState(null);
  const [preferencia, setPreferencia] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);
  const [inscripcionAbierta, setInscripcionAbierta] = useState(false);
  const [seccion, setSeccion] = useState("inscripcion");

  const user = auth.currentUser;
  const ahora = new Date();
  const mes = ahora.getMonth() + 1;
  const anio = ahora.getFullYear();
  const mesProximo = mes === 12 ? 1 : mes + 1;
  const anioProximo = mes === 12 ? anio + 1 : anio;
  const nombreMes = new Date(anioProximo, mesProximo - 1, 1)
    .toLocaleString("es-AR", { month: "long" });

  useEffect(() => {
    cargarDatos();
  }, []);

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

  const labelPreferencia = (p) => {
    if (p === "q1") return "Primera quincena (1-15)";
    if (p === "q2") return "Segunda quincena (16-fin)";
    if (p === "ambas") return "Ambas quincenas";
    return p;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>solAPPe</h1>
        <div style={styles.headerRight}>
          {empleado && (
            <span style={styles.bienvenida}>
              {empleado.apellido}, {empleado.nombre}
            </span>
          )}
          <button style={styles.logout} onClick={() => signOut(auth)}>
            Cerrar sesión
          </button>
        </div>
      </div>

      <div style={styles.tabs}>
        {["inscripcion", "calendario"].map(s => (
          <button
            key={s}
            style={{ ...styles.tab, ...(seccion === s ? styles.tabActivo : {}) }}
            onClick={() => setSeccion(s)}
          >
            {s === "inscripcion" ? `Inscripción — ${nombreMes}` : "Calendario"}
          </button>
        ))}
      </div>

      <div style={styles.content}>

        {seccion === "inscripcion" && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>
              Inscripción — {nombreMes} {anioProximo}
            </h2>

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
                      style={{
                        ...styles.opcion,
                        ...(preferencia === op ? styles.opcionActiva : {})
                      }}
                      onClick={() => setPreferencia(op)}
                    >
                      {labelPreferencia(op)}
                    </button>
                  ))}
                </div>
                {mensaje && <p style={styles.mensaje}>{mensaje}</p>}
                <button
                  style={styles.boton}
                  onClick={inscribirse}
                  disabled={loading}
                >
                  {loading ? "Guardando..." : "Confirmar inscripción"}
                </button>
              </div>
            )}

            {inscripcion && (
              <div>
                <div style={styles.inscriptoBox}>
                  <p style={styles.inscriptoTexto}>
                    ✓ Estás inscripto para{" "}
                    <strong>{labelPreferencia(inscripcion.preferencia)}</strong>
                  </p>
                  <p style={styles.inscriptoFecha}>
                    Inscripto el{" "}
                    {new Date(inscripcion.fechaInscripcion).toLocaleDateString("es-AR")}
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

      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: "100vh", background: "#f0f2f5" },
  header: {
    background: "#1a1a2e", color: "white", padding: "16px 24px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  title: { fontSize: 22, fontWeight: 800 },
  headerRight: { display: "flex", alignItems: "center", gap: 16 },
  bienvenida: { fontSize: 14, opacity: 0.85 },
  logout: {
    background: "transparent", border: "1px solid white", color: "white",
    padding: "8px 16px", borderRadius: 8, fontSize: 14,
  },
  tabs: {
    display: "flex", background: "white",
    borderBottom: "2px solid #f0f2f5", padding: "0 24px",
  },
  tab: {
    padding: "14px 20px", border: "none", background: "transparent",
    fontSize: 15, color: "#666", borderBottom: "3px solid transparent",
    marginBottom: -2,
  },
  tabActivo: { color: "#1a1a2e", fontWeight: 700, borderBottom: "3px solid #1a1a2e" },
  content: { padding: 24, maxWidth: 1000, margin: "0 auto" },
  card: {
    background: "white", borderRadius: 12, padding: 24, marginBottom: 24,
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  cardTitle: { fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#1a1a2e" },
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
    border: "2px solid #1a1a2e", background: "#f0f2f5",
    fontWeight: 600, color: "#1a1a2e",
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
    background: "#eafaf1", border: "1px solid #27ae60",
    borderRadius: 8, padding: 16, marginBottom: 12,
  },
  inscriptoTexto: { color: "#1e8449", fontWeight: 600, fontSize: 15 },
  inscriptoFecha: { color: "#666", fontSize: 13, marginTop: 4 },
  mensaje: { marginTop: 12, color: "#27ae60", fontWeight: 500 },
};