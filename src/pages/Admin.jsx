import { useState, useEffect, useRef } from "react";
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { auth, db, authSecundaria } from "../firebase";
import {
  collection, getDocs, deleteDoc, doc, setDoc, getDoc, updateDoc
} from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { distribuir, distribuirAmbasQuincenas, getTurnoParaDia } from "../utils/distribucion";
import Calendario from "./Calendario";
import Wordle from "./Wordle";
import { enviarAviso, marcarLeido, suscribirAvisos } from "../utils/avisos";
import { guardarCoordinador, quitarCoordinador, getCoordinadoresMes, getResumenCoordinadores } from "../utils/coordinadores";

const ESPECIALIDADES = ["MONTAJE", "AVIONICA", "MOTORES", "RADIO", "SCO"];

export default function Admin() {
  const [empleados, setEmpleados] = useState([]);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [especialidadNuevo, setEspecialidadNuevo] = useState("");
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
  const [resumenMeses, setResumenMeses] = useState([]);
  const [mesResumenSeleccionado, setMesResumenSeleccionado] = useState(null);
  const [solicitudesPendientes, setSolicitudesPendientes] = useState([]);
  // Cambios agrupados por mes
  const [cambiosPorMes, setCambiosPorMes] = useState([]);
  const [mesCambioSeleccionado, setMesCambioSeleccionado] = useState(null);
  const [visiblesPorMes, setVisiblesPorMes] = useState({});
  const [procesando, setProcesando] = useState(null);
  const [diasAsistencia, setDiasAsistencia] = useState([]);
  const [asistencias, setAsistencias] = useState({});
  const [reemplazante, setReemplazante] = useState({});
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [ratios, setRatios] = useState({});
  const [ratioPropio, setRatioPropio] = useState(null);
  const [editandoEsp, setEditandoEsp] = useState(null);

  // Coordinadores
  const [coordMes, setCoordMes] = useState(new Date().getMonth() + 1);
  const [coordAnio, setCoordAnio] = useState(new Date().getFullYear());
  const [coordinadoresMes, setCoordinadoresMes] = useState({});
  const [resumenCoord, setResumenCoord] = useState({});
  const [tipoCoord, setTipoCoord] = useState("admin");
  const [adminCoordSel, setAdminCoordSel] = useState("");
  const [espCoordSel, setEspCoordSel] = useState("MONTAJE");
  const [diaCoordSel, setDiaCoordSel] = useState("");
  const [guardandoCoord, setGuardandoCoord] = useState(false);
  const [mensajeCoord, setMensajeCoord] = useState("");
  const [coordinadoresAsistencia, setCoordinadoresAsistencia] = useState({});

  // Notificaciones
  const [notificaciones, setNotificaciones] = useState([]);
  const [campanaAbierta, setCampanaAbierta] = useState(false);
  const [textoAviso, setTextoAviso] = useState("");
  const [enviandoAviso, setEnviandoAviso] = useState(false);
  const [mensajeAviso, setMensajeAviso] = useState("");
  const campanaRef = useRef(null);

  const user = auth.currentUser;
  const ahora = new Date();
  const mes = ahora.getMonth() + 1;
  const anio = ahora.getFullYear();
  const mesProximo = mes === 12 ? 1 : mes + 1;
  const anioProximo = mes === 12 ? anio + 1 : anio;
  const nombreMes = new Date(anioProximo, mesProximo - 1, 1)
    .toLocaleString("es-AR", { month: "long" });

  const noLeidas = notificaciones.filter(n => !n.leidoPor?.includes(user?.uid));

  useEffect(() => {
    const handleResize = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (campanaRef.current && !campanaRef.current.contains(e.target)) {
        setCampanaAbierta(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    cargarEmpleados();
    cargarEstadoInscripcion();
    cargarInscripciones();
    cargarEmpleadoActual();
    cargarSolicitudes();
    if (user) {
      const unsub = suscribirAvisos(user.uid, setNotificaciones);
      return () => unsub();
    }
  }, []);

  useEffect(() => {
    if (seccion === "resumen") cargarResumen();
    if (seccion === "cambios") cargarCambios();
    if (seccion === "asistencia") cargarAsistencia();
    if (seccion === "empleados") cargarRatios();
    if (seccion === "cuenta") cargarRatioPropio();
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

  const cargarRatios = async () => {
    const snapAsig = await getDocs(collection(db, "asignaciones"));
    const asignados = {};
    snapAsig.docs.forEach(d => {
      const data = d.data();
      if (!asignados[data.empleadoId]) asignados[data.empleadoId] = 0;
      asignados[data.empleadoId] += data.dias.length;
    });
    const snapAsis = await getDocs(collection(db, "asistencias"));
    const confirmados = {};
    snapAsis.docs.forEach(d => {
      const data = d.data();
      if (data.confirmado) {
        if (!confirmados[data.empleadoId]) confirmados[data.empleadoId] = 0;
        confirmados[data.empleadoId]++;
      }
    });
    const mapa = {};
    empleados.forEach(e => {
      mapa[e.id] = {
        asignados: asignados[e.id] || 0,
        confirmados: confirmados[e.id] || 0,
      };
    });
    setRatios(mapa);
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

  const cargarSolicitudes = async () => {
    if (!user) return;
    const snap = await getDocs(collection(db, "solicitudesCambio"));
    const todas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setSolicitudesPendientes(todas.filter(s => s.receptorId === user.uid && s.estado === "pendiente"));
  };

  // Cargar historial agrupado por mes
  const cargarCambios = async () => {
    const snap = await getDocs(collection(db, "solicitudesCambio"));
    const todas = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => s.estado !== "pendiente")
      .sort((a, b) => new Date(b.respondidoEn) - new Date(a.respondidoEn));

    // Agrupar por mes/año usando respondidoEn
    const porMes = {};
    todas.forEach(s => {
      const a = s.anioOrigen || new Date(s.respondidoEn).getFullYear();
      const m = s.mesOrigen || (new Date(s.respondidoEn).getMonth() + 1);
      const key = `${a}-${m}`;
      if (!porMes[key]) {
        const label = new Date(a, m - 1, 1).toLocaleString("es-AR", { month: "long", year: "numeric" });
        porMes[key] = { key, label, anio: a, mes: m, items: [] };
      }
      porMes[key].items.push(s);
    });

    const meses = Object.values(porMes).sort((a, b) => {
      if (a.anio !== b.anio) return b.anio - a.anio;
      return b.mes - a.mes;
    });

    setCambiosPorMes(meses);

    // Seleccionar el mes más reciente por defecto
    if (meses.length > 0) {
      setMesCambioSeleccionado(prev => prev || meses[0].key);
    }

    // Inicializar visibles en 5 por mes
    const init = {};
    meses.forEach(m => { init[m.key] = 5; });
    setVisiblesPorMes(init);
  };

  const cargarResumen = async () => {
    const snapAsig = await getDocs(collection(db, "asignaciones"));
    const snapAsis = await getDocs(collection(db, "asistencias"));
    const mapaEmp = {};
    empleados.forEach(e => { mapaEmp[e.id] = e; });

    const asistenciasMap = {};
    snapAsis.docs.forEach(d => {
      const data = d.data();
      if (data.confirmado && !data.esReemplazante) {
        if (!asistenciasMap[data.empleadoId]) asistenciasMap[data.empleadoId] = new Set();
        asistenciasMap[data.empleadoId].add(data.diaKey);
      }
    });

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
      const nombreMesLabel = new Date(a, m - 1, 1)
        .toLocaleString("es-AR", { month: "long", year: "numeric" });

      const mapear = (quincena) => {
        return docs
          .filter(d => d.quincena === quincena)
          .map(d => {
            const emp = mapaEmp[d.empleadoId];
            const diasOriginales = d.dias.length;
            const confirmados = d.dias.filter(dia => {
              const fechaDia = new Date(dia.fecha);
              const diaNum = fechaDia.getDate();
              const mesNum = fechaDia.getMonth() + 1;
              const anioNum = fechaDia.getFullYear();
              const diaKey = `${anioNum}-${mesNum}-${diaNum}`;
              return asistenciasMap[d.empleadoId]?.has(diaKey);
            }).length;
            const mesYaPaso = a < anio || (a === anio && m < mes);
            return {
              nombre: emp ? `${emp.apellido}, ${emp.nombre}` : d.empleadoId,
              dias: diasOriginales,
              confirmados: mesYaPaso ? confirmados : null,
              detalle: d.dias,
              empleadoId: d.empleadoId,
            };
          })
          .sort((a, b) => a.nombre.localeCompare(b.nombre));
      };

      return {
        key: `${a}-${m}`,
        label: nombreMesLabel,
        anio: a,
        mes: m,
        esFuturo: a > anio || (a === anio && m > mes),
        q1: mapear(1),
        q2: mapear(2),
      };
    });

    setResumenMeses(resultado);
    if (resultado.length > 0 && !mesResumenSeleccionado) {
      setMesResumenSeleccionado(resultado[0].key);
    }
  };

  const cargarAsistencia = async () => {
    const dias = [];
    for (let i = 0; i < 3; i++) {
      const fecha = new Date(ahora);
      fecha.setDate(ahora.getDate() - i);
      const diaNum = fecha.getDate();
      const mesNum = fecha.getMonth() + 1;
      const anioNum = fecha.getFullYear();
      const label = `${diaNum}/${mesNum}`;
      const key = `${anioNum}-${mesNum}-${diaNum}`;
      const snapAsig = await getDocs(collection(db, "asignaciones"));
      const asignados = [];
      snapAsig.docs.forEach(d => {
        const data = d.data();
        data.dias.forEach(dia => {
          const fechaDia = new Date(dia.fecha);
          if (fechaDia.getDate() === diaNum && fechaDia.getMonth() + 1 === mesNum && fechaDia.getFullYear() === anioNum) {
            asignados.push({ empleadoId: data.empleadoId, turno: dia.turno, label: dia.label });
          }
        });
      });
      dias.push({ fecha, diaNum, mesNum, anioNum, label, key, asignados });
    }
    setDiasAsistencia(dias);
    setDiaSeleccionado(dias[0]?.key);
    const snapAsis = await getDocs(collection(db, "asistencias"));
    const mapaAsis = {};
    snapAsis.docs.forEach(d => { mapaAsis[d.id] = d.data(); });
    setAsistencias(mapaAsis);


  };

  const toggleConfirmado = async (diaKey, empleadoId) => {
    const docId = `${diaKey}_${empleadoId}`;
    const actual = asistencias[docId];
    if (actual?.confirmado) {
      await deleteDoc(doc(db, "asistencias", docId));
      setAsistencias(prev => { const n = { ...prev }; delete n[docId]; return n; });
    } else {
      const data = { diaKey, empleadoId, confirmado: true, esReemplazante: false, creadoEn: new Date().toISOString() };
      await setDoc(doc(db, "asistencias", docId), data);
      setAsistencias(prev => ({ ...prev, [docId]: data }));
    }
  };

  const agregarReemplazante = async (diaKey, empId, turno) => {
    if (!empId) return;
    const docId = `${diaKey}_${empId}_reemplazo`;
    const data = { diaKey, empleadoId: empId, confirmado: true, esReemplazante: true, turno, creadoEn: new Date().toISOString() };
    await setDoc(doc(db, "asistencias", docId), data);
    setAsistencias(prev => ({ ...prev, [docId]: data }));
    setReemplazante(prev => ({ ...prev, [diaKey]: "" }));
  };

  const borrarReemplazante = async (diaKey, empId) => {
    const docId = `${diaKey}_${empId}_reemplazo`;
    await deleteDoc(doc(db, "asistencias", docId));
    setAsistencias(prev => { const n = { ...prev }; delete n[docId]; return n; });
  };

  const guardarEspecialidad = async (empId, especialidad) => {
    await setDoc(doc(db, "empleados", empId), { especialidad }, { merge: true });
    setEmpleados(prev => prev.map(e => e.id === empId ? { ...e, especialidad } : e));
    setEditandoEsp(null);
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
      cargarCambios();
    } catch (err) {
      alert("Error: " + err.message);
    }
    setProcesando(null);
  };

  const ejecutarDistribucion = async () => {
    if (!confirm(`¿Ejecutar la distribución para ${nombreMes} ${anioProximo}?`)) return;
    setDistribuyendo(true);
    setMensajeDistribucion("");
    try {
      const snapEmps = await getDocs(collection(db, "empleados"));
      const historial = {};
      const mapaEspecialidades = {};
      snapEmps.docs.forEach(d => {
        historial[d.id] = d.data().historialDescartes || 0;
        if (d.data().especialidad) mapaEspecialidades[d.id] = d.data().especialidad;
      });
      const snapInsc = await getDocs(collection(db, "inscripciones"));
      const inscriptos = snapInsc.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(i => i.mes === mesProximo && i.anio === anioProximo);
      const snapAsigTodas = await getDocs(collection(db, "asignaciones"));
      const historialAsignaciones = {};
      snapAsigTodas.docs.forEach(d => {
        const data = d.data();
        if (data.mes === mesProximo && data.anio === anioProximo) return;
        if (!historialAsignaciones[data.empleadoId]) historialAsignaciones[data.empleadoId] = 0;
        historialAsignaciones[data.empleadoId] += data.dias.length;
      });
      const borrar = snapAsigTodas.docs.filter(d => {
        const data = d.data();
        return data.mes === mesProximo && data.anio === anioProximo;
      });
      for (const d of borrar) await deleteDoc(doc(db, "asignaciones", d.id));
      const { q1, q2 } = distribuirAmbasQuincenas(inscriptos, anioProximo, mesProximo, historial, mapaEspecialidades);
      const inscKey = `${anioProximo}-${mesProximo}`;
      const asignacionesQ1 = distribuir(q1.seleccionados, anioProximo, mesProximo, 1, historialAsignaciones);
      for (const [empleadoId, dias] of Object.entries(asignacionesQ1)) {
        await setDoc(doc(db, "asignaciones", `${empleadoId}_${inscKey}_q1`), {
          empleadoId, mes: mesProximo, anio: anioProximo, quincena: 1, dias,
        });
      }
      const asignacionesQ2 = distribuir(q2.seleccionados, anioProximo, mesProximo, 2, historialAsignaciones);
      for (const [empleadoId, dias] of Object.entries(asignacionesQ2)) {
        await setDoc(doc(db, "asignaciones", `${empleadoId}_${inscKey}_q2`), {
          empleadoId, mes: mesProximo, anio: anioProximo, quincena: 2, dias,
        });
      }
      for (const desc of [...q1.descartados, ...q2.descartados]) {
        const actual = historial[desc.empleadoId] || 0;
        await setDoc(doc(db, "empleados", desc.empleadoId), { historialDescartes: actual + 1 }, { merge: true });
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
        especialidad: especialidadNuevo || "",
      });
      setMensaje(`✓ Empleado ${apellido}, ${nombre} creado correctamente`);
      setNombre(""); setApellido(""); setEmail(""); setPassword(""); setEspecialidadNuevo("");
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

  const cargarCoordinadoresMes = async () => {
    const mapa = await getCoordinadoresMes(coordAnio, coordMes);
    setCoordinadoresMes(mapa);
  };

  const cargarCoordinadoresAsistencia = async () => {
    const mesActual = ahora.getMonth() + 1;
    const anioActual = ahora.getFullYear();
    const mapa = await getCoordinadoresMes(anioActual, mesActual);
    setCoordinadoresAsistencia(mapa);
  };

  const cargarResumenCoord = async () => {
    const conteo = await getResumenCoordinadores();
    setResumenCoord(conteo);
  };

  const cambiarMesCoord = (delta) => {
    let m = coordMes + delta;
    let a = coordAnio;
    if (m > 12) { m = 1; a++; }
    if (m < 1) { m = 12; a--; }
    setCoordMes(m);
    setCoordAnio(a);
  };

  // Recargar cuando cambia el mes del coordinador
  useEffect(() => {
    if (seccion === "coordinadores") cargarCoordinadoresMes();
  }, [coordMes, coordAnio]);
  useEffect(() => {
    if (seccion === "coordinadores") { cargarCoordinadoresMes(); cargarResumenCoord(); }
    if (seccion === "asistencia") cargarCoordinadoresAsistencia();
  }, [seccion]);

  const handleGuardarCoordinador = async () => {
  if (!diaCoordSel) { setMensajeCoord("Seleccioná un día"); return; }
  if (tipoCoord === "admin" && !adminCoordSel) { setMensajeCoord("Seleccioná un admin"); return; }
  // Verificar que no sea día franco
  const fechaVerif = new Date(coordAnio, coordMes - 1, parseInt(diaCoordSel));
  if (getTurnoParaDia(fechaVerif) === "franco") {
    setMensajeCoord("⚠️ Los días franco no requieren coordinador");
    return;
  }
    setGuardandoCoord(true);
    setMensajeCoord("");
    try {
      const datos = tipoCoord === "admin"
        ? { tipo: "admin", adminId: adminCoordSel }
        : { tipo: "interino", especialidad: espCoordSel };
      await guardarCoordinador(coordAnio, coordMes, parseInt(diaCoordSel), datos);
      setMensajeCoord("✓ Coordinador guardado");
      setDiaCoordSel("");
      setAdminCoordSel("");
      cargarCoordinadoresMes();
      cargarResumenCoord();
      setTimeout(() => setMensajeCoord(""), 2500);
    } catch (err) {
      setMensajeCoord("Error: " + err.message);
    }
    setGuardandoCoord(false);
  };

  const handleQuitarCoordinador = async (dia) => {
    await quitarCoordinador(coordAnio, coordMes, dia);
    cargarCoordinadoresMes();
    cargarResumenCoord();
  };

  const handleEnviarAviso = async () => {
    if (!textoAviso.trim()) return;
    setEnviandoAviso(true);
    setMensajeAviso("");
    try {
      await enviarAviso(textoAviso.trim(), user.uid);
      setTextoAviso("");
      setMensajeAviso("✓ Aviso enviado a todos los usuarios");
      setTimeout(() => setMensajeAviso(""), 3000);
    } catch (err) {
      setMensajeAviso("Error al enviar: " + err.message);
    }
    setEnviandoAviso(false);
  };

  const handleAbrirCampana = async () => {
    setCampanaAbierta(prev => !prev);
    if (!campanaAbierta && user) {
      const sinLeer = notificaciones.filter(n => !n.leidoPor?.includes(user.uid));
      for (const n of sinLeer) {
        await marcarLeido(n.id, user.uid);
      }
    }
  };

  const formatFecha = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
      " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
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
    if (s === "asistencia") return "✅ Asistencia";
    if (s === "cambios") return solicitudesPendientes.length > 0
      ? `🔄 Cambios (${solicitudesPendientes.length})`
      : "🔄 Cambios";
    if (s === "coordinadores") return "⭐ Coordinadores";
    if (s === "wordle") return "🎮 Wordle";
    return "🔑 Mi cuenta";
  };

  const COLORES_TURNO = {
    mañana: { bg: "#fff8e1", text: "#856404" },
    tarde: { bg: "#e8f5e9", text: "#1e8449" },
    noche: { bg: "#e8eaf6", text: "#283593" },
  };

  const COLORES_ESP = {
    MONTAJE: { bg: "#fce4ec", text: "#880e4f" },
    AVIONICA: { bg: "#e8eaf6", text: "#283593" },
    MOTORES: { bg: "#fff3e0", text: "#e65100" },
    RADIO: { bg: "#e0f2f1", text: "#004d40" },
    SCO: { bg: "#f3e5f5", text: "#4a148c" },
  };

  const renderColumnaResumen = (lista, titulo, mesYaPaso) => (
    <div style={styles.resumenCol}>
      <div style={styles.resumenHeader}>
        <h3 style={styles.resumenTitulo}>{titulo}</h3>
        <span style={styles.resumenCount}>{lista.length} personas</span>
      </div>
      {lista.length === 0 ? (
        <p style={{ color: "#999", fontSize: 13, padding: 12 }}>Sin distribución generada</p>
      ) : (
        lista.map((emp, i) => (
          <div key={i} style={styles.resumenFila}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={styles.resumenNombre}>{emp.nombre}</div>
              {mesYaPaso && emp.confirmados !== null && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                  background: emp.confirmados === emp.dias ? "#eafaf1"
                    : emp.confirmados === 0 ? "#fdf2f2" : "#fef9e7",
                  color: emp.confirmados === emp.dias ? "#27ae60"
                    : emp.confirmados === 0 ? "#e74c3c" : "#856404",
                }}>
                  {emp.confirmados}/{emp.dias} confirmados
                </span>
              )}
            </div>
            <div style={styles.resumenDias}>
              {emp.detalle.map((d, j) => {
                const color = COLORES_TURNO[d.turno] || { bg: "#f5f5f5", text: "#333" };
                const fechaDia = new Date(d.fecha);
                const yaOcurrio = fechaDia < ahora;
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

  const mapaEmpleados = {};
  empleados.forEach(e => { mapaEmpleados[e.id] = e; });

  const renderSolicitudCard = (s, conBotones = false) => {
    const solicitante = mapaEmpleados[s.solicitanteId];
    const receptor = mapaEmpleados[s.receptorId];
    return (
      <div key={s.id} style={{
        ...styles.solicitudCard,
        borderLeft: `4px solid ${s.estado === "aceptado" ? "#27ae60" : s.estado === "rechazado" ? "#e74c3c" : "#3f51b5"}`,
      }}>
        <div style={styles.solicitudInfo}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <p style={styles.solicitudTitulo}>
              <strong>{solicitante ? `${solicitante.apellido}, ${solicitante.nombre}` : "..."}</strong>
              {" → "}
              <strong>{receptor ? `${receptor.apellido}, ${receptor.nombre}` : "..."}</strong>
            </p>
            {!conBotones && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                background: s.estado === "aceptado" ? "#eafaf1" : "#fdf2f2",
                color: s.estado === "aceptado" ? "#27ae60" : "#e74c3c",
              }}>
                {s.estado === "aceptado" ? "✓" : "✕"}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#666" }}>
            {s.labelOrigen} ({s.turnoOrigen}) ⇄ {s.labelDestino} ({s.turnoDestino})
          </div>
          {!conBotones && s.respondidoEn && (
            <p style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
              {new Date(s.respondidoEn).toLocaleDateString("es-AR")}
            </p>
          )}
        </div>
        {conBotones && (
          <div style={styles.solicitudBotones}>
            <button style={styles.botonAceptar} onClick={() => responderSolicitud(s, true)} disabled={procesando === s.id}>
              {procesando === s.id ? "..." : "✓ Aceptar"}
            </button>
            <button style={styles.botonRechazar} onClick={() => responderSolicitud(s, false)} disabled={procesando === s.id}>
              ✕ Rechazar
            </button>
          </div>
        )}
      </div>
    );
  };

  const diaActual = diasAsistencia.find(d => d.key === diaSeleccionado);
  const reemplazantesDelDia = diaActual
    ? Object.entries(asistencias)
      .filter(([k, v]) => k.startsWith(diaActual.key) && v.esReemplazante)
      .map(([k, v]) => ({ docId: k, ...v }))
    : [];

  const renderRatio = (empId) => {
    const r = ratios[empId];
    if (!r) return null;
    const color = r.asignados === 0 ? "#999"
      : r.confirmados === r.asignados ? "#27ae60"
        : r.confirmados === 0 ? "#e74c3c"
          : "#f39c12";
    return (
      <span style={{ fontSize: 12, color, fontWeight: 600, marginLeft: 8 }}>
        {r.confirmados}/{r.asignados} asistencias
      </span>
    );
  };

  const renderEspecialidad = (e) => {
    const esp = e.especialidad;
    const color = esp ? (COLORES_ESP[esp] || { bg: "#f0f2f5", text: "#666" }) : null;
    if (editandoEsp === e.id) {
      return (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
          {ESPECIALIDADES.map(op => (
            <button
              key={op}
              style={{
                padding: "3px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                background: op === esp ? "#1a1a2e" : (COLORES_ESP[op]?.bg || "#f0f2f5"),
                color: op === esp ? "white" : (COLORES_ESP[op]?.text || "#666"),
                border: `1px solid ${op === esp ? "#1a1a2e" : "#ddd"}`,
                fontWeight: op === esp ? 700 : 400,
              }}
              onClick={() => guardarEspecialidad(e.id, op)}
            >
              {op}
            </button>
          ))}
          <button
            style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, background: "white", border: "1px solid #ddd", color: "#999", cursor: "pointer" }}
            onClick={() => setEditandoEsp(null)}
          >
            ✕
          </button>
        </div>
      );
    }
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
        {esp ? (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: color.bg, color: color.text }}>
            {esp}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "#bbb" }}>Sin especialidad</span>
        )}
        <button
          style={{ fontSize: 11, color: "#3f51b5", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}
          onClick={() => setEditandoEsp(e.id)}
        >
          {esp ? "Cambiar" : "Asignar"}
        </button>
      </div>
    );
  };

  const mesSeleccionado = resumenMeses.find(m => m.key === mesResumenSeleccionado);
  const mesCambioActual = cambiosPorMes.find(m => m.key === mesCambioSeleccionado);
  const totalCambios = cambiosPorMes.reduce((acc, m) => acc + m.items.length, 0);

  return (
    <div style={styles.container}>
      {solicitudesPendientes.length > 0 && seccion !== "cambios" && (
        <div style={styles.banner} onClick={() => setSeccion("cambios")}>
          🔔 Tenés {solicitudesPendientes.length} solicitud{solicitudesPendientes.length > 1 ? "es" : ""} de cambio pendiente{solicitudesPendientes.length > 1 ? "s" : ""}. Tocá para ver.
        </div>
      )}

      <div style={styles.header}>
        <h1 style={styles.title}>solAPPe {mobile ? "" : "— Admin"}</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div ref={campanaRef} style={{ position: "relative" }}>
            <button style={styles.campanaBtn} onClick={handleAbrirCampana} title="Avisos">
              🔔
              {noLeidas.length > 0 && (
                <span style={styles.campanaBadge}>{noLeidas.length}</span>
              )}
            </button>
            {campanaAbierta && (
              <div style={styles.campanaPanel}>
                <div style={styles.campanaPanelHeader}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>🔔 Avisos</span>
                  <span style={{ fontSize: 12, color: "#999" }}>{notificaciones.length} total</span>
                </div>
                {notificaciones.length === 0 ? (
                  <div style={styles.campanaSinAvisos}>Sin avisos enviados aún</div>
                ) : (
                  <div style={styles.campanaLista}>
                    {notificaciones.map(n => {
                      const leido = n.leidoPor?.includes(user?.uid);
                      return (
                        <div key={n.id} style={{
                          ...styles.campanaItem,
                          background: leido ? "white" : "#f0f4ff",
                          borderLeft: leido ? "3px solid #eee" : "3px solid #3f51b5",
                        }}>
                          <p style={{ fontSize: 13, color: "#1a1a2e", margin: 0, lineHeight: 1.4 }}>{n.mensaje}</p>
                          <span style={{ fontSize: 11, color: "#aaa", marginTop: 4, display: "block" }}>{formatFecha(n.creadoEn)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          <button style={styles.logout} onClick={() => signOut(auth)}>
            {mobile ? "Salir" : "Cerrar sesión"}
          </button>
        </div>
      </div>

      <div style={styles.tabs}>
        {["empleados", "inscripciones", "resumen", "calendario", "asistencia", "coordinadores", "cambios", "wordle", "cuenta"].map(s => (
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

        {seccion === "empleados" && (
          <>
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Agregar empleado</h2>
              <div style={{ ...styles.grid, gridTemplateColumns: mobile ? "1fr" : "1fr 1fr" }}>
                <input style={styles.input} placeholder="Nombre" value={nombre} onChange={e => setNombre(e.target.value)} />
                <input style={styles.input} placeholder="Apellido" value={apellido} onChange={e => setApellido(e.target.value)} />
                <input style={styles.input} placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
                <input style={styles.input} placeholder="Contraseña inicial" type="password" value={password} onChange={e => setPassword(e.target.value)} />
                <select style={styles.input} value={especialidadNuevo} onChange={e => setEspecialidadNuevo(e.target.value)}>
                  <option value="">Especialidad (opcional)</option>
                  {ESPECIALIDADES.map(op => <option key={op} value={op}>{op}</option>)}
                </select>
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
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
                      <span style={styles.empleadoNombre}>{e.apellido}, {e.nombre}</span>
                      {e.esAdmin && <span style={styles.badgeAdmin}>ADMIN</span>}
                      {renderRatio(e.id)}
                    </div>
                    <div style={styles.empleadoEmail}>{e.email}</div>
                    {renderEspecialidad(e)}
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

            {/* ── SECCIÓN AVISOS ── */}
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>📢 Enviar aviso a todos</h2>
              <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
                El aviso le llega como notificación a todos los usuarios de la app (empleados y admins).
              </p>
              <textarea
                style={{ ...styles.input, minHeight: 80, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
                placeholder="Escribí el aviso acá..."
                value={textoAviso}
                onChange={e => setTextoAviso(e.target.value)}
                maxLength={500}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 12, color: "#aaa" }}>{textoAviso.length}/500 caracteres</span>
                {mensajeAviso && (
                  <span style={{ fontSize: 13, color: mensajeAviso.startsWith("✓") ? "#27ae60" : "#e74c3c", fontWeight: 600 }}>
                    {mensajeAviso}
                  </span>
                )}
              </div>
              <button
                style={{ ...styles.boton, background: "#3f51b5", marginTop: 12, width: mobile ? "100%" : "auto" }}
                onClick={handleEnviarAviso}
                disabled={enviandoAviso || !textoAviso.trim()}
              >
                {enviandoAviso ? "Enviando..." : "📢 Enviar aviso"}
              </button>
              {notificaciones.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e", marginBottom: 10 }}>
                    Avisos enviados ({notificaciones.length})
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {notificaciones.map(n => {
                      const admin = mapaEmpleados[n.creadoPor];
                      const leidos = n.leidoPor?.length || 0;
                      return (
                        <div key={n.id} style={styles.avisoItem}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                            <p style={{ fontSize: 13, color: "#1a1a2e", margin: 0, flex: 1, lineHeight: 1.5 }}>{n.mensaje}</p>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: "#e8eaf6", color: "#3f51b5", whiteSpace: "nowrap" }}>
                              {leidos} leído{leidos !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
                            {admin ? `${admin.apellido}, ${admin.nombre}` : "Admin"} · {formatFecha(n.creadoEn)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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
            <h2 style={styles.cardTitle}>📊 Resumen de distribuciones</h2>
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
                      {m.esFuturo && <span style={{ marginLeft: 4, fontSize: 10, color: mesResumenSeleccionado === m.key ? "#adf" : "#3f51b5" }}>próximo</span>}
                    </button>
                  ))}
                </div>
                {mesSeleccionado && (
                  <>
                    <div style={{ fontSize: 12, color: "#999", marginBottom: 12, fontStyle: "italic" }}>
                      {mesSeleccionado.esFuturo
                        ? "Distribución generada para el próximo mes. Los días no han ocurrido aún."
                        : "Distribución original tal como fue lanzada. Los días tachados ya ocurrieron."
                      }
                    </div>
                    {mesSeleccionado.q1.length === 0 && mesSeleccionado.q2.length === 0 ? (
                      <div style={styles.aviso}>Sin datos para este mes.</div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                        {renderColumnaResumen(mesSeleccionado.q1, "1ra Quincena (1-15)", !mesSeleccionado.esFuturo)}
                        {renderColumnaResumen(mesSeleccionado.q2, "2da Quincena (16-fin)", !mesSeleccionado.esFuturo)}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {seccion === "calendario" && (
          <div style={styles.card}>
            <Calendario esAdmin={false} />
          </div>
        )}

        {seccion === "asistencia" && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>✅ Control de asistencia</h2>
            <div style={styles.diasSelectorRow}>
              {diasAsistencia.map(d => {
                const nombreDia = d.fecha.toLocaleString("es-AR", { weekday: "short" });
                const esHoy = d.diaNum === ahora.getDate() && d.mesNum === ahora.getMonth() + 1;
                return (
                  <button
                    key={d.key}
                    style={{ ...styles.diaBtn, ...(diaSeleccionado === d.key ? styles.diaBtnActivo : {}) }}
                    onClick={() => setDiaSeleccionado(d.key)}
                  >
                    <span style={{ fontSize: 11, textTransform: "capitalize" }}>{nombreDia}</span>
                    <span style={{ fontWeight: 800, fontSize: 18 }}>{d.diaNum}</span>
                    {esHoy && <span style={{ fontSize: 10, color: "#27ae60" }}>Hoy</span>}
                  </button>
                );
              })}
            </div>
            {diaActual && (
              <>
                {/* Coordinador del día */}
                {(() => {
                  if (!diaActual) return null;
                  const coord = coordinadoresAsistencia[diaActual.diaNum];
                  if (!coord) return null;

                  const LABEL_ESP2 = { MONTAJE: "Montaje", MOTORES: "Motores", AVIONICA: "Avionica" };
                  let labelCoord2 = "";
                  let empCoord = null;
                  if (coord.tipo === "admin") {
                    empCoord = mapaEmpleados[coord.adminId];
                    labelCoord2 = empCoord ? `${empCoord.apellido}, ${empCoord.nombre}` : "Admin";
                  } else {
                    labelCoord2 = `Interino — ${LABEL_ESP2[coord.especialidad] || coord.especialidad}`;
                  }

                  // Solo mostrar checkbox de confirmación para coordinadores de tipo admin
                  const docIdCoord = coord.tipo === "admin" && coord.adminId
                    ? `${diaActual.key}_${coord.adminId}`
                    : null;
                  const confirmadoCoord = docIdCoord ? asistencias[docIdCoord]?.confirmado : false;

                  return (
                    <div style={{ marginBottom: 20 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e", marginBottom: 10 }}>
                        ⭐ Coordinador del día
                      </h3>
                      <div style={{
                        ...styles.asistenciaFila,
                        background: confirmadoCoord ? "#fce4ec" : "white",
                        border: `1px solid ${confirmadoCoord ? "#e91e63" : "#e8eaf6"}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 20 }}>{coord.tipo === "admin" ? (confirmadoCoord ? "✅" : "⬜") : "⭐"}</span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: "#880e4f" }}>
                              {labelCoord2}
                            </div>
                            <span style={{ fontSize: 11, color: "#e91e63" }}>
                              {coord.tipo === "admin" ? "Coordinador" : "Interino (sin confirmación)"}
                            </span>
                          </div>
                        </div>
                        {coord.tipo === "admin" && docIdCoord && (
                          <button
                            style={{ ...styles.botonSecundario, background: confirmadoCoord ? "#e74c3c" : "#880e4f" }}
                            onClick={() => toggleConfirmado(diaActual.key, coord.adminId)}
                          >
                            {confirmadoCoord ? "Quitar" : "Confirmar"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e", margin: "16px 0 10px" }}>
                  Asignados para el {diaActual.label}
                </h3>
                {diaActual.asignados.length === 0 ? (
                  <div style={styles.aviso}>No hay empleados asignados para este día.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                    {diaActual.asignados.map((a, i) => {
                      const emp = mapaEmpleados[a.empleadoId];
                      const docId = `${diaActual.key}_${a.empleadoId}`;
                      const confirmado = asistencias[docId]?.confirmado;
                      const color = COLORES_TURNO[a.turno] || { bg: "#f5f5f5", text: "#333" };
                      const esp = emp?.especialidad;
                      const colorEsp = esp ? (COLORES_ESP[esp] || { bg: "#f0f2f5", text: "#666" }) : null;
                      return (
                        <div key={i} style={{
                          ...styles.asistenciaFila,
                          background: confirmado ? "#eafaf1" : "white",
                          border: `1px solid ${confirmado ? "#27ae60" : "#eee"}`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 20 }}>{confirmado ? "✅" : "⬜"}</span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a2e", display: "flex", alignItems: "center", gap: 6 }}>
                                {emp ? `${emp.apellido}, ${emp.nombre}` : a.empleadoId}
                                {esp && (
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: colorEsp.bg, color: colorEsp.text }}>
                                    {esp}
                                  </span>
                                )}
                              </div>
                              <span style={{ ...styles.resumenChip, background: color.bg, color: color.text, fontSize: 11 }}>
                                {a.turno} {a.turno === "mañana" ? "☀️" : a.turno === "tarde" ? "🌅" : "🌙"}
                              </span>
                            </div>
                          </div>
                          <button
                            style={{ ...styles.botonSecundario, background: confirmado ? "#e74c3c" : "#27ae60" }}
                            onClick={() => toggleConfirmado(diaActual.key, a.empleadoId)}
                          >
                            {confirmado ? "Quitar" : "Confirmar"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a2e", marginBottom: 10 }}>
                  Reemplazantes / adicionales
                </h3>
                {reemplazantesDelDia.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    {reemplazantesDelDia.map((r) => {
                      const emp = mapaEmpleados[r.empleadoId];
                      return (
                        <div key={r.docId} style={{ ...styles.asistenciaFila, background: "#e8f4fd", border: "1px solid #3f51b5" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 20 }}>🎣</span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a2e" }}>
                                {emp ? `${emp.apellido}, ${emp.nombre}` : r.empleadoId}
                              </div>
                              <span style={{ fontSize: 11, color: "#3f51b5" }}>Reemplazante</span>
                            </div>
                          </div>
                          <button style={{ ...styles.botonEliminar }} onClick={() => borrarReemplazante(diaActual.key, r.empleadoId)}>
                            Quitar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ ...styles.grid, gridTemplateColumns: mobile ? "1fr" : "2fr 1fr", gap: 8 }}>
                  <select
                    style={styles.input}
                    value={reemplazante[diaActual.key] || ""}
                    onChange={e => setReemplazante(prev => ({ ...prev, [diaActual.key]: e.target.value }))}
                  >
                    <option value="">Seleccioná reemplazante</option>
                    {empleados
                      .filter(e => !diaActual.asignados.find(a => a.empleadoId === e.id))
                      .map(e => (
                        <option key={e.id} value={e.id}>{e.apellido}, {e.nombre}</option>
                      ))
                    }
                  </select>
                  <button
                    style={{ ...styles.boton, background: "#3f51b5" }}
                    onClick={() => agregarReemplazante(diaActual.key, reemplazante[diaActual.key], "solape")}
                  >
                    Agregar
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {seccion === "cambios" && (
          <>
            {/* Solicitudes pendientes propias */}
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>🔄 Mis solicitudes pendientes</h2>
              {solicitudesPendientes.length === 0 ? (
                <div style={styles.aviso}>No tenés solicitudes de cambio pendientes.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {solicitudesPendientes.map(s => renderSolicitudCard(s, true))}
                </div>
              )}
            </div>

            {/* Historial agrupado por mes */}
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>
                📋 Historial de cambios
                <span style={{ fontSize: 12, fontWeight: 400, color: "#999", marginLeft: 8 }}>
                  ({totalCambios} total)
                </span>
              </h2>

              {cambiosPorMes.length === 0 ? (
                <div style={styles.aviso}>Todavía no hay cambios registrados.</div>
              ) : (
                <>
                  {/* Solapas de mes */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                    {cambiosPorMes.map(m => (
                      <button
                        key={m.key}
                        style={{
                          padding: "6px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                          background: mesCambioSeleccionado === m.key ? "#1a1a2e" : "white",
                          color: mesCambioSeleccionado === m.key ? "white" : "#666",
                          border: `1px solid ${mesCambioSeleccionado === m.key ? "#1a1a2e" : "#ddd"}`,
                          fontWeight: mesCambioSeleccionado === m.key ? 700 : 400,
                          textTransform: "capitalize",
                        }}
                        onClick={() => setMesCambioSeleccionado(m.key)}
                      >
                        {m.label}
                        <span style={{
                          marginLeft: 6, fontSize: 11, fontWeight: 700,
                          background: mesCambioSeleccionado === m.key ? "rgba(255,255,255,0.25)" : "#f0f2f5",
                          color: mesCambioSeleccionado === m.key ? "white" : "#666",
                          padding: "1px 6px", borderRadius: 8,
                        }}>
                          {m.items.length}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Cambios del mes seleccionado */}
                  {mesCambioActual && (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {mesCambioActual.items
                          .slice(0, visiblesPorMes[mesCambioActual.key] || 5)
                          .map(s => renderSolicitudCard(s, false))
                        }
                      </div>

                      {/* Botón ver más — carga todos de a 5 hasta mostrar todos */}
                      {mesCambioActual.items.length > (visiblesPorMes[mesCambioActual.key] || 5) && (
                        <button
                          style={styles.botonVerMas}
                          onClick={() => setVisiblesPorMes(prev => ({
                            ...prev,
                            [mesCambioActual.key]: Math.min(
                              (prev[mesCambioActual.key] || 5) + 5,
                              mesCambioActual.items.length
                            ),
                          }))}
                        >
                          ▼ Ver más ({mesCambioActual.items.length - (visiblesPorMes[mesCambioActual.key] || 5)} restantes)
                        </button>
                      )}

                      {/* Botón colapsar cuando ya se muestran todos */}
                      {mesCambioActual.items.length > 5 &&
                        mesCambioActual.items.length <= (visiblesPorMes[mesCambioActual.key] || 5) && (
                          <button
                            style={styles.botonVerMas}
                            onClick={() => setVisiblesPorMes(prev => ({ ...prev, [mesCambioActual.key]: 5 }))}
                          >
                            ▲ Ver menos
                          </button>
                        )}
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {seccion === "coordinadores" && (() => {
          const diasDelMes = new Date(coordAnio, coordMes, 0).getDate();
          const nombreMesCoord = new Date(coordAnio, coordMes - 1, 1).toLocaleString("es-AR", { month: "long", year: "numeric" });
          const admins = empleados.filter(e => e.esAdmin);
          const ahora2 = new Date();
          const hoy = { d: ahora2.getDate(), m: ahora2.getMonth() + 1, a: ahora2.getFullYear() };
          const LABEL_ESP = { MONTAJE: "Montaje", MOTORES: "Motores", AVIONICA: "Avionica" };

          // Generar todos los días del mes para mostrar estado completo
          const todosDias = [];
          for (let d = 1; d <= diasDelMes; d++) {
            todosDias.push(d);
          }

          const esPasado = (d) => {
            if (coordAnio < hoy.a) return true;
            if (coordAnio === hoy.a && coordMes < hoy.m) return true;
            if (coordAnio === hoy.a && coordMes === hoy.m && d < hoy.d) return true;
            return false;
          };
          const esHoy = (d) => coordAnio === hoy.a && coordMes === hoy.m && d === hoy.d;

          return (
            <>
              {/* Formulario de carga */}
              <div style={styles.card}>
                <h2 style={styles.cardTitle}>⭐ Coordinador del día</h2>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 14 }}>
                  Cada día de solape requiere un coordinador. Podés asignar un admin por nombre o registrar un interino por especialidad.
                </p>

                {/* Selector de mes */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <button style={{ ...styles.botonSecundario, padding: "6px 12px" }} onClick={() => cambiarMesCoord(-1)}>◀</button>
                  <span style={{ fontWeight: 700, fontSize: 15, textTransform: "capitalize", minWidth: 160, textAlign: "center" }}>
                    {nombreMesCoord}
                  </span>
                  <button style={{ ...styles.botonSecundario, padding: "6px 12px" }} onClick={() => cambiarMesCoord(1)}>▶</button>
                </div>

                {/* Formulario */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 90 }}>
                    <label style={{ fontSize: 12, color: "#666" }}>Día</label>
                    <select style={{ ...styles.input, width: 90 }} value={diaCoordSel} onChange={e => setDiaCoordSel(e.target.value)}>
                      <option value="">Día</option>
                      {todosDias.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 140 }}>
                    <label style={{ fontSize: 12, color: "#666" }}>Tipo</label>
                    <select style={{ ...styles.input, width: 140 }} value={tipoCoord} onChange={e => setTipoCoord(e.target.value)}>
                      <option value="admin">Admin por nombre</option>
                      <option value="interino">Interino (especialidad)</option>
                    </select>
                  </div>

                  {tipoCoord === "admin" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 180 }}>
                      <label style={{ fontSize: 12, color: "#666" }}>Admin</label>
                      <select style={styles.input} value={adminCoordSel} onChange={e => setAdminCoordSel(e.target.value)}>
                        <option value="">Seleccioná admin...</option>
                        {admins.map(e => (
                          <option key={e.id} value={e.id}>{e.apellido}, {e.nombre}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 180 }}>
                      <label style={{ fontSize: 12, color: "#666" }}>Especialidad del interino</label>
                      <select style={styles.input} value={espCoordSel} onChange={e => setEspCoordSel(e.target.value)}>
                        <option value="MONTAJE">MONTAJE</option>
                        <option value="MOTORES">MOTORES</option>
                        <option value="AVIONICA">AVIONICA</option>
                      </select>
                    </div>
                  )}

                  <button
                    style={{ ...styles.boton, background: "#880e4f", width: mobile ? "100%" : "auto" }}
                    onClick={handleGuardarCoordinador}
                    disabled={guardandoCoord}
                  >
                    {guardandoCoord ? "Guardando..." : "Asignar"}
                  </button>
                </div>

                {mensajeCoord && (
                  <p style={{ color: mensajeCoord.startsWith("✓") ? "#27ae60" : "#e74c3c", fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
                    {mensajeCoord}
                  </p>
                )}
              </div>

              {/* Lista del mes completo */}
              <div style={styles.card}>
                <h2 style={styles.cardTitle}>
                  Días del mes
                  <span style={{ fontSize: 12, fontWeight: 400, color: "#999", marginLeft: 8 }}>
                    {Object.keys(coordinadoresMes).length}/{diasDelMes} asignados
                  </span>
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {todosDias.map(d => {
                    const coord = coordinadoresMes[d];
                    const fecha = new Date(coordAnio, coordMes - 1, d);
                    const nombreDia = fecha.toLocaleString("es-AR", { weekday: "short" });
                    const turnoDelDia = getTurnoParaDia(fecha);
                    const COLORES_COORD_TURNO = {
                      mañana: { bg: "#fff8e1", color: "#856404", emoji: "☀️" },
                      tarde: { bg: "#e8f5e9", color: "#1e8449", emoji: "🌅" },
                      noche: { bg: "#e8eaf6", color: "#283593", emoji: "🌙" },
                      franco: { bg: "#f5f5f5", color: "#999", emoji: "—" },
                    };
                    const ct = COLORES_COORD_TURNO[turnoDelDia] || COLORES_COORD_TURNO.franco;
                    const pasado = esPasado(d);
                    const hoyFlag = esHoy(d);

                    let labelCoord = null;
                    if (coord) {
                      if (coord.tipo === "admin") {
                        const emp = mapaEmpleados[coord.adminId];
                        labelCoord = emp ? `${emp.apellido}, ${emp.nombre}` : "Admin";
                      } else {
                        labelCoord = `Interino — ${LABEL_ESP[coord.especialidad] || coord.especialidad}`;
                      }
                    }

                    return (
                      <div key={d} style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "8px 12px", borderRadius: 8,
                        background: hoyFlag ? "#fdf2f2" : coord ? "white" : "#fef9e7",
                        border: `1px solid ${hoyFlag ? "#c0392b" : coord ? "#eee" : "#f39c12"}`,
                        opacity: pasado ? 0.6 : 1,
                      }}>
                        <div style={{ minWidth: 130, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{
                            fontWeight: 700, fontSize: 14,
                            color: pasado ? "#aaa" : hoyFlag ? "#c0392b" : "#1a1a2e",
                            textDecoration: pasado ? "line-through" : "none",
                          }}>
                            {d}
                          </span>
                          <span style={{ fontSize: 12, color: "#aaa", textTransform: "capitalize" }}>{nombreDia}</span>
                          {turnoDelDia !== "franco" && (
                            <span style={{
                              fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 5,
                              background: ct.bg, color: ct.color,
                            }}>
                              {ct.emoji} {turnoDelDia}
                            </span>
                          )}
                          {hoyFlag && <span style={{ fontSize: 11, color: "#c0392b", fontWeight: 700 }}>Hoy</span>}
                        </div>

                        <div style={{ flex: 1 }}>
                          {coord ? (
                            <span style={{
                              fontSize: 13, fontWeight: 600,
                              color: coord.tipo === "admin" ? "#880e4f" : "#e65100",
                              background: coord.tipo === "admin" ? "#fce4ec" : "#fff3e0",
                              padding: "2px 10px", borderRadius: 6,
                              border: `1px solid ${coord.tipo === "admin" ? "#e91e63" : "#ff9800"}`,
                            }}>
                              ⭐ {labelCoord}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: "#f39c12", fontWeight: 600 }}>
                              ⚠️ Sin asignar
                            </span>
                          )}
                        </div>

                        <button
                          style={{
                            fontSize: 12, padding: "4px 10px", borderRadius: 6,
                            background: "transparent", border: "1px solid #ddd",
                            color: "#666", cursor: "pointer",
                          }}
                          onClick={() => {
                            setDiaCoordSel(String(d));
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          {coord ? "Cambiar" : "Asignar"}
                        </button>

                        {coord && (
                          <button
                            style={{ ...styles.botonEliminar, fontSize: 12, padding: "4px 10px" }}
                            onClick={() => handleQuitarCoordinador(d)}
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Resumen del mes — solo admins, solo para admins */}
              {Object.keys(resumenCoord).length > 0 && (
                <div style={styles.card}>
                  <h2 style={styles.cardTitle}>📊 Resumen acumulado de coordinaciones</h2>
                  <p style={{ fontSize: 12, color: "#999", marginBottom: 12, fontStyle: "italic" }}>
                    Total histórico de días coordinados por cada admin.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {Object.entries(resumenCoord)
                      .sort((a, b) => b[1] - a[1])
                      .map(([uid, count]) => {
                        const emp = mapaEmpleados[uid];
                        if (!emp) return null;
                        const max = Math.max(...Object.values(resumenCoord));
                        const pct = max > 0 ? Math.round((count / max) * 100) : 0;
                        return (
                          <div key={uid} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e", minWidth: 160 }}>
                              {emp.apellido}, {emp.nombre}
                            </span>
                            <div style={{ flex: 1, height: 8, background: "#f0f2f5", borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: "#880e4f", borderRadius: 4 }} />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#880e4f", minWidth: 40, textAlign: "right" }}>
                              {count} días
                            </span>
                          </div>
                        );
                      })
                    }
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {seccion === "wordle" && (
          <div style={styles.card}>
            <Wordle />
          </div>
        )}

        {seccion === "cuenta" && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>🔑 Mi cuenta</h2>
            {empleadoActual && (
              <p style={{ color: "#666", marginBottom: 16, fontSize: 14 }}>
                <strong>{empleadoActual.apellido}, {empleadoActual.nombre}</strong>
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
  banner: {
    background: "#e8f4fd", border: "1px solid #3f51b5", color: "#283293",
    padding: "12px 16px", textAlign: "center", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  header: {
    background: "#c0392b", color: "white", padding: "12px 16px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  title: { fontSize: 20, fontWeight: 800 },
  logout: {
    background: "transparent", border: "1px solid white", color: "white",
    padding: "6px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer",
  },
  campanaBtn: {
    position: "relative", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.4)",
    borderRadius: 8, padding: "6px 10px", fontSize: 18, cursor: "pointer", color: "white",
    display: "flex", alignItems: "center",
  },
  campanaBadge: {
    position: "absolute", top: -6, right: -6,
    background: "#f39c12", color: "white", fontSize: 10, fontWeight: 800,
    borderRadius: "50%", width: 18, height: 18,
    display: "flex", alignItems: "center", justifyContent: "center",
    border: "2px solid #c0392b",
  },
  campanaPanel: {
    position: "absolute", top: "calc(100% + 8px)", right: 0,
    width: 320, maxHeight: 420, background: "white",
    borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
    zIndex: 1000, overflow: "hidden", border: "1px solid #e8eaf6",
  },
  campanaPanelHeader: {
    padding: "12px 14px", borderBottom: "1px solid #f0f2f5",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "#f8f9ff",
  },
  campanaSinAvisos: { padding: 20, textAlign: "center", color: "#aaa", fontSize: 13 },
  campanaLista: { overflowY: "auto", maxHeight: 360 },
  campanaItem: { padding: "12px 14px", borderBottom: "1px solid #f0f2f5" },
  avisoItem: {
    background: "#f8f9ff", border: "1px solid #e8eaf6", borderRadius: 8, padding: "10px 14px",
  },
  tabs: {
    display: "flex", background: "white",
    borderBottom: "2px solid #f0f2f5", padding: "0 8px", overflowX: "auto",
  },
  tab: {
    padding: "12px 14px", border: "none", background: "transparent",
    fontSize: 13, color: "#666", borderBottom: "3px solid transparent",
    marginBottom: -2, whiteSpace: "nowrap", cursor: "pointer",
  },
  tabActivo: { color: "#c0392b", fontWeight: 700, borderBottom: "3px solid #c0392b" },
  tabAlerta: { color: "#3f51b5", fontWeight: 700 },
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
    padding: "12px 24px", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer",
  },
  botonSecundario: {
    background: "#1a1a2e", color: "white", border: "none",
    padding: "6px 12px", borderRadius: 6, fontSize: 13, cursor: "pointer",
  },
  botonEliminar: {
    background: "#e74c3c", color: "white", border: "none",
    padding: "6px 12px", borderRadius: 6, fontSize: 13, cursor: "pointer",
  },
  botonVerMas: {
    width: "100%", marginTop: 10, padding: "8px", borderRadius: 8,
    border: "1px solid #ddd", background: "white", fontSize: 13,
    color: "#666", cursor: "pointer",
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
  empleadoEmail: { color: "#666", fontSize: 13, marginTop: 2 },
  badgeAdmin: {
    background: "#c0392b", color: "white", fontSize: 11, fontWeight: 700,
    padding: "2px 8px", borderRadius: 4,
  },
  rowBotones: { display: "flex", gap: 8 },
  estadoRow: { display: "flex", alignItems: "center", gap: 16 },
  estadoBadge: { padding: "10px 16px", borderRadius: 8, fontWeight: 600, fontSize: 14, flex: 1 },
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
  resumenNombre: { fontWeight: 600, fontSize: 14, color: "#1a1a2e", marginBottom: 6 },
  resumenDias: { display: "flex", flexWrap: "wrap", gap: 4 },
  resumenChip: { fontSize: 12, padding: "2px 8px", borderRadius: 6, fontWeight: 500 },
  solicitudCard: { border: "1px solid #e8eaf6", borderRadius: 10, padding: 12, background: "#f8f9ff" },
  solicitudInfo: { marginBottom: 8 },
  solicitudTitulo: { fontSize: 13, color: "#1a1a2e", marginBottom: 6 },
  solicitudDetalle: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  solicitudDia: { display: "flex", flexDirection: "column", gap: 2 },
  solicitudLabel: { fontSize: 11, color: "#666", fontWeight: 600, textTransform: "uppercase" },
  solicitudValor: { fontSize: 13, color: "#1a1a2e", fontWeight: 700 },
  solicitudFlecha: { fontSize: 18, color: "#3f51b5", fontWeight: 700 },
  solicitudBotones: { display: "flex", gap: 8 },
  botonAceptar: {
    background: "#27ae60", color: "white", border: "none",
    padding: "8px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  botonRechazar: {
    background: "transparent", color: "#e74c3c", border: "1px solid #e74c3c",
    padding: "8px 16px", borderRadius: 8, fontSize: 14, cursor: "pointer",
  },
  diasSelectorRow: { display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  diaBtn: {
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "10px 16px", borderRadius: 10, border: "1px solid #ddd",
    background: "white", cursor: "pointer", minWidth: 70, gap: 2,
  },
  diaBtnActivo: { background: "#1a1a2e", color: "white", border: "1px solid #1a1a2e" },
  asistenciaFila: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "10px 14px", borderRadius: 8,
  },
  ratioBox: {
    background: "#f0f2f5", borderRadius: 10, padding: "14px 18px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: 8,
  },
  ratioTitulo: { fontSize: 14, fontWeight: 600, color: "#1a1a2e" },
  ratioNumero: { fontSize: 15, fontWeight: 700 },
};