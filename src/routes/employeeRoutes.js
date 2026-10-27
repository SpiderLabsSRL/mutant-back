const express = require("express");
const router = express.Router();
const employeeController = require("../controllers/employeeController");

// ============================================
// SUCURSALES
// ============================================
router.get("/branches", employeeController.getBranches);

// ============================================
// CAJAS
// ============================================
router.get("/boxes", employeeController.getBoxes);

// ============================================
// 🆕 HUELLA POR PERSONA_ID (explícito, sin ambigüedad)
// ⚠️ IMPORTANTE: debe ir ANTES de "/:id" para no colisionar.
// ============================================
router.post(
  "/person/:personaId/register-fingerprint",
  employeeController.registerFingerprintByPersona
);

// ============================================
// EMPLEADOS
// ============================================
router.get("/", employeeController.getEmployees);
router.post("/", employeeController.createEmployee);
router.put("/:id", employeeController.updateEmployee);
router.delete("/:id", employeeController.deleteEmployee);
router.patch("/:id/toggle-status", employeeController.toggleEmployeeStatus);

// ============================================
// HUELLA POR ID (auto-resuelve empleado_id o persona_id)
// ============================================
router.post(
  "/:id/register-fingerprint",
  employeeController.registerFingerprint
);

module.exports = router;