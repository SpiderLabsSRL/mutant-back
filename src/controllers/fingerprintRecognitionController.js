// CORRIGE tu controller:

const fingerprintRecognitionService = require("../services/fingerprintRecognitionService");

// SOLO obtener huellas - SIN validaciones
exports.getAllFingerprints = async (req, res) => {
  try {
    console.log("📤 Enviando todas las huellas registradas al frontend...");

    // Usar la función RAW que no valida formato
    const fingerprints = await fingerprintRecognitionService.getAllFingerprintsRaw();
    
    console.log(`✅ ${fingerprints.length} huellas enviadas al frontend SIN validación`);
    
    // Log de diagnóstico
    if (fingerprints.length > 0) {
      fingerprints.forEach((fp, index) => {
        console.log(`   📦 Huella ${index + 1}: ${fp.nombres} ${fp.apellidos} - Tamaño: ${fp.data_size} bytes`);
      });
    }
    
    res.status(200).json(fingerprints);
    
  } catch (error) {
    console.error("❌ Error obteniendo huellas:", error);
    res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
};

