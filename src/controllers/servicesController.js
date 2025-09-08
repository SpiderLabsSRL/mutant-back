const servicesService = require("../services/servicesService");

const getAllServices = async (req, res) => {
  try {
    const services = await servicesService.getAllServices();
    res.json(services);
  } catch (error) {
    console.error("Error en getAllServices:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Error interno del servidor" 
    });
  }
};

const getSucursales = async (req, res) => {
  try {
    const sucursales = await servicesService.getSucursales();
    res.json(sucursales);
  } catch (error) {
    console.error("Error en getSucursales:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Error interno del servidor" 
    });
  }
};

const createService = async (req, res) => {
  try {
    const { name, price, maxEntries, sucursales, multisucursal, sucursalesMultisucursal } = req.body;
    
    if (!name || !price || !maxEntries || !sucursales || sucursales.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Todos los campos son obligatorios, incluyendo al menos una sucursal" 
      });
    }

    if (multisucursal && (!sucursalesMultisucursal || sucursalesMultisucursal.length < 2)) {
      return res.status(400).json({ 
        success: false, 
        message: "Para servicios multisucursal debe seleccionar al menos 2 sucursales" 
      });
    }

    // Validar que las sucursales multisucursal estén dentro de las disponibles
    if (multisucursal) {
      const invalidSucursales = sucursalesMultisucursal.filter(
        sucursalId => !sucursales.includes(sucursalId)
      );
      
      if (invalidSucursales.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: "Las sucursales multisucursal deben estar entre las sucursales disponibles" 
        });
      }
    }

    const newService = await servicesService.createService({
      name,
      price,
      maxEntries,
      sucursales,
      multisucursal: multisucursal || false,
      sucursalesMultisucursal: multisucursal ? sucursalesMultisucursal : []
    });
    
    res.status(201).json(newService);
  } catch (error) {
    console.error("Error en createService:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Error interno del servidor" 
    });
  }
};

const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, maxEntries, sucursales, multisucursal, sucursalesMultisucursal } = req.body;
    
    if (!name || !price || !maxEntries || !sucursales || sucursales.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Todos los campos son obligatorios, incluyendo al menos una sucursal" 
      });
    }

    if (multisucursal && (!sucursalesMultisucursal || sucursalesMultisucursal.length < 2)) {
      return res.status(400).json({ 
        success: false, 
        message: "Para servicios multisucursal debe seleccionar al menos 2 sucursales" 
      });
    }

    // Validar que las sucursales multisucursal estén dentro de las disponibles
    if (multisucursal) {
      const invalidSucursales = sucursalesMultisucursal.filter(
        sucursalId => !sucursales.includes(sucursalId)
      );
      
      if (invalidSucursales.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: "Las sucursales multisucursal deben estar entre las sucursales disponibles" 
        });
      }
    }

    const updatedService = await servicesService.updateService(id, {
      name,
      price,
      maxEntries,
      sucursales,
      multisucursal: multisucursal || false,
      sucursalesMultisucursal: multisucursal ? sucursalesMultisucursal : []
    });
    
    res.json(updatedService);
  } catch (error) {
    console.error("Error en updateService:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Error interno del servidor" 
    });
  }
};

const deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    await servicesService.deleteService(id);
    res.json({ success: true, message: "Servicio eliminado correctamente" });
  } catch (error) {
    console.error("Error en deleteService:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Error interno del servidor" 
    });
  }
};

const toggleServiceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedService = await servicesService.toggleServiceStatus(id);
    res.json(updatedService);
  } catch (error) {
    console.error("Error en toggleServiceStatus:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Error interno del servidor" 
    });
  }
};

module.exports = {
  getAllServices,
  getSucursales,
  createService,
  updateService,
  deleteService,
  toggleServiceStatus
};