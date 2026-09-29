const express = require("express");
const router = express.Router();
const zumbaController = require("../controllers/zumbaController");

// Obtener instructores disponibles (empleados con rol zumba o entrenador)
router.get("/instructors", zumbaController.getInstructors);

// Obtener reportes con filtros (rango, día, mes, año)
router.get("/reports", zumbaController.getReports);

// Obtener reporte por fecha específica
router.get("/reports/by-date/:date", zumbaController.getReportByDate);

// Crear o actualizar reporte (upsert por fecha)
router.post("/reports", zumbaController.saveReport);

// Eliminar reporte
router.delete("/reports/:id", zumbaController.deleteReport);

// Estadísticas agregadas
router.get("/stats", zumbaController.getStats);

module.exports = router;