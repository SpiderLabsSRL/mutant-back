// src/routes/sucursalesroutes.js
const express = require("express");
const router = express.Router();
const sucursalesController = require("../controllers/sucursalescontroller");
const { authenticate } = require("../middleware/loginmiddleware");

router.get("/", authenticate, sucursalesController.getSucursalesActivas);
router.get("/:id", authenticate, sucursalesController.getSucursalById);

module.exports = router;