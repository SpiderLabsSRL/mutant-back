// src/routes/PlanesRoutes.js
const express = require("express");
const router = express.Router();
const planesController = require("../controllers/PlanesController");

// Ruta para obtener todos los planes con sucursales
router.get("/", planesController.getPlanes);

// Ruta para obtener solo planes activos
router.get("/activos", planesController.getPlanesActivos);

// Ruta para crear un nuevo plan
router.post("/", planesController.createPlan);

// Ruta para actualizar un plan
router.put("/:id", planesController.updatePlan);

// Ruta para eliminar un plan
router.delete("/:id", planesController.deletePlan);

// Ruta para cambiar estado de un plan
router.patch("/:id/toggle-status", planesController.togglePlanStatus);

// Ruta para obtener tipos de duración
router.get("/tipos-duracion", planesController.getTiposDuracion);

// Ruta para obtener sucursales de un plan específico
router.get("/:id/sucursales", planesController.getSucursalesByPlan);

// Ruta para actualizar sucursales de un plan
router.put("/:id/sucursales", planesController.updatePlanSucursales);

module.exports = router;
