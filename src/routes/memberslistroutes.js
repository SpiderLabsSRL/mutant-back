const express = require("express");
const router = express.Router();
const membersListController = require("../controllers/memberslistcontroller");
const { authenticate, authorize } = require("../middleware/loginmiddleware");

router.get("/test", membersListController.testRoute);

router.use(authenticate);

router.get("/", authorize(['admin', 'recepcionista']), membersListController.getMembers);
router.get("/all", authorize(['admin', 'recepcionista']), membersListController.getAllMembers);
router.get("/services/available", authorize(['admin', 'recepcionista']), membersListController.getAvailableServices);
router.get("/branches/available", authorize(['admin', 'recepcionista']), membersListController.getAvailableBranches);

router.put("/:id", authorize(['admin','recepcionista']), membersListController.editMember);

// ✅ NUEVA RUTA para actualizar fechas de un servicio
router.put("/:id/service-dates", authorize(['admin','recepcionista']), membersListController.updateInscriptionDates);

router.delete("/:id", authorize(['admin','recepcionista']), membersListController.deleteMember);

module.exports = router;