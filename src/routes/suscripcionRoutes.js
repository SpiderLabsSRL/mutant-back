// routes/suscripcionRoutes.js
const express = require("express");
const router = express.Router();
const suscripcionController = require("../controllers/suscripcionController");

router.get("/estado", suscripcionController.getEstadoSuscripcion);

module.exports = router;