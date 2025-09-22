const express = require("express");
const router = express.Router();
const salesController = require("../controllers/salescontrolController");

// Rutas para obtener ventas
router.get("/", salesController.getSales);
router.get("/:id", salesController.getSaleDetails);
router.get("/sucursales", salesController.getSucursales);

module.exports = router;