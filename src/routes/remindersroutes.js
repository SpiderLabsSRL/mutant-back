const express = require("express");
const router = express.Router();
const remindersController = require("../controllers/reminderscontroller");

// Importar el middleware de autenticación que ya tienes
const { authenticate } = require("../middleware/loginmiddleware");

// Todas las rutas requieren autenticación
router.use(authenticate);

// Obtener nuevos miembros (inscritos hoy)
router.get("/new-members", remindersController.getNewMembers);

// Obtener miembros con membresías próximas a vencer
router.get("/expiring-members", remindersController.getExpiringMembers);

// Obtener miembros que cumplen años hoy
router.get("/birthday-members", remindersController.getBirthdayMembers);

module.exports = router;