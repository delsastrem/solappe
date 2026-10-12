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

export function distribuirAmbasQuincenas(inscriptos, anio, mes, historialDescartes, mapaEspecialidades = {}) {
  const MAX_POR_QUINCENA = 10;

  const soloQ1 = inscriptos.filter(e => e.preferencia === "q1");
  const soloQ2 = inscriptos.filter(e => e.preferencia === "q2");
  const ambos = inscriptos.filter(e => e.preferencia === "ambas");

  const asignadosQ1 = [...soloQ1];
  const asignadosQ2 = [...soloQ2];

  const ambosOrdenados = [...ambos].sort((a, b) => {
    const da = historialDescartes[a.empleadoId] || 0;
    const db = historialDescartes[b.empleadoId] || 0;
    return da - db;
  });

  for (const emp of ambosOrdenados) {
    const esp = mapaEspecialidades[emp.empleadoId] || "SIN_ESP";
    const enQ1Esp = asignadosQ1.filter(e => (mapaEspecialidades[e.empleadoId] || "SIN_ESP") === esp).length;
    const enQ2Esp = asignadosQ2.filter(e => (mapaEspecialidades[e.empleadoId] || "SIN_ESP") === esp).length;

    // Criterio principal: balance TOTAL entre quincenas (no solo por especialidad)
    // Criterio secundario: balance por especialidad como desempate
    let preferirQ1;
    if (asignadosQ1.length !== asignadosQ2.length) {
      preferirQ1 = asignadosQ1.length < asignadosQ2.length;
    } else if (enQ1Esp !== enQ2Esp) {
      preferirQ1 = enQ1Esp < enQ2Esp;
    } else {
      preferirQ1 = true;
    }

    if (preferirQ1) {
      asignadosQ1.push({ ...emp, preferencia: "q1" });
    } else {
      asignadosQ2.push({ ...emp, preferencia: "q2" });
    }
  }

  // Compañero preferido: si dos personas se eligieron mutuamente,
  // intentamos moverlas a la misma quincena sin superar MAX_POR_QUINCENA.
  const todosAsignados = [...asignadosQ1, ...asignadosQ2];
  const paresProcesadas = new Set();
  for (const emp of todosAsignados) {
    const idA = emp.empleadoId;
    const prefId = emp.companeroPreferidoId;
    if (!prefId || paresProcesadas.has(`${idA}-${prefId}`) || paresProcesadas.has(`${prefId}-${idA}`)) continue;
    const empB = todosAsignados.find(e => e.empleadoId === prefId);
    if (!empB || empB.companeroPreferidoId !== idA) continue; // no es mutuo
    paresProcesadas.add(`${idA}-${prefId}`);
    const enQ1A = asignadosQ1.some(e => e.empleadoId === idA);
    const enQ1B = asignadosQ1.some(e => e.empleadoId === prefId);
    if (enQ1A === enQ1B) continue; // ya están en la misma quincena
    // A está en Q1 y B en Q2 (o viceversa) — intentamos mover B a la quincena de A
    if (enQ1A && !enQ1B) {
      // mover B de Q2 a Q1 si hay espacio
      if (asignadosQ1.length < MAX_POR_QUINCENA) {
        const idx = asignadosQ2.findIndex(e => e.empleadoId === prefId);
        if (idx !== -1) {
          asignadosQ2.splice(idx, 1);
          asignadosQ1.push({ ...empB, preferencia: "q1" });
        }
      } else if (asignadosQ2.length < MAX_POR_QUINCENA) {
        // mover A de Q1 a Q2
        const idx = asignadosQ1.findIndex(e => e.empleadoId === idA);
        if (idx !== -1) {
          asignadosQ1.splice(idx, 1);
          asignadosQ2.push({ ...emp, preferencia: "q2" });
        }
      }
    } else {
      // B en Q1, A en Q2 — mover A a Q1 si hay espacio
      if (asignadosQ1.length < MAX_POR_QUINCENA) {
        const idx = asignadosQ2.findIndex(e => e.empleadoId === idA);
        if (idx !== -1) {
          asignadosQ2.splice(idx, 1);
          asignadosQ1.push({ ...emp, preferencia: "q1" });
        }
      } else if (asignadosQ2.length < MAX_POR_QUINCENA) {
        // mover B de Q1 a Q2
        const idx = asignadosQ1.findIndex(e => e.empleadoId === prefId);
        if (idx !== -1) {
          asignadosQ1.splice(idx, 1);
          asignadosQ2.push({ ...empB, preferencia: "q2" });
        }
      }
    }
  }

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

// historialAsignaciones = { uid: totalDiasHistoricos }
export function distribuir(seleccionados, anio, mes, quincena, historialAsignaciones = {}) {
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
        // 1er criterio: menos días asignados en esta quincena
        const totalA = asignaciones[a.empleadoId].length;
        const totalB = asignaciones[b.empleadoId].length;
        if (totalA !== totalB) return totalA - totalB;

        // 2do criterio: menos días de este turno en esta quincena
        const turnoA = asignaciones[a.empleadoId].filter(x => x.turno === turno).length;
        const turnoB = asignaciones[b.empleadoId].filter(x => x.turno === turno).length;
        if (turnoA !== turnoB) return turnoA - turnoB;

        // 3er criterio (nuevo): menos días acumulados históricamente
        const histA = historialAsignaciones[a.empleadoId] || 0;
        const histB = historialAsignaciones[b.empleadoId] || 0;
        return histA - histB;
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