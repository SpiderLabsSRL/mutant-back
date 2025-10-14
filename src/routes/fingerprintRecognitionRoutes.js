const express = require("express");
const router = express.Router();
const fingerprintRecognitionController = require("../controllers/fingerprintRecognitionController");

// Ruta para reconocimiento de huellas
router.post("/recognize", fingerprintRecognitionController.recognizeFingerprint);


module.exports = router;