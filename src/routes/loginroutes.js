const express = require("express");
const router = express.Router();
const authController = require("../controllers/logincontroller");
const { authenticate } = require("../middleware/loginmiddleware");

router.post("/login", authController.login);
router.post("/fingerprint", authController.loginWithFingerprint); // 🆕 Ruta para huella
router.get("/verify", authenticate, authController.verifyToken);

module.exports = router;