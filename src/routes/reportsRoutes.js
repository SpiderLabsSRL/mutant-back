const express = require("express");
const router = express.Router();
const reportsController = require("../controllers/reportsController");

// Ruta para obtener reportes con filtros
router.get("/", reportsController.getReportes);

// Ruta para obtener sucursales
router.get("/sucursales", reportsController.getSucursales);

// Nueva ruta para obtener ingresos por servicio
router.get('/ingresos-servicios', reportsController.getIngresosServicios);

module.exports = router;