const express = require("express");
const router = express.Router();
const newtransactionController = require("../controllers/newtransactionController");

// Rutas para transacciones
router.get("/transactions/transactions", newtransactionController.getTransactions);
router.get("/transactions/transactions/caja/:idCaja", newtransactionController.getTransactionsByCashRegister);
router.post("/transactions/transactions", newtransactionController.createTransaction);

// Rutas para estado de caja
router.get("/transactions/estado-caja/:idCaja", newtransactionController.getCashRegisterStatus);

// Ruta para obtener caja asignada al usuario (ahora recibe idUsuario por query)
router.get("/transactions/caja-asignada", newtransactionController.getAssignedCashRegister);

module.exports = router;