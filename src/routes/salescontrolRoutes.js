// backend/routes/salescontrolRoutes.js
const express = require("express");
const router = express.Router();
const salesController = require("../controllers/salescontrolController");
const { authenticate } = require("../middleware/loginmiddleware");

// ⚠️ Aplicamos authenticate a TODAS las rutas del router
router.use(authenticate);

// ⚠️ IMPORTANTE: Las rutas específicas van ANTES de las dinámicas
router.get("/totals", salesController.getTotals);
router.get("/sucursales/list", salesController.getSucursales);
router.get("/", salesController.getSales);

// ✅ Anular venta (solo admin, solo hoy)
router.delete("/:id", salesController.anularVenta);

// Detalle (dinámica, va al final)
router.get("/:id", salesController.getSaleDetails);

module.exports = router;