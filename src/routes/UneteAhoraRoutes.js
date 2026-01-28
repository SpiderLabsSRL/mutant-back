const express = require("express");
const router = express.Router();
const UneteAhoraController = require("../controllers/UneteAhoraController");

// Rutas para la funcionalidad de Únete Ahora
router.get("/buscar-usuario/:ci", UneteAhoraController.buscarUsuarioPorCI);
router.post("/registrar", UneteAhoraController.registrarUsuario);

module.exports = router;
