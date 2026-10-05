const express = require("express");
const router = express.Router();
const reportsController = require("../controllers/reportsController");

// ============================================
// REPORTES GENERALES
// ============================================
router.get("/", reportsController.getReportes);
router.get("/sucursales", reportsController.getSucursales);
router.get("/ingresos-servicios", reportsController.getIngresosServicios);

// ============================================
// OBJETIVOS MENSUALES
// ============================================
router.get("/objetivos", reportsController.getObjetivosMensuales);
router.post("/objetivos", reportsController.guardarObjetivoMensual);
router.delete("/objetivos/:sucursalId/:mes", reportsController.eliminarObjetivoMensual);

// ============================================
// VENTAS REALES / RESUMEN / DESGLOSE
// ============================================
router.get("/ventas-reales", reportsController.getVentasRealesPorMes);
router.get("/resumen-por-sucursal", reportsController.getResumenPorSucursal);
router.get("/desglose-pagos", reportsController.getDesglosePagos);

// ============================================
// DESGLOSE DE PRODUCTOS Y SERVICIOS
// ============================================
router.get("/desglose-productos", reportsController.getDesgloseProductos);
router.get("/desglose-servicios", reportsController.getDesgloseServicios);

// ============================================
// MOVIMIENTOS DE STOCK
// ============================================
router.get("/movimientos-stock", reportsController.getMovimientosStock);

// ============================================
// INSCRIPCIONES AGRUPADAS
// ============================================
router.get("/inscripciones-agrupadas", reportsController.getInscripcionesAgrupadas);

// ============================================
// LISTAS PARA FILTROS
// ============================================
router.get("/productos-disponibles", reportsController.getProductosDisponibles);
router.get("/servicios-disponibles", reportsController.getServiciosDisponibles);
// ============================================
// REPORTE DE EMPLEADOS
// ============================================
router.get("/empleados", reportsController.getEmpleadosReporte);
router.get("/atrasos-empleados", reportsController.getAtrasosEmpleados);
router.get("/pagos-informativos", reportsController.getPagosInformativos);
router.patch("/empleados/:id/sueldo", reportsController.actualizarSueldoEmpleado);
router.get("/zumba", reportsController.getReportesZumba);
// ============================================
// MOVIMIENTOS DE FECHAS DE INSCRIPCIÓN
// ============================================
router.get("/movimientos-fechas-inscripcion", reportsController.getMovimientosFechasInscripcion);
module.exports = router; 