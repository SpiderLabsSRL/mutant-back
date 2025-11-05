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

// Obtener pagos pendientes de una persona
router.get("/pagos-pendientes/:personaId", RegisterMemberController.getPagosPendientes);

// Actualizar pago pendiente
router.put("/pagos-pendientes/:pagoId", RegisterMemberController.updatePagoPendiente);

module.exports = router;