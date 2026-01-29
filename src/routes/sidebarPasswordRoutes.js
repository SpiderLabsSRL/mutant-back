// src/routes/sidebarPasswordRoutes.js
const express = require("express");
const router = express.Router();
const passwordController = require("../controllers/sidebarPasswordController");

// Sin middleware de autenticación
router.post("/change", passwordController.changePassword);

module.exports = router;
