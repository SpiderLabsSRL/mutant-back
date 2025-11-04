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
// Agregar esta ruta
router.get("/services/available", authenticate, authorize(['admin', 'recepcionista']), membersListController.getAvailableServices);

// Rutas accesibles solo para admin
router.put("/:id", authorize(['admin','recepcionista']), membersListController.editMember);
router.delete("/:id", authorize(['admin','recepcionista']), membersListController.deleteMember);
router.get("/branches/available", authenticate, authorize(['admin', 'recepcionista']), membersListController.getAvailableBranches);

module.exports = router;