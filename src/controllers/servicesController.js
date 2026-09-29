const servicesService = require("../services/servicesService");

const getAllServices = async (req, res) => {
  try {
    const services = await servicesService.getAllServices();
    res.json(services);
  } catch (error) {
    console.error("Error en getAllServices:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error interno del servidor",
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
      message: error.message || "Error interno del servidor",
    });
  }
};

const getServiceTypes = async (req, res) => {
  try {
    const types = await servicesService.getServiceTypes();
    res.json(types);
  } catch (error) {
    console.error("Error en getServiceTypes:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error interno del servidor",
    });
  }
};

const createServiceType = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "El nombre del tipo de servicio es obligatorio",
      });
    }

    const newType = await servicesService.createServiceType(name.trim());
    res.status(201).json(newType);
  } catch (error) {
    console.error("Error en createServiceType:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error interno del servidor",
    });
  }
};

const createService = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      maxEntries,
      sucursales,
      multisucursal,
      sucursalesMultisucursal,
      tipoDuracion,
      cantidadDuracion,
      serviceType,
      hasTimeRange,
      startTime,
      endTime,
      hasSpecificDays,
      specificDays,
      requiredPeopleEnabled,
      requiredPeople,
    } = req.body;

    if (!name || !price || !sucursales || sucursales.length === 0 || !tipoDuracion || !cantidadDuracion) {
      return res.status(400).json({
        success: false,
        message: "Todos los campos son obligatorios, incluyendo al menos una sucursal, tipo de duración y cantidad",
      });
    }

    if (maxEntries !== null && maxEntries <= 0) {
      return res.status(400).json({
        success: false,
        message: "El número de ingresos debe ser mayor a 0",
      });
    }

    if (!['dias', 'meses'].includes(tipoDuracion)) {
      return res.status(400).json({
        success: false,
        message: "El tipo de duración debe ser 'dias' o 'meses'",
      });
    }

    if (cantidadDuracion <= 0) {
      return res.status(400).json({
        success: false,
        message: "La cantidad de duración debe ser mayor a 0",
      });
    }

    if (multisucursal && (!sucursalesMultisucursal || sucursalesMultisucursal.length < 2)) {
      return res.status(400).json({
        success: false,
        message: "Para servicios multisucursal debe seleccionar al menos 2 sucursales",
      });
    }

    if (multisucursal) {
      const invalidSucursales = sucursalesMultisucursal.filter(
        (sucursalId) => !sucursales.includes(sucursalId)
      );
      if (invalidSucursales.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Las sucursales multisucursal deben estar entre las sucursales disponibles",
        });
      }
    }

    const newService = await servicesService.createService({
      name,
      description,
      price,
      maxEntries,
      sucursales,
      multisucursal: multisucursal || false,
      sucursalesMultisucursal: multisucursal ? sucursalesMultisucursal : [],
      tipoDuracion,
      cantidadDuracion,
      serviceType,
      hasTimeRange,
      startTime,
      endTime,
      hasSpecificDays,
      specificDays,
      requiredPeopleEnabled,
      requiredPeople,
    });

    res.status(201).json(newService);
  } catch (error) {
    console.error("Error en createService:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error interno del servidor",
    });
  }
};

const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      price,
      maxEntries,
      sucursales,
      multisucursal,
      sucursalesMultisucursal,
      tipoDuracion,
      cantidadDuracion,
      serviceType,
      hasTimeRange,
      startTime,
      endTime,
      hasSpecificDays,
      specificDays,
      requiredPeopleEnabled,
      requiredPeople,
    } = req.body;

    if (!name || !price || !sucursales || sucursales.length === 0 || !tipoDuracion || !cantidadDuracion) {
      return res.status(400).json({
        success: false,
        message: "Todos los campos son obligatorios, incluyendo al menos una sucursal, tipo de duración y cantidad",
      });
    }

    if (maxEntries !== null && maxEntries <= 0) {
      return res.status(400).json({
        success: false,
        message: "El número de ingresos debe ser mayor a 0",
      });
    }

    if (!['dias', 'meses'].includes(tipoDuracion)) {
      return res.status(400).json({
        success: false,
        message: "El tipo de duración debe ser 'dias' o 'meses'",
      });
    }

    if (cantidadDuracion <= 0) {
      return res.status(400).json({
        success: false,
        message: "La cantidad de duración debe ser mayor a 0",
      });
    }

    if (multisucursal && (!sucursalesMultisucursal || sucursalesMultisucursal.length < 2)) {
      return res.status(400).json({
        success: false,
        message: "Para servicios multisucursal debe seleccionar al menos 2 sucursales",
      });
    }

    if (multisucursal) {
      const invalidSucursales = sucursalesMultisucursal.filter(
        (sucursalId) => !sucursales.includes(sucursalId)
      );
      if (invalidSucursales.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Las sucursales multisucursal deben estar entre las sucursales disponibles",
        });
      }
    }

    const updatedService = await servicesService.updateService(id, {
      name,
      description,
      price,
      maxEntries,
      sucursales,
      multisucursal: multisucursal || false,
      sucursalesMultisucursal: multisucursal ? sucursalesMultisucursal : [],
      tipoDuracion,
      cantidadDuracion,
      serviceType,
      hasTimeRange,
      startTime,
      endTime,
      hasSpecificDays,
      specificDays,
      requiredPeopleEnabled,
      requiredPeople,
    });

    res.json(updatedService);
  } catch (error) {
    console.error("Error en updateService:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error interno del servidor",
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
      message: error.message || "Error interno del servidor",
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
      message: error.message || "Error interno del servidor",
    });
  }
};

module.exports = {
  getAllServices,
  getSucursales,
  getServiceTypes,
  createServiceType,
  createService,
  updateService,
  deleteService,
  toggleServiceStatus,
};