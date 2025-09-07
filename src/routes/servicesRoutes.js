const express = require("express");
const router = express.Router();
const servicesController = require("../controllers/servicesController");



// Rutas para servicios
router.get("/", servicesController.getAllServices);
router.get("/sucursales", servicesController.getSucursales);
router.post("/", servicesController.createService);
router.put("/:id", servicesController.updateService);
router.delete("/:id", servicesController.deleteService);
router.patch("/:id/toggle-status", servicesController.toggleServiceStatus);

module.exports = router;