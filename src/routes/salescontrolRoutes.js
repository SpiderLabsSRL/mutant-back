// backend/routes/salescontrolRoutes.js
const express = require("express");
const router = express.Router();
const salesController = require("../controllers/salescontrolController");

// Rutas para obtener ventas
router.get("/", salesController.getSales);
router.get("/:id", salesController.getSaleDetails);
router.get("/sucursales/list", salesController.getSucursales);

module.exports = router;
