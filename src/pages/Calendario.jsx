import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, getDocs } from "firebase/firestore";
import { getTurnoParaDia } from "../utils/distribucion";

const COLORES_TURNO = {
  mañana: { bg: "#fff8e1", border: "#f39c12", texto: "#856404", label: "☀️ Mañana" },
  tarde:  { bg: "#e8f5e9", border: "#27ae60", texto: "#1e8449", label: "🌅 Tarde" },
  noche:  { bg: "#e8eaf6", border: "#3f51b5", texto: "#283593", label: "🌙 Noche" },
  franco: { bg: "#f5f5f5", border: "#ccc",    texto: "#999",    label: "Franco" },
};

const isMobile = () => window.innerWidth < 640;

export default function Calendario({ esAdmin }) {
  const [asignaciones, setAsignaciones] = useState([]);
  const [empleados, setEmpleados] = useState({});
  const [vista, setVista] = useState(isMobile() ? "lista" : "calendario");
  const [mobile, setMobile] = useState(isMobile());

  const ahora = new Date();
  const [mes, setMes] = useState(ahora.getMonth() + 1);
  const [anio, setAnio] = useState(ahora.getFullYear());

  const nombreMes = new Date(anio, mes - 1, 1)
    .toLocaleString("es-AR", { month: "long", year: "numeric" });

  useEffect(() => {
    const handleResize = () => {
      const m = isMobile();
      setMobile(m);
      if (m) setVista("lista");
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    cargarAsignaciones();
  }, [mes, anio]);

  useEffect(() => {
    const cargarEmpleados = async () => {
      const snap = await getDocs(collection(db, "empleados"));
      const mapa = {};
      snap.docs.forEach(d => { mapa[d.id] = d.data(); });
      setEmpleados(mapa);
    };
    cargarEmpleados();
  }, []);

  const cargarAsignaciones = async () => {
    const snap = await getDocs(collection(db, "asignaciones"));
    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => a.mes === mes && a.anio === anio);
    setAsignaciones(lista);
  };

  const mapaDias = {};
  asignaciones.forEach(asig => {
    asig.dias.forEach(d => {
      const fecha = new Date(d.fecha);
      const dia = fecha.getDate();
      if (!mapaDias[dia]) mapaDias[dia] = [];
      mapaDias[dia].push({ empleadoId: asig.empleadoId, turno: d.turno });
    });
  });

  const diasDelMes = new Date(anio, mes, 0).getDate();
  const primerDia = new Date(anio, mes - 1, 1).getDay();
  const primerLunes = primerDia === 0 ? 6 : primerDia - 1;

  const cambiarMes = (delta) => {
    let nuevoMes = mes + delta;
    let nuevoAnio = anio;
    if (nuevoMes > 12) { nuevoMes = 1; nuevoAnio++; }
    if (nuevoMes < 1)  { nuevoMes = 12; nuevoAnio--; }
    setMes(nuevoMes);
    setAnio(nuevoAnio);
  };

  const getDiaInfo = (dia) => {
    const fecha = new Date(anio, mes - 1, dia);
    const turno = getTurnoParaDia(fecha);
    const asignados = mapaDias[dia] || [];
    return { turno, asignados };
  };

  // ---- VISTA CALENDARIO ----
  const renderCalendario = () => {
    const celdas = [];
    for (let i = 0; i < primerLunes; i++) {
      celdas.push(<div key={`v${i}`} />);
    }
    for (let dia = 1; dia <= diasDelMes; dia++) {
      const { turno, asignados } = getDiaInfo(dia);
      const color = COLORES_TURNO[turno];
      const esHoy = dia === ahora.getDate() && mes === ahora.getMonth() + 1 && anio === ahora.getFullYear();
      celdas.push(
        <div key={dia} style={{
          ...styles.celda,
          background: color.bg,
          border: `1.5px solid ${esHoy ? "#c0392b" : color.border}`,
          outline: esHoy ? "2px solid #c0392b" : "none",
        }}>
          <div style={styles.celdaHeader}>
            <span style={{ fontWeight: 700, fontSize: 13, color: esHoy ? "#c0392b" : "#1a1a2e" }}>{dia}</span>
            <span style={{ fontSize: 9, color: color.texto, fontWeight: 600, lineHeight: 1.2, textAlign: "right" }}>
              {turno !== "franco" ? turno : "F"}
            </span>
          </div>
          {asignados.length > 0 && (
            <div style={styles.asignadosList}>
              {asignados
                .sort((a, b) => a.turno.localeCompare(b.turno))
                .map((a, i) => {
                  const emp = empleados[a.empleadoId];
                  return (
                    <div key={i} style={styles.chipEmpleado}>
                      {emp ? emp.apellido.substring(0, 8) : "..."}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      );
    }
    return celdas;
  };

  // ---- VISTA LISTA ----
  const renderLista = () => {
    const dias = [];
    for (let dia = 1; dia <= diasDelMes; dia++) {
      const { turno, asignados } = getDiaInfo(dia);
      if (asignados.length === 0 && turno === "franco") continue;
      const color = COLORES_TURNO[turno];
      const fecha = new Date(anio, mes - 1, dia);
      const nombreDia = fecha.toLocaleString("es-AR", { weekday: "short" });
      dias.push(
        <div key={dia} style={{ ...styles.listaFila, borderLeft: `4px solid ${color.border}` }}>
          <div style={styles.listaFecha}>
            <span style={styles.listaDia}>{dia}</span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={styles.listaNombreDia}>{nombreDia}</span>
              <span style={{ ...styles.listaTurno, color: color.texto, background: color.bg }}>
                {color.label}
              </span>
            </div>
          </div>
          <div style={styles.listaEmpleados}>
            {asignados.length === 0 ? (
              <span style={{ color: "#999", fontSize: 13 }}>Sin asignados</span>
            ) : (
              asignados
                .sort((a, b) => a.turno.localeCompare(b.turno))
                .map((a, i) => {
                  const emp = empleados[a.empleadoId];
                  return (
                    <span key={i} style={styles.chipEmpleado}>
                      {emp ? `${emp.apellido}, ${emp.nombre}` : "..."}
                    </span>
                  );
                })
            )}
          </div>
        </div>
      );
    }
    return dias;
  };

  return (
    <div style={styles.container}>
      {/* Navegación de mes */}
      <div style={styles.navMes}>
        <button style={styles.navBtn} onClick={() => cambiarMes(-1)}>◀</button>
        <h2 style={styles.navTitulo}>{nombreMes}</h2>
        <button style={styles.navBtn} onClick={() => cambiarMes(1)}>▶</button>
      </div>

      {/* Toggle vista — solo en desktop */}
      {!mobile && (
        <div style={styles.toggleVista}>
          {["calendario", "lista"].map(v => (
            <button
              key={v}
              style={{ ...styles.toggleBtn, ...(vista === v ? styles.toggleActivo : {}) }}
              onClick={() => setVista(v)}
            >
              {v === "calendario" ? "📅 Calendario" : "📋 Lista"}
            </button>
          ))}
        </div>
      )}

      {/* Leyenda */}
      <div style={styles.leyenda}>
        {Object.entries(COLORES_TURNO).filter(([k]) => k !== "franco").map(([k, v]) => (
          <div key={k} style={styles.leyendaItem}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: v.border }} />
            <span style={{ fontSize: 12, color: "#555" }}>{v.label}</span>
          </div>
        ))}
      </div>

      {vista === "calendario" && !mobile ? (
        <div style={styles.grid}>
          {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d => (
            <div key={d} style={styles.headerDia}>{d}</div>
          ))}
          {renderCalendario()}
        </div>
      ) : (
        <div style={styles.listaContainer}>
          {renderLista()}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { padding: "16px 12px", maxWidth: 1000, margin: "0 auto", boxSizing: "border-box", width: "100%" },
  navMes: { display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 16 },
  navBtn: {
    background: "#1a1a2e", color: "white", border: "none",
    borderRadius: 8, padding: "8px 14px", fontSize: 16, cursor: "pointer",
  },
  navTitulo: {
    fontSize: 18, fontWeight: 700, color: "#1a1a2e",
    textTransform: "capitalize", minWidth: 160, textAlign: "center",
  },
  toggleVista: { display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 },
  toggleBtn: {
    padding: "8px 20px", borderRadius: 8, border: "1px solid #ddd",
    background: "white", fontSize: 14, color: "#666",
  },
  toggleActivo: { background: "#1a1a2e", color: "white", border: "1px solid #1a1a2e", fontWeight: 600 },
  leyenda: { display: "flex", gap: 12, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" },
  leyendaItem: { display: "flex", alignItems: "center", gap: 5 },
  grid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 },
  headerDia: { textAlign: "center", fontWeight: 700, fontSize: 12, color: "#666", padding: "6px 0" },
  celda: {
    borderRadius: 6, padding: 4, minHeight: 70,
    display: "flex", flexDirection: "column", gap: 3,
  },
  celdaHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  asignadosList: { display: "flex", flexDirection: "column", gap: 2 },
  chipEmpleado: {
    background: "rgba(0,0,0,0.08)", borderRadius: 4,
    padding: "1px 4px", fontSize: 10, color: "#333",
  },
  listaContainer: { display: "flex", flexDirection: "column", gap: 8 },
  listaFila: {
    background: "white", borderRadius: 8, padding: "10px 12px",
    display: "flex", alignItems: "center", gap: 12,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  listaFecha: { display: "flex", alignItems: "center", gap: 8, minWidth: 110 },
  listaDia: { fontSize: 20, fontWeight: 800, color: "#1a1a2e", minWidth: 28 },
  listaNombreDia: { fontSize: 12, color: "#555", textTransform: "capitalize" },
  listaTurno: { fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 6, marginTop: 2 },
  listaEmpleados: { display: "flex", flexWrap: "wrap", gap: 5, flex: 1 },
};
