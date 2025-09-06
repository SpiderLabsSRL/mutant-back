const express = require("express");
const router = express.Router();
const cashController = require("../controllers/cashController");

// Rutas para sucursales
router.get("/branches", cashController.getBranches);

// Rutas para cajas por sucursal
router.get("/branches/:branchId/cashboxes", cashController.getCashBoxesByBranch);

// Rutas para transacciones
router.get("/cashboxes/:cashBoxId/transactions", cashController.getTransactionsByCashBox);

// Ruta específica para transacciones de lactobar
router.get("/branches/:branchId/lactobar/transactions", cashController.getLactobarTransactions);

module.exports = router;