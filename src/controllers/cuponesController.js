const cuponesService = require("../services/cuponesService");

// ============================================
// GET CUPONES
// ============================================
const getCupones = async (req, res) => {
  try {
    const cupones = await cuponesService.getAllCupones();
    res.json(cupones);
  } catch (error) {
    console.error("Error en getCupones:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error interno del servidor",
    });
  }
};

// ============================================
// GET SUCURSALES
// ============================================
const getSucursales = async (req, res) => {
  try {
    const sucursales = await cuponesService.getSucursales();
    res.json(sucursales);
  } catch (error) {
    console.error("Error en getSucursales:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error interno del servidor",
    });
  }
};

// ============================================
// CREATE CUPON
// ============================================
const createCupon = async (req, res) => {
  try {
    const {
      codigo,
      tipo,
      valor,
      descripcion,
      fechaInicio,
      fechaExpiracion,
      usosMaximos,
      aplicableA,
      sucursalesIds,
    } = req.body;

    // Validaciones
    if (!codigo || !tipo || !valor || !fechaExpiracion) {
      return res.status(400).json({
        success: false,
        message: "Código, tipo, valor y fecha de expiración son obligatorios",
      });
    }

    if (!["porcentaje", "monto_fijo"].includes(tipo)) {
      return res.status(400).json({
        success: false,
        message: "El tipo debe ser 'porcentaje' o 'monto_fijo'",
      });
    }

    if (parseFloat(valor) <= 0) {
      return res.status(400).json({
        success: false,
        message: "El valor debe ser mayor a 0",
      });
    }

    if (tipo === "porcentaje" && parseFloat(valor) > 100) {
      return res.status(400).json({
        success: false,
        message: "El porcentaje no puede ser mayor a 100",
      });
    }

    if (!sucursalesIds || sucursalesIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Debe seleccionar al menos una sucursal",
      });
    }

    const newCupon = await cuponesService.createCupon({
      codigo: codigo.toUpperCase(),
      tipo,
      valor,
      descripcion,
      fechaInicio,
      fechaExpiracion,
      usosMaximos,
      aplicableA: aplicableA && aplicableA.length > 0
        ? aplicableA
        : ["servicios", "productos"],
      sucursalesIds,
    });

    res.status(201).json(newCupon);
  } catch (error) {
    console.error("Error en createCupon:", error);
    if (
      error.message.includes(
        'duplicate key value violates unique constraint "cupones_codigo_key"'
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "El código del cupón ya existe",
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || "Error interno del servidor",
    });
  }
};

// ============================================
// UPDATE CUPON
// ============================================
const updateCupon = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      codigo,
      tipo,
      valor,
      descripcion,
      fechaInicio,
      fechaExpiracion,
      usosMaximos,
      aplicableA,
      sucursalesIds,
    } = req.body;

    if (!codigo || !tipo || !valor || !fechaExpiracion) {
      return res.status(400).json({
        success: false,
        message: "Código, tipo, valor y fecha de expiración son obligatorios",
      });
    }

    if (!["porcentaje", "monto_fijo"].includes(tipo)) {
      return res.status(400).json({
        success: false,
        message: "El tipo debe ser 'porcentaje' o 'monto_fijo'",
      });
    }

    if (parseFloat(valor) <= 0) {
      return res.status(400).json({
        success: false,
        message: "El valor debe ser mayor a 0",
      });
    }

    if (tipo === "porcentaje" && parseFloat(valor) > 100) {
      return res.status(400).json({
        success: false,
        message: "El porcentaje no puede ser mayor a 100",
      });
    }

    if (!sucursalesIds || sucursalesIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Debe seleccionar al menos una sucursal",
      });
    }

    const updatedCupon = await cuponesService.updateCupon(id, {
      codigo: codigo.toUpperCase(),
      tipo,
      valor,
      descripcion,
      fechaInicio,
      fechaExpiracion,
      usosMaximos,
      aplicableA: aplicableA && aplicableA.length > 0
        ? aplicableA
        : ["servicios", "productos"],
      sucursalesIds,
    });

    res.json(updatedCupon);
  } catch (error) {
    console.error("Error en updateCupon:", error);
    if (
      error.message.includes(
        'duplicate key value violates unique constraint "cupones_codigo_key"'
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "El código del cupón ya existe",
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || "Error interno del servidor",
    });
  }
};

// ============================================
// DELETE CUPON (soft delete)
// ============================================
const deleteCupon = async (req, res) => {
  try {
    const { id } = req.params;
    await cuponesService.deleteCupon(id);
    res.status(204).send();
  } catch (error) {
    console.error("Error en deleteCupon:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error interno del servidor",
    });
  }
};

// ============================================
// TOGGLE STATUS
// ============================================
const toggleCuponStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedCupon = await cuponesService.toggleCuponStatus(id);
    res.json(updatedCupon);
  } catch (error) {
    console.error("Error en toggleCuponStatus:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error interno del servidor",
    });
  }
};

module.exports = {
  getCupones,
  getSucursales,
  createCupon,
  updateCupon,
  deleteCupon,
  toggleCuponStatus,
};