const express = require("express");
const router = express.Router();
const RegisterMemberController = require("../controllers/RegisterMemberController");

// Obtener servicios por sucursal
router.get("/services/sucursal/:sucursalId", RegisterMemberController.getServicesByBranch);

// Buscar personas
router.get("/people/search", RegisterMemberController.searchPeople);

// Obtener suscripciones activas de una persona
router.get("/subscriptions/active/:personaId", RegisterMemberController.getActiveSubscriptions);

// Verificar estado de caja
router.get("/cash-register/status/:cajaId", RegisterMemberController.getCashRegisterStatus);

// Registrar nueva inscripción
router.post("/subscriptions/register", RegisterMemberController.registerMember);

module.exports = router;