// src/controllers/sellProductsController.js
const sellProductsService = require("../services/sellProductsService");

const getProducts = async (req, res) => {
  try {
    // Para testing - usar un ID de usuario por defecto
    const userId = 1; // ID de usuario hardcodeado para testing
    const products = await sellProductsService.getProducts(userId);
    res.json(products);
  } catch (error) {
    console.error("Error en getProducts:", error);
    res.status(500).json({ 
      error: error.message || "Error interno del servidor" 
    });
  }
};

const processSale = async (req, res) => {
  try {
    // Para testing - usar un ID de usuario por defecto
    const userId = 1; // ID de usuario hardcodeado para testing
    const saleData = req.body;
    
    const result = await sellProductsService.processSale(userId, saleData);
    res.json(result);
  } catch (error) {
    console.error("Error en processSale:", error);
    res.status(500).json({ 
      error: error.message || "Error interno del servidor" 
    });
  }
};

module.exports = {
  getProducts,
  processSale
};