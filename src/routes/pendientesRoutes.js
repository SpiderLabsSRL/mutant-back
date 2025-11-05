// routes/pendientesRoutes.js
const express = require("express");
const router = express.Router();
const PendientesController = require("../controllers/PendientesController");

// Obtener todos los pagos pendientes
router.get("/", PendientesController.getPagosPendientes);

// Registrar un pago
router.post("/:pagoId/pago", PendientesController.registrarPago);

// Cancelar pago pendiente
router.put("/:pagoId/cancelar", PendientesController.cancelarPagoPendiente);

module.exports = router;