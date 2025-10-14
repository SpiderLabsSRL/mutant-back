const fingerprintRecognitionService = require("../services/fingerprintRecognitionService");

exports.recognizeFingerprint = async (req, res) => {
  try {
    const { fingerprint_data, format, quality, size } = req.body;
    
    // Validaciones
    if (!fingerprint_data) {
      return res.status(400).json({ 
        success: false,
        message: "Los datos de la huella son obligatorios" 
      });
    }

    if (!format) {
      return res.status(400).json({ 
        success: false,
        message: "El formato de la huella es obligatorio" 
      });
    }

    console.log("🔍 Iniciando reconocimiento REAL de huella...", {
      format: format,
      size: size || 'N/A',
      quality: quality || 80
    });

    const result = await fingerprintRecognitionService.recognizeFingerprint({
      fingerprint_data,
      format,
      quality: quality || 80,
      size: size
    });
    
    res.status(200).json(result);
    
  } catch (error) {
    console.error("❌ Error en reconocimiento:", error);
    res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
};