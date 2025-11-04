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

const createService = async (req, res) => {
  try {
    const {
      name,
      price,
      maxEntries,
      sucursales,
      multisucursal,
      sucursalesMultisucursal,
      tipoDuracion,
      cantidadDuracion,
    } = req.body;

    if (!name || !price || !sucursales || sucursales.length === 0 || !tipoDuracion || !cantidadDuracion) {
      return res.status(400).json({
        success: false,
        message:
          "Todos los campos son obligatorios, incluyendo al menos una sucursal, tipo de duración y cantidad",
      });
    }

    // Validar que si no es ilimitado, debe tener maxEntries
    if (maxEntries !== null && maxEntries <= 0) {
      return res.status(400).json({
        success: false,
        message: "El número de ingresos debe ser mayor a 0",
      });
    }

    // Validar tipo de duración
    if (!['dias', 'meses'].includes(tipoDuracion)) {
      return res.status(400).json({
        success: false,
        message: "El tipo de duración debe ser 'dias' o 'meses'",
      });
    }

    // Validar cantidad de duración
    if (cantidadDuracion <= 0) {
      return res.status(400).json({
        success: false,
        message: "La cantidad de duración debe ser mayor a 0",
      });
    }

    if (
      multisucursal &&
      (!sucursalesMultisucursal || sucursalesMultisucursal.length < 2)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Para servicios multisucursal debe seleccionar al menos 2 sucursales",
      });
    }

    // Validar que las sucursales multisucursal estén dentro de las disponibles
    if (multisucursal) {
      const invalidSucursales = sucursalesMultisucursal.filter(
        (sucursalId) => !sucursales.includes(sucursalId)
      );

      if (invalidSucursales.length > 0) {
        return res.status(400).json({
          success: false,
          message:
            "Las sucursales multisucursal deben estar entre las sucursales disponibles",
        });
      }
    }

    const newService = await servicesService.createService({
      name,
      price,
      maxEntries,
      sucursales,
      multisucursal: multisucursal || false,
      sucursalesMultisucursal: multisucursal ? sucursalesMultisucursal : [],
      tipoDuracion,
      cantidadDuracion,
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
      price,
      maxEntries,
      sucursales,
      multisucursal,
      sucursalesMultisucursal,
      tipoDuracion,
      cantidadDuracion,
    } = req.body;

    if (!name || !price || !sucursales || sucursales.length === 0 || !tipoDuracion || !cantidadDuracion) {
      return res.status(400).json({
        success: false,
        message:
          "Todos los campos son obligatorios, incluyendo al menos una sucursal, tipo de duración y cantidad",
      });
    }

    // Validar que si no es ilimitado, debe tener maxEntries
    if (maxEntries !== null && maxEntries <= 0) {
      return res.status(400).json({
        success: false,
        message: "El número de ingresos debe ser mayor a 0",
      });
    }

    // Validar tipo de duración
    if (!['dias', 'meses'].includes(tipoDuracion)) {
      return res.status(400).json({
        success: false,
        message: "El tipo de duración debe ser 'dias' o 'meses'",
      });
    }

    // Validar cantidad de duración
    if (cantidadDuracion <= 0) {
      return res.status(400).json({
        success: false,
        message: "La cantidad de duración debe ser mayor a 0",
      });
    }

    if (
      multisucursal &&
      (!sucursalesMultisucursal || sucursalesMultisucursal.length < 2)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Para servicios multisucursal debe seleccionar al menos 2 sucursales",
      });
    }

    // Validar que las sucursales multisucursal estén dentro de las disponibles
    if (multisucursal) {
      const invalidSucursales = sucursalesMultisucursal.filter(
        (sucursalId) => !sucursales.includes(sucursalId)
      );

      if (invalidSucursales.length > 0) {
        return res.status(400).json({
          success: false,
          message:
            "Las sucursales multisucursal deben estar entre las sucursales disponibles",
        });
      }
    }

    const updatedService = await servicesService.updateService(id, {
      name,
      price,
      maxEntries,
      sucursales,
      multisucursal: multisucursal || false,
      sucursalesMultisucursal: multisucursal ? sucursalesMultisucursal : [],
      tipoDuracion,
      cantidadDuracion,
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
  createService,
  updateService,
  deleteService,
  toggleServiceStatus,
};