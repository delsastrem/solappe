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

const INICIO_CICLO = new Date(2026, 3, 1); // 1ro de abril 2026

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

// Función principal que balancea AMBAS quincenas juntas antes de distribuir
export function distribuirAmbasQuincenas(inscriptos, anio, mes, historialDescartes) {
  const MAX_POR_QUINCENA = 10;

  const soloQ1 = inscriptos.filter(e => e.preferencia === "q1");
  const soloQ2 = inscriptos.filter(e => e.preferencia === "q2");
  const ambos  = inscriptos.filter(e => e.preferencia === "ambas");

  // Balancear: asignar los "ambos" para equilibrar las quincenas
  const asignadosQ1 = [...soloQ1];
  const asignadosQ2 = [...soloQ2];

  // Ordenar ambos por historial de descartes (menos descartes = más prioridad)
  const ambosOrdenados = [...ambos].sort((a, b) => {
    const da = historialDescartes[a.empleadoId] || 0;
    const db = historialDescartes[b.empleadoId] || 0;
    return da - db;
  });

  // Ir asignando uno a uno al que tenga menos gente
  for (const emp of ambosOrdenados) {
    if (asignadosQ1.length <= asignadosQ2.length) {
      asignadosQ1.push({ ...emp, preferencia: "q1" });
    } else {
      asignadosQ2.push({ ...emp, preferencia: "q2" });
    }
  }

  // Aplicar máximo y descarte justo para cada quincena
  const aplicarMaximo = (lista, historial) => {
    if (lista.length <= MAX_POR_QUINCENA) return { seleccionados: lista, descartados: [] };
    const sorted = [...lista].sort((a, b) => {
      const da = historial[a.empleadoId] || 0;
      const db = historial[b.empleadoId] || 0;
      return da - db;
    });
    return {
      seleccionados: sorted.slice(0, MAX_POR_QUINCENA),
      descartados: sorted.slice(MAX_POR_QUINCENA),
    };
  };

  const { seleccionados: selQ1, descartados: descQ1 } = aplicarMaximo(asignadosQ1, historialDescartes);
  const { seleccionados: selQ2, descartados: descQ2 } = aplicarMaximo(asignadosQ2, historialDescartes);

  return {
    q1: { seleccionados: selQ1, descartados: descQ1 },
    q2: { seleccionados: selQ2, descartados: descQ2 },
  };
}

export function distribuir(seleccionados, anio, mes, quincena) {
  const dias = getDiasQuincena(anio, mes, quincena);
  const asignaciones = {};
  seleccionados.forEach(e => { asignaciones[e.empleadoId] = []; });

  const diasPorTurno = { mañana: [], noche: [], tarde: [] };
  dias.forEach(d => {
    if (diasPorTurno[d.turno]) diasPorTurno[d.turno].push(d);
  });

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

  return asignaciones;
}