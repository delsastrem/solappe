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

  // ── PASO 1: identificar pares mutuos entre los "ambas" ──────────────────────
  // Si A y B se eligieron mutuamente y ambos tienen "ambas", los tratamos como
  // una unidad: los metemos juntos antes de procesar al resto individualmente.
  const ambosOrdenados = [...ambos].sort((a, b) => {
    const da = historialDescartes[a.empleadoId] || 0;
    const db = historialDescartes[b.empleadoId] || 0;
    return da - db;
  });

  const yaAsignadosPorPar = new Set(); // uids procesados como parte de un par

  for (const emp of ambosOrdenados) {
    if (yaAsignadosPorPar.has(emp.empleadoId)) continue;
    const prefId = emp.companeroPreferidoId;
    // ¿tiene compañero preferido mutuo que también está en "ambas"?
    const empB = prefId ? ambos.find(e => e.empleadoId === prefId && e.companeroPreferidoId === emp.empleadoId) : null;

    if (empB && !yaAsignadosPorPar.has(empB.empleadoId)) {
      // Par mutuo dentro de "ambas": meterlos juntos a la quincena con menos gente
      const preferirQ1 = asignadosQ1.length <= asignadosQ2.length;
      if (preferirQ1 && asignadosQ1.length + 2 <= MAX_POR_QUINCENA) {
        asignadosQ1.push({ ...emp, preferencia: "q1" });
        asignadosQ1.push({ ...empB, preferencia: "q1" });
      } else if (!preferirQ1 && asignadosQ2.length + 2 <= MAX_POR_QUINCENA) {
        asignadosQ2.push({ ...emp, preferencia: "q2" });
        asignadosQ2.push({ ...empB, preferencia: "q2" });
      } else if (asignadosQ1.length + 2 <= MAX_POR_QUINCENA) {
        asignadosQ1.push({ ...emp, preferencia: "q1" });
        asignadosQ1.push({ ...empB, preferencia: "q1" });
      } else {
        asignadosQ2.push({ ...emp, preferencia: "q2" });
        asignadosQ2.push({ ...empB, preferencia: "q2" });
      }
      yaAsignadosPorPar.add(emp.empleadoId);
      yaAsignadosPorPar.add(empB.empleadoId);
    } else {
      // Sin par mutuo en "ambas": balance normal
      const esp = mapaEspecialidades[emp.empleadoId] || "SIN_ESP";
      const enQ1Esp = asignadosQ1.filter(e => (mapaEspecialidades[e.empleadoId] || "SIN_ESP") === esp).length;
      const enQ2Esp = asignadosQ2.filter(e => (mapaEspecialidades[e.empleadoId] || "SIN_ESP") === esp).length;
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
  }

  // ── PASO 2: corregir pares entre quincenas fijas (q1/q2) o mixtos ────────────
  // Casos: A fija en q1, B fija en q2 (o viceversa), o uno fijo y el otro en "ambas"
  // que ya fue asignado por balance al lado equivocado.
  const paresProcesadas = new Set();
  const todosActuales = () => [...asignadosQ1, ...asignadosQ2]; // función para leer estado actual

  for (const emp of todosActuales()) {
    const idA = emp.empleadoId;
    const prefId = emp.companeroPreferidoId;
    if (!prefId) continue;
    const key = [idA, prefId].sort().join("-");
    if (paresProcesadas.has(key)) continue;
    const empB = todosActuales().find(e => e.empleadoId === prefId);
    if (!empB || empB.companeroPreferidoId !== idA) continue; // no mutuo
    paresProcesadas.add(key);

    const enQ1A = asignadosQ1.some(e => e.empleadoId === idA);
    const enQ1B = asignadosQ1.some(e => e.empleadoId === prefId);
    if (enQ1A === enQ1B) continue; // ya juntos

    // Uno en Q1, el otro en Q2. Solo se puede mover el que tiene preferencia "ambas"
    // (los de q1/q2 fija no se pueden mover sin respetar su elección).
    const aEsFlexible = !["q1", "q2"].includes(inscriptos.find(i => i.empleadoId === idA)?.preferencia);
    const bEsFlexible = !["q1", "q2"].includes(inscriptos.find(i => i.empleadoId === prefId)?.preferencia);

    if (enQ1A && !enQ1B) {
      // A en Q1, B en Q2 → intentar mover B a Q1 (si B es flexible y hay espacio)
      if (bEsFlexible && asignadosQ1.length < MAX_POR_QUINCENA) {
        const idx = asignadosQ2.findIndex(e => e.empleadoId === prefId);
        if (idx !== -1) { asignadosQ2.splice(idx, 1); asignadosQ1.push({ ...empB, preferencia: "q1" }); }
      } else if (aEsFlexible && asignadosQ2.length < MAX_POR_QUINCENA) {
        // mover A a Q2 en su lugar
        const idx = asignadosQ1.findIndex(e => e.empleadoId === idA);
        if (idx !== -1) { asignadosQ1.splice(idx, 1); asignadosQ2.push({ ...emp, preferencia: "q2" }); }
      }
    } else {
      // B en Q1, A en Q2 → intentar mover A a Q1
      if (aEsFlexible && asignadosQ1.length < MAX_POR_QUINCENA) {
        const idx = asignadosQ2.findIndex(e => e.empleadoId === idA);
        if (idx !== -1) { asignadosQ2.splice(idx, 1); asignadosQ1.push({ ...emp, preferencia: "q1" }); }
      } else if (bEsFlexible && asignadosQ2.length < MAX_POR_QUINCENA) {
        const idx = asignadosQ1.findIndex(e => e.empleadoId === prefId);
        if (idx !== -1) { asignadosQ1.splice(idx, 1); asignadosQ2.push({ ...empB, preferencia: "q2" }); }
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

  // Detectar pares mutuos dentro de este grupo de seleccionados
  // uid -> uid del compañero si el par es mutuo, sino null
  const pareja = {};
  seleccionados.forEach(e => {
    const prefId = e.companeroPreferidoId;
    if (!prefId) return;
    const otro = seleccionados.find(x => x.empleadoId === prefId);
    if (otro && otro.companeroPreferidoId === e.empleadoId) {
      pareja[e.empleadoId] = prefId;
    }
  });

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

        // 3er criterio: menos días acumulados históricamente
        const histA = historialAsignaciones[a.empleadoId] || 0;
        const histB = historialAsignaciones[b.empleadoId] || 0;
        return histA - histB;
      });

      // Seleccionar los `req` primeros, pero respetando pares:
      // si entra uno del par, intentar meter también al compañero
      const seleccionadosDia = [];
      const yaIncluido = new Set();

      for (const emp of ordenados) {
        if (yaIncluido.has(emp.empleadoId)) continue;
        if (seleccionadosDia.length >= req) break;

        const compId = pareja[emp.empleadoId];
        if (compId && !yaIncluido.has(compId) && seleccionadosDia.length + 1 < req) {
          // Hay lugar para los dos: meterlos juntos
          seleccionadosDia.push(emp);
          yaIncluido.add(emp.empleadoId);
          const compObj = seleccionados.find(x => x.empleadoId === compId);
          if (compObj) {
            seleccionadosDia.push(compObj);
            yaIncluido.add(compId);
          }
        } else {
          // Sin par o no hay lugar para el par completo: entrada individual
          seleccionadosDia.push(emp);
          yaIncluido.add(emp.empleadoId);
        }
      }

      seleccionadosDia.forEach(e => {
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