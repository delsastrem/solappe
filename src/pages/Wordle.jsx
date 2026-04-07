import { useState, useEffect } from "react";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const PALABRAS = [
  "RADAR","FLAPS","PITCH","STALL","RADIO","PISTA","TOWER","SPEED","CLIMB","GLIDE",
  "FLARE","BRAKE","BOOST","CARGO","DELTA","OSCAR","ROMEO","TANGO","ULTRA","VAPOR",
  "KNOTS","LASER","MILLA","NODOS","PULSO","SIGMA","XENON","YAWEO","TIRES","SHOCK",
  "PROBE","OZONE","NIGHT","MIXER","LEVER","INLET","GAUGE","FENCE","DRAIN","CHORD",
  "BLADE","HIELO","NIEVE","TURBO","SERVO","AVION","VUELO","MOTOR","VIRAJ",
  "MORRO","NORTE","GRUES","PAUSA","BALOM","CABLE","HERTZ","IONES","JATOS","RACON",
  "TENOR","VOLTS","WATTS","WINGS","EXTRA","HATCH","ELBOW","ABAFT","AHEAD","BELOW",
  "ALTIT","UPPER","RUDDE","GRABA","ENFOK",
].map(p => p.replace(/[^A-Z]/g,'').slice(0,5)).filter(p => p.length === 5);

