const CICLO = [
  { turno: "mañana" },
  { turno: "mañana" },
  { turno: "mañana" },
  { turno: "franco" },
  { turno: "franco" },
  { turno: "noche" },
  { turno: "noche" },
  { turno: "noche" },
  { turno: "franco" },
  { turno: "franco" },
  { turno: "tarde" },
  { turno: "tarde" },
  { turno: "tarde" },
  { turno: "franco" },
  { turno: "franco" },
];

// 1ro de abril 2026 = día 0 del ciclo
const INICIO_CICLO = new Date(2026, 3, 1);

export function getTurnoParaDia(fecha) {
  const diff = Math.floor((fecha - INICIO_CICLO) / (1000 * 60 * 60 * 24));
  const diaCiclo = ((diff % 15) + 15) % 15;
  return CICLO[diaCiclo].turno;
}

export function getDiasQuincena(anio, mes, quincena) {
  const dias = [];
  const inicio = quincena === 1 ? 1 : 16;
  const fin = quincena === 1 ? 15 : new Date(anio, mes, 0).getDate();
  for (let d = inicio; d <= fin; d++) {
    const fecha = new Date(anio, mes - 1, d);
    const turno = getTurnoParaDia(fecha);
    if (turno !== "franco") {
      dias.push({ fecha, turno, label: `${d}/${mes}` });
    }
  }
  return dias;
}

export function getRequerimiento(turno) {
  return turno === "tarde" ? 3 : 4;
}

export function distribuir(inscriptos, anio, mes, quincena, historialDescartes) {
  const MAX_POR_QUINCENA = 10;

  // Separar por preferencia
  const soloEsta = inscriptos.filter(e =>
    e.preferencia === `q${quincena}`
  );
  const ambos = inscriptos.filter(e => e.preferencia === "ambas");
  const pool = [...soloEsta, ...ambos];

  // Seleccionar hasta MAX con descarte justo
  let seleccionados = [];
  let descartados = [];

  if (pool.length <= MAX_POR_QUINCENA) {
    seleccionados = pool;
  } else {
    const sorted = [...pool].sort((a, b) => {
      const da = historialDescartes[a.empleadoId] || 0;
      const db = historialDescartes[b.empleadoId] || 0;
      return da - db;
    });
    seleccionados = sorted.slice(0, MAX_POR_QUINCENA);
    descartados = sorted.slice(MAX_POR_QUINCENA);
  }

  // Obtener días laborables de la quincena
  const dias = getDiasQuincena(anio, mes, quincena);

  // Inicializar asignaciones
  const asignaciones = {};
  seleccionados.forEach(e => { asignaciones[e.empleadoId] = []; });

  // Agrupar días por turno
  const diasPorTurno = { mañana: [], noche: [], tarde: [] };
  dias.forEach(d => {
    if (diasPorTurno[d.turno]) diasPorTurno[d.turno].push(d);
  });

  // Para cada día de cada turno, asignar los N empleados requeridos
  // priorizando quien tiene menos asignaciones totales y menos de ese turno
  Object.entries(diasPorTurno).forEach(([turno, diasTurno]) => {
    const req = getRequerimiento(turno);
    diasTurno.forEach(dia => {
      const ordenados = [...seleccionados].sort((a, b) => {
        const totalA = asignaciones[a.empleadoId].length;
        const totalB = asignaciones[b.empleadoId].length;
        if (totalA !== totalB) return totalA - totalB;
        const turnoA = asignaciones[a.empleadoId].filter(x => x.turno === turno).length;
        const turnoB = asignaciones[b.empleadoId].filter(x => x.turno === turno).length;
        return turnoA - turnoB;
      });
      ordenados.slice(0, req).forEach(e => {
        asignaciones[e.empleadoId].push({
          fecha: dia.fecha.toISOString(),
          turno,
          label: dia.label,
        });
      });
    });
  });

  return { asignaciones, descartados, seleccionados };
}