const express = require("express");
const router = express.Router();
const membersListController = require("../controllers/memberslistcontroller");
const { authenticate, authorize } = require("../middleware/loginmiddleware");

// Ruta de prueba pública
router.get("/test", membersListController.testRoute);

// Todas las rutas requieren autenticación
router.use(authenticate);

// Rutas accesibles solo para admin y recepcionista
router.get("/", authorize(['admin', 'recepcionista']), membersListController.getMembers);
router.get("/all", authorize(['admin', 'recepcionista']), membersListController.getAllMembers);

// Rutas accesibles solo para admin
router.put("/:id", authorize(['admin']), membersListController.editMember);
router.delete("/:id", authorize(['admin']), membersListController.deleteMember);

module.exports = router;