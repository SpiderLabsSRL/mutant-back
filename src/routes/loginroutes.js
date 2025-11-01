const express = require("express");
const router = express.Router();
const authController = require("../controllers/logincontroller");
const { authenticate } = require("../middleware/loginmiddleware");

router.post("/login", authController.login);
router.get("/verify", authenticate, authController.verifyToken);

module.exports = router;