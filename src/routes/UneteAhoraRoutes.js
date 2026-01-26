const express = require("express");
const router = express.Router();
const UneteAhoraController = require("../controllers/UneteAhoraController");

// Rutas para la funcionalidad de Únete Ahora
router.get("/sucursales", UneteAhoraController.getSucursales);
router.get("/planes", UneteAhoraController.getPlanes);
router.get("/buscar-usuario/:ci", UneteAhoraController.buscarUsuarioPorCI);
router.get("/ultimo-ingreso/:personaId", UneteAhoraController.obtenerUltimoIngreso);
router.get("/verificar-disponibilidad/:servicioId/:sucursalId", UneteAhoraController.verificarDisponibilidadPlan);

router.post("/inscribir", UneteAhoraController.crearInscripcion);
router.post("/renovar", UneteAhoraController.renovarInscripcion);

module.exports = router;