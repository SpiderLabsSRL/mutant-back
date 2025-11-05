// controllers/PendientesController.js
const PendientesService = require("../services/PendientesService");

// Obtener todos los pagos pendientes
exports.getPagosPendientes = async (req, res) => {
  try {
    const pagos = await PendientesService.getPagosPendientes();
    res.json(pagos);
  } catch (error) {
    console.error("Error in getPagosPendientes:", error);
    res.status(500).json({ message: error.message });
  }
};

// Registrar un pago
exports.registrarPago = async (req, res) => {
  try {
    const { pagoId } = req.params;
    const pagoData = req.body;
    
    if (!pagoData.montoPagado || pagoData.montoPagado <= 0) {
      return res.status(400).json({ message: "Monto pagado debe ser mayor a 0" });
    }
    
    if (!pagoData.formaPago || !['efectivo', 'qr', 'mixto'].includes(pagoData.formaPago)) {
      return res.status(400).json({ message: "Forma de pago inválida" });
    }
    
    if (!pagoData.cajaId || !pagoData.empleadoId || !pagoData.sucursalId) {
      return res.status(400).json({ message: "Datos de usuario incompletos" });
    }
    
    const result = await PendientesService.registrarPago(pagoId, pagoData);
    res.json(result);
  } catch (error) {
    console.error("Error in registrarPago:", error);
    res.status(500).json({ message: error.message });
  }
};

// Cancelar pago pendiente
exports.cancelarPagoPendiente = async (req, res) => {
  try {
    const { pagoId } = req.params;
    
    const result = await PendientesService.cancelarPagoPendiente(pagoId);
    res.json(result);
  } catch (error) {
    console.error("Error in cancelarPagoPendiente:", error);
    res.status(500).json({ message: error.message });
  }
};