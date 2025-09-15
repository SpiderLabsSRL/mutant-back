// src/routes/sellProductsRoutes.js
const express = require("express");
const router = express.Router();
const sellProductsController = require("../controllers/sellProductsController");

// Ruta para obtener productos disponibles
router.get("/products", sellProductsController.getProducts);

// Ruta para obtener estado de caja
router.get("/cash-register-status", sellProductsController.getCashRegisterStatus);

// Ruta para procesar una venta
router.post("/process-sale", sellProductsController.processSale);

module.exports = router;