const PALABRAS_LIMPIAS = [...new Set(PALABRAS)];

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}
function getMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}`;
}
function getPalabraDelDia() {
  const key = getTodayKey();
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) & 0xffffffff;
  return PALABRAS_LIMPIAS[Math.abs(hash) % PALABRAS_LIMPIAS.length];
}

const MAX_INTENTOS = 6;
const COLORES = { correct: "#1D9E75", present: "#BA7517", absent: "#888" };

export default function Wordle() {
  const user = auth.currentUser;
  const PALABRA = getPalabraDelDia();

  const [intentos, setIntentos] = useState([]);
  const [intentoActual, setIntentoActual] = useState("");
  const [juegoTerminado, setJuegoTerminado] = useState(false);
  const [gano, setGano] = useState(false);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState("juego");
  const [rankingDiario, setRankingDiario] = useState(null);
  const [rankingMensual, setRankingMensual] = useState(null);
  const [cargado, setCargado] = useState(false);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    iniciar();
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (tab !== "juego" || juegoTerminado) return;
      const k = e.key.toUpperCase();
      if (k === "BACKSPACE") handleKey("DEL");
      else if (k === "ENTER") handleKey("ENTER");
      else if (/^[A-Z]$/.test(k)) handleKey(k);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tab, juegoTerminado, intentoActual, intentos]);

  const iniciar = async () => {
    // 1. Leer nombre del empleado desde Firestore
    let nombre = "Anónimo";
    if (user) {
      try {
        const snap = await getDoc(doc(db, "empleados", user.uid));
        if (snap.exists()) {
          const data = snap.data();
          nombre = `${data.apellido}, ${data.nombre}`;
        }
      } catch (e) {
        console.error("Error leyendo empleado:", e);
      }
    }
    setUserName(nombre);

    // 2. Recuperar estado del día desde localStorage
    const estadoGuardado = localStorage.getItem("wordle_estado_" + getTodayKey());
    if (estadoGuardado) {
      const estado = JSON.parse(estadoGuardado);
      setIntentos(estado.intentos);
      setJuegoTerminado(true);
      setGano(estado.gano);
    }
    setCargado(true);
  };

  const evaluar = (intento, palabra) => {
    const res = Array(5).fill(null).map((_, i) => ({ letra: intento[i], estado: "absent" }));
    const disponibles = palabra.split("");
    for (let i = 0; i < 5; i++) {
      if (intento[i] === palabra[i]) { res[i].estado = "correct"; disponibles[i] = null; }
    }
    for (let i = 0; i < 5; i++) {
      if (res[i].estado === "correct") continue;
      const idx = disponibles.indexOf(intento[i]);
      if (idx !== -1) { res[i].estado = "present"; disponibles[idx] = null; }
    }
    return res;
  };

  const handleKey = (k) => {
    if (juegoTerminado) return;
    if (k === "DEL") {
      setIntentoActual(prev => prev.slice(0, -1));
    } else if (k === "ENTER") {
      enviar();
    } else if (/^[A-Z]$/.test(k) && intentoActual.length < 5) {
      setIntentoActual(prev => prev + k);
    }
  };

  const enviar = async () => {
    if (intentoActual.length !== 5) { setMsg("Escribí 5 letras"); return; }
    const resultado = evaluar(intentoActual, PALABRA);
    const nuevosIntentos = [...intentos, resultado];
    setIntentos(nuevosIntentos);
    setIntentoActual("");
    setMsg("");

    const gano = resultado.every(r => r.estado === "correct");
    if (gano || nuevosIntentos.length >= MAX_INTENTOS) {
      setJuegoTerminado(true);
      setGano(gano);
      await guardarResultado(nuevosIntentos, gano);
    }
  };

  const guardarResultado = async (intentosFinal, gano) => {
    // Guardar estado local para no repetir hoy
    localStorage.setItem("wordle_estado_" + getTodayKey(), JSON.stringify({ intentos: intentosFinal, gano }));

    const nombre = userName;
    const uid = user?.uid || "anonimo";

    // --- Ranking diario en Firestore ---
    // Documento: wordleRanking/{fecha}
    // Campo: jugadores[uid] = { nombre, intentos, gano, ts }
    try {
      const refDiario = doc(db, "wordleRanking", getTodayKey());
      const snapDiario = await getDoc(refDiario);
      const jugadores = snapDiario.exists() ? (snapDiario.data().jugadores || {}) : {};
      jugadores[uid] = { nombre, intentos: intentosFinal.length, gano, ts: Date.now() };
      await setDoc(refDiario, { jugadores }, { merge: true });
    } catch (e) {
      console.error("Error guardando ranking diario:", e);
    }

    // --- Ranking mensual en Firestore ---
    // Documento: wordleRankingMensual/{año-mes}
    // Campo: jugadores[uid] = { nombre, victorias, totalIntentos, partidas }
    try {
      const refMensual = doc(db, "wordleRankingMensual", getMonthKey());
      const snapMensual = await getDoc(refMensual);
      const jugadores = snapMensual.exists() ? (snapMensual.data().jugadores || {}) : {};
      if (!jugadores[uid]) jugadores[uid] = { nombre, victorias: 0, totalIntentos: 0, partidas: 0 };
      // Actualizar nombre por si cambió
      jugadores[uid].nombre = nombre;
      jugadores[uid].partidas++;
      if (gano) {
        jugadores[uid].victorias++;
        jugadores[uid].totalIntentos += intentosFinal.length;
      }
      await setDoc(refMensual, { jugadores }, { merge: true });
    } catch (e) {
      console.error("Error guardando ranking mensual:", e);
    }
  };

  const cargarRankings = async () => {
    // Ranking diario
    try {
      const snapDiario = await getDoc(doc(db, "wordleRanking", getTodayKey()));
      const jugadores = snapDiario.exists() ? Object.values(snapDiario.data().jugadores || {}) : [];
      const listaDiaria = jugadores.sort((a, b) =>
        a.gano === b.gano ? a.intentos - b.intentos : (b.gano ? 1 : -1)
      );
      setRankingDiario(listaDiaria);
    } catch (e) {
      setRankingDiario([]);
    }

    // Ranking mensual
    try {
      const snapMensual = await getDoc(doc(db, "wordleRankingMensual", getMonthKey()));
      const jugadores = snapMensual.exists() ? Object.values(snapMensual.data().jugadores || {}) : [];
      const listaMensual = jugadores.sort((a, b) =>
        b.victorias !== a.victorias ? b.victorias - a.victorias
          : (a.victorias > 0 ? a.totalIntentos / a.victorias : 99) - (b.victorias > 0 ? b.totalIntentos / b.victorias : 99)
      );
      setRankingMensual(listaMensual);
    } catch (e) {
      setRankingMensual([]);
    }
  };

  const estadosLetras = {};
  intentos.forEach(intento => {
    intento.forEach(({ letra, estado }) => {
      if (!estadosLetras[letra] || estado === "correct" || (estado === "present" && estadosLetras[letra] === "absent")) {
        estadosLetras[letra] = estado;
      }
    });
  });

  const filasTeclado = [
    ["Q","W","E","R","T","Y","U","I","O","P"],
    ["A","S","D","F","G","H","J","K","L"],
    ["ENTER","Z","X","C","V","B","N","M","DEL"],
  ];

  const ahora = new Date();
  const nombreMes = ahora.toLocaleString("es-AR", { month: "long", year: "numeric" });
  const nombreHoy = ahora.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

  if (!cargado) return null;

  // Tamaños responsivos: se achican en pantallas chicas
  const celdaSize = "clamp(38px, 11vw, 52px)";
  const celdaFont = "clamp(15px, 4vw, 20px)";
  const teclaMin = "clamp(24px, 7.5vw, 34px)";
  const teclaEsp = "clamp(38px, 11vw, 52px)";
  const teclaH = "clamp(34px, 9vw, 42px)";
  const teclaFont = "clamp(10px, 3vw, 14px)";
  const teclaFontEsp = "clamp(9px, 2.5vw, 11px)";

  return (
    <div style={{ padding: "16px 8px", maxWidth: 420, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: "#1a1a2e" }}>AeroWordle</span>
      </div>
      <div style={{ textAlign: "center", fontSize: 12, color: "#999", marginBottom: 16, textTransform: "capitalize" }}>{nombreHoy}</div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 20 }}>
        {[["juego","Juego"],["diario","Ranking diario"],["mensual","Ranking mensual"]].map(([k, label]) => (
          <button key={k} style={{
            padding: "6px 10px", borderRadius: 8, fontSize: 12, cursor: "pointer",
            background: tab === k ? "#1a1a2e" : "white",
            color: tab === k ? "white" : "#666",
            border: `1px solid ${tab === k ? "#1a1a2e" : "#ddd"}`,
            fontWeight: tab === k ? 700 : 400,
          }} onClick={() => { setTab(k); if (k !== "juego") cargarRankings(); }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "juego" && (
        <>
          {/* Leyenda */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
            {[["#1D9E75","Correcta"],["#BA7517","Presente"],["#ccc","Ausente"]].map(([c, l]) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#666" }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: c }} />
                {l}
              </div>
            ))}
          </div>

          {/* Tablero */}
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(4px, 1.5vw, 6px)", alignItems: "center", marginBottom: 14 }}>
            {Array.from({ length: MAX_INTENTOS }).map((_, i) => (
              <div key={i} style={{ display: "flex", gap: "clamp(4px, 1.5vw, 6px)" }}>
                {Array.from({ length: 5 }).map((_, j) => {
                  let letra = "", estado = "";
                  if (i < intentos.length) { letra = intentos[i][j].letra; estado = intentos[i][j].estado; }
                  else if (i === intentos.length && !juegoTerminado) { letra = intentoActual[j] || ""; }
                  const bg = estado === "correct" ? COLORES.correct : estado === "present" ? COLORES.present : estado === "absent" ? "#e0e0e0" : "white";
                  const color = estado ? "white" : "#1a1a2e";
                  const border = estado ? "none" : letra ? "1px solid #1a1a2e" : "1px solid #ddd";
                  return (
                    <div key={j} style={{
                      width: celdaSize, height: celdaSize,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: celdaFont, fontWeight: 700, borderRadius: 8,
                      background: bg, color, border, textTransform: "uppercase",
                    }}>
                      {letra}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Mensaje */}
          {msg && <div style={{ textAlign: "center", fontSize: 14, color: "#e74c3c", marginBottom: 8 }}>{msg}</div>}

          {/* Resultado */}
          {juegoTerminado && (
            <div style={{ textAlign: "center", padding: "10px 0", marginBottom: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: gano ? "#1D9E75" : "#e74c3c", marginBottom: 4 }}>
                {gano ? `Ganaste en ${intentos.length} intento${intentos.length > 1 ? "s" : ""}!` : "No fue esta vez"}
              </div>
              <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>La palabra era</div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 4, color: "#1a1a2e", marginBottom: 6 }}>{PALABRA}</div>
              <div style={{ fontSize: 12, color: "#aaa" }}>Volvé mañana para una nueva palabra</div>
            </div>
          )}

          {/* Teclado */}
          {!juegoTerminado && (
            <div style={{ display: "flex", flexDirection: "column", gap: "clamp(4px, 1.5vw, 6px)", alignItems: "center" }}>
              {filasTeclado.map((fila, fi) => (
                <div key={fi} style={{ display: "flex", gap: "clamp(3px, 1vw, 5px)" }}>
                  {fila.map(k => {
                    const est = estadosLetras[k];
                    const bg = est === "correct" ? COLORES.correct : est === "present" ? COLORES.present : est === "absent" ? "#ccc" : "#e9ecef";
                    const color = est ? "white" : "#1a1a2e";
                    const esEspecial = k.length > 1;
                    return (
                      <button key={k} onClick={() => handleKey(k)} style={{
                        minWidth: esEspecial ? teclaEsp : teclaMin,
                        height: teclaH,
                        borderRadius: 6, border: "none", background: bg, color,
                        fontSize: esEspecial ? teclaFontEsp : teclaFont,
                        fontWeight: 600, cursor: "pointer",
                        padding: 0,
                      }}>
                        {k}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "diario" && (
        <div>
          <div style={{ fontSize: 12, color: "#999", marginBottom: 12, textAlign: "center" }}>Hoy — {nombreHoy}</div>
          {!rankingDiario ? (
            <div style={{ textAlign: "center", color: "#999", fontSize: 14, padding: 24 }}>Cargando...</div>
          ) : rankingDiario.length === 0 ? (
            <div style={{ textAlign: "center", color: "#999", fontSize: 14, padding: 24 }}>Nadie jugó hoy todavía</div>
          ) : rankingDiario.map((j, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              borderRadius: 10, border: "1px solid #eee", marginBottom: 8, background: "white",
            }}>
              <span style={{ fontWeight: 700, color: "#999", minWidth: 20 }}>{i + 1}</span>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{j.nombre}</span>
              <span style={{ fontSize: 13, color: j.gano ? "#1D9E75" : "#e74c3c", fontWeight: 600 }}>
                {j.gano ? `${j.intentos} int.` : "no ganó"}
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === "mensual" && (
        <div>
          <div style={{ fontSize: 12, color: "#999", marginBottom: 12, textAlign: "center", textTransform: "capitalize" }}>{nombreMes}</div>
          {!rankingMensual ? (
            <div style={{ textAlign: "center", color: "#999", fontSize: 14, padding: 24 }}>Cargando...</div>
          ) : rankingMensual.length === 0 ? (
            <div style={{ textAlign: "center", color: "#999", fontSize: 14, padding: 24 }}>Sin datos este mes</div>
          ) : rankingMensual.map((j, i) => {
            const avg = j.victorias > 0 ? (j.totalIntentos / j.victorias).toFixed(1) : "-";
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                borderRadius: 10, border: "1px solid #eee", marginBottom: 8, background: "white",
              }}>
                <span style={{ fontWeight: 700, color: "#999", minWidth: 20 }}>{i + 1}</span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{j.nombre}</span>
                <span style={{ fontSize: 12, color: "#666" }}>{j.victorias}V / {j.partidas}J · prom {avg}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}