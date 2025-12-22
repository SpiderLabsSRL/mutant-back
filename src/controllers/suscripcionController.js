// src/controllers/suscripcionController.js
const suscripcionService = require("../services/suscripcionService");

const getEstadoSuscripcion = async (req, res) => {
  try {
    const estado = await suscripcionService.verificarEstadoSuscripcion();
    
    res.json({
      pagado: estado
    });
  } catch (error) {
    console.error("Error en getEstadoSuscripcion:", error);
    res.status(500).json({
      pagado: false,
      message: "Error al verificar estado de suscripción"
    });
  }
};

module.exports = {
  getEstadoSuscripcion
};