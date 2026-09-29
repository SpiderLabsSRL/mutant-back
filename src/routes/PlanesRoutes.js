// src/routes/PlanesRoutes.js
const express = require("express");
const router = express.Router();
const planesController = require("../controllers/PlanesController");

// ============================================
// RUTAS DE PLANES
// ============================================
router.get("/", planesController.getPlanes);
router.get("/activos", planesController.getPlanesActivos);
router.post("/", planesController.createPlan);
router.put("/:id", planesController.updatePlan);
router.delete("/:id", planesController.deletePlan);
router.patch("/:id/toggle-status", planesController.togglePlanStatus);
router.get("/tipos-duracion", planesController.getTiposDuracion);
router.get("/:id/sucursales", planesController.getSucursalesByPlan);
router.put("/:id/sucursales", planesController.updatePlanSucursales);

// ============================================
// RUTAS DE TIENDA (productos con landing=true)
// ============================================
router.get("/tienda/productos", planesController.getProductosLanding);
router.get("/tienda/productos/:id", planesController.getProductoById);

module.exports = router;