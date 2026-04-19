# solAPPe — Gestión de Turnos Aeronáuticos

Aplicación web interna para la gestión de turnos y distribución de trabajo en una instalación de mantenimiento aeronáutico. Desarrollada desde cero para reemplazar planillas de Excel, está actualmente en producción y utilizada por un equipo de ~20 empleados.

[![Live](https://img.shields.io/badge/live-production-brightgreen)](https://solappe.vercel.app)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%2B%20Auth-FFCA28?logo=firebase)](https://firebase.google.com)
[![Vercel](https://img.shields.io/badge/Vercel-deployed-black?logo=vercel)](https://vercel.com)

---

## El problema que resuelve

Coordinar los turnos rotativos de un equipo aeronáutico (mañana, tarde, noche) implica manejar especialidades técnicas, reemplazos, licencias, asistencias y una distribución equitativa de las asignaciones. Todo esto se hacía manualmente en Excel. solAPPe lo digitaliza y automatiza.

---

## Funcionalidades principales

**Panel de empleados (vista usuario)**
- Visualización del propio turno y calendario mensual
- Confirmación de asistencia y registro de reemplazantes
- Historial personal de asignaciones y ratio de asistencia
- Solicitudes de cambio de turno

**Panel de administración**
- Alta, baja y gestión de empleados con especialidades técnicas (MONTAJE, AVIONICA, MOTORES, RADIO, SCO) con badges de color
- Algoritmo de distribución de solapes balanceado por especialidad e historial acumulado de asignaciones
- Resumen mensual de distribuciones con selector de período
- Historial completo de cambios
- Exportación de calendario en formato ICS

**AeroWordle**
- Juego tipo Wordle integrado con temática de aviación
- Ranking diario y mensual persistido en Firestore
- Diseño responsive mobile

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite |
| Autenticación | Firebase Auth |
| Base de datos | Cloud Firestore |
| Hosting | Vercel (CI/CD automático via GitHub) |
| Estilos | CSS puro |

---

## Arquitectura