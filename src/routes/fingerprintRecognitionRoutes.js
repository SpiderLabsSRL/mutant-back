const express = require('express');
const router = express.Router();
const fingerprintController = require('../controllers/fingerprintRecognitionController');

// SOLO obtener huellas - la comparación se hace en el frontend
router.get('/all-fingerprints', fingerprintController.getAllFingerprints);


module.exports = router;