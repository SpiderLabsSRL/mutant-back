const express = require("express");
const router = express.Router();
const accessController = require("../controllers/accessController");

// Obtener registros de acceso (solo del día actual por defecto)
router.get("/logs", accessController.getAccessLogs);

// Buscar miembros (clientes y empleados)
router.get("/members", accessController.searchMembers);

// Registrar acceso de cliente
router.post("/register/client", accessController.registerClientAccess);

// Registrar entrada de empleado
router.post("/register/employee/checkin", accessController.registerEmployeeCheckIn);

// Registrar salida de empleado
router.post("/register/employee/checkout", accessController.registerEmployeeCheckOut);

// Registrar acceso denegado sin inscripción activa
router.post("/register/denied/no-subscription", accessController.registerAccessDeniedNoSubscription);

module.exports = router;