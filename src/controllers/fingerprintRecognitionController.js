const fingerprintRecognitionService = require("../services/fingerprintRecognitionService");

// SOLO obtener huellas - NO comparar
exports.getAllFingerprints = async (req, res) => {
  try {
    console.log("📤 Enviando todas las huellas registradas al frontend...");

    const fingerprints = await fingerprintRecognitionService.getAllFingerprints();
    
    console.log(`✅ ${fingerprints.length} huellas enviadas al frontend`);
    
    res.status(200).json(fingerprints);
    
  } catch (error) {
    console.error("❌ Error obteniendo huellas:", error);
    res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
};

// ELIMINAR el endpoint de reconocimiento - ahora se hace en el frontend