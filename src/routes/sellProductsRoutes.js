// src/routes/sellProductsRoutes.js
const express = require("express");
const router = express.Router();
const sellProductsController = require("../controllers/sellProductsController");

// Ruta para obtener productos disponibles
router.get("/products", sellProductsController.getProducts);

// Ruta para procesar una venta
router.post("/process-sale", sellProductsController.processSale);

module.exports = router;