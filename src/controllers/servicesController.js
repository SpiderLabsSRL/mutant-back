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
    const { name, price, maxEntries, sucursales } = req.body;
    
    if (!name || !price || !maxEntries || !sucursales || sucursales.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Todos los campos son obligatorios, incluyendo al menos una sucursal" 
      });
    }

    const newService = await servicesService.createService({
      name,
      price,
      maxEntries,
      sucursales
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
    const { name, price, maxEntries, sucursales } = req.body;
    
    if (!name || !price || !maxEntries || !sucursales || sucursales.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Todos los campos son obligatorios, incluyendo al menos una sucursal" 
      });
    }

    const updatedService = await servicesService.updateService(id, {
      name,
      price,
      maxEntries,
      sucursales
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