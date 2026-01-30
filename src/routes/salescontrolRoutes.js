// backend/routes/salescontrolRoutes.js
const express = require("express");
const router = express.Router();
const salesController = require("../controllers/salescontrolController");

// Ruta para obtener ventas (con paginación)
router.get("/", salesController.getSales);

// NUEVA RUTA: Obtener totales de ventas (sin paginación)
router.get("/totals", salesController.getTotals);

// Ruta para obtener detalles de una venta específica
router.get("/:id", salesController.getSaleDetails);

// Ruta para obtener sucursales
router.get("/sucursales/list", salesController.getSucursales);

module.exports = router;