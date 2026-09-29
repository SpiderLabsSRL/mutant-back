// src/routes/sellProductsRoutes.js
const express = require("express");
const router = express.Router();
const sellProductsController = require("../controllers/sellProductsController");

// Productos disponibles
router.get("/products", sellProductsController.getProducts);

// Estado de caja
router.get("/cash-register-status", sellProductsController.getCashRegisterStatus);

// ✅ NUEVO: Validar cupón por sucursal y tipo
router.get("/validate-coupon", sellProductsController.validateCoupon);

// Procesar venta
router.post("/process-sale", sellProductsController.processSale);

module.exports = router;