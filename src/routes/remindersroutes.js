const express = require("express");
const router = express.Router();
const remindersController = require("../controllers/reminderscontroller");

// Rutas para recordatorios
router.get("/new-members/:sucursalId", remindersController.getNewMembers);
router.get("/expiring-members/:sucursalId", remindersController.getExpiringMembers);
router.get("/birthday-members/:sucursalId", remindersController.getBirthdayMembers);

module.exports = router;