// backend/routes/salescontrolRoutes.js
const express = require("express");
const router = express.Router();
const salesController = require("../controllers/salescontrolController");

// ⚠️ IMPORTANTE: Las rutas específicas van ANTES de las dinámicas
router.get("/totals", salesController.getTotals);
router.get("/sucursales/list", salesController.getSucursales);
router.get("/", salesController.getSales);
router.get("/:id", salesController.getSaleDetails);

module.exports = router;