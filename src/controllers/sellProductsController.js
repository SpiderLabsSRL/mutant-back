const sellProductsService = require("../services/sellProductsService");

const getProducts = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ 
        error: "ID de usuario válido requerido" 
      });
    }
    
    const products = await sellProductsService.getProducts(userId);
    res.json(products);
  } catch (error) {
    console.error("Error en getProducts:", error);
    
    // Mensajes de error más específicos
    if (error.message.includes('Usuario no encontrado')) {
      return res.status(404).json({ 
        error: "Usuario no encontrado. Por favor, inicie sesión nuevamente." 
      });
    }
    
    res.status(500).json({ 
      error: error.message || "Error interno del servidor al obtener productos" 
    });
  }
};

const getCashRegisterStatus = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ 
        error: "ID de usuario válido requerido" 
      });
    }
    
    const status = await sellProductsService.getCashRegisterStatus(userId);
    res.json(status);
  } catch (error) {
    console.error("Error en getCashRegisterStatus:", error);
    
    // Mensajes de error más específicos
    if (error.message.includes('Usuario no encontrado')) {
      return res.status(404).json({ 
        error: "Usuario no encontrado. Por favor, inicie sesión nuevamente." 
      });
    }
    
    if (error.message.includes('No hay caja activa')) {
      return res.status(400).json({ 
        error: error.message 
      });
    }
    
    res.status(500).json({ 
      error: error.message || "Error interno del servidor al obtener estado de caja" 
    });
  }
};

const processSale = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ 
        error: "ID de usuario válido requerido" 
      });
    }
    
    const saleData = req.body;
    
    // Validaciones básicas de los datos de venta
    if (!saleData.productos || !Array.isArray(saleData.productos) || saleData.productos.length === 0) {
      return res.status(400).json({ 
        error: "La venta debe incluir al menos un producto" 
      });
    }
    
    if (typeof saleData.total !== 'number' || saleData.total < 0) {
      return res.status(400).json({ 
        error: "El total de la venta no puede ser negativo" 
      });
    }
    
    const result = await sellProductsService.processSale(userId, saleData);
    res.json(result);
  } catch (error) {
    console.error("Error en processSale:", error);
    
    // Mensajes de error más específicos para el cliente
    if (error.message.includes('stock insuficiente') || error.message.includes('Stock insuficiente')) {
      return res.status(400).json({ 
        error: error.message 
      });
    }
    
    if (error.message.includes('caja no está abierta') || error.message.includes('No hay caja activa')) {
      return res.status(400).json({ 
        error: error.message 
      });
    }
    
    if (error.message.includes('Usuario no encontrado') || error.message.includes('Error de autenticación')) {
      return res.status(401).json({ 
        error: "Error de autenticación. Por favor, inicie sesión nuevamente." 
      });
    }
    
    if (error.message.includes('Producto no encontrado')) {
      return res.status(404).json({ 
        error: error.message 
      });
    }
    
    res.status(500).json({ 
      error: error.message || "Error interno del servidor al procesar la venta" 
    });
  }
};

module.exports = {
  getProducts,
  getCashRegisterStatus,
  processSale
};