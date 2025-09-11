// src/controllers/sellProductsController.js
const sellProductsService = require("../services/sellProductsService");

const getProducts = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    if (!userId) {
      return res.status(400).json({ 
        error: "ID de usuario requerido" 
      });
    }
    
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
    const userId = parseInt(req.query.userId);
    if (!userId) {
      return res.status(400).json({ 
        error: "ID de usuario requerido" 
      });
    }
    
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