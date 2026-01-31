// cashRoutes.js
const express = require("express");
const router = express.Router();
const cashController = require("../controllers/cashController");

// Rutas para sucursales
router.get("/branches", cashController.getBranches);

// Rutas para cajas por sucursal
router.get("/branches/:branchId/cashboxes", cashController.getCashBoxesByBranch);

// Ruta para obtener el estado de una caja (monto final)
router.get("/cashboxes/:cashBoxId/status", cashController.getCashBoxStatus);

// Rutas para transacciones
router.get("/cashboxes/:cashBoxId/transactions", cashController.getTransactionsByCashBox);

// Ruta para totales de transacciones (sin paginación)
router.get("/totals", cashController.getTransactionTotals);

// Ruta específica para transacciones de lactobar
router.get("/branches/:branchId/lactobar/transactions", cashController.getLactobarTransactions);

module.exports = router;