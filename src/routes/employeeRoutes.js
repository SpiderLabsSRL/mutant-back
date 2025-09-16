const express = require("express");
const router = express.Router();
const employeeController = require("../controllers/employeeController");

// Rutas para sucursales
router.get("/branches", employeeController.getBranches);

// Rutas para cajas
router.get("/boxes", employeeController.getBoxes);

// Rutas para empleados
router.get("/", employeeController.getEmployees);
router.post("/", employeeController.createEmployee);
router.put("/:id", employeeController.updateEmployee);
router.delete("/:id", employeeController.deleteEmployee);
router.patch("/:id/toggle-status", employeeController.toggleEmployeeStatus);
router.post("/:id/register-fingerprint", employeeController.registerFingerprint);

module.exports = router;