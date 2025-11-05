const RegisterMemberService = require("../services/RegisterMemberService");

exports.getServicesByBranch = async (req, res) => {
  try {
    const { sucursalId } = req.params;
    const services = await RegisterMemberService.getServicesByBranch(sucursalId);
    res.json(services);
  } catch (error) {
    console.error("Error in getServicesByBranch:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.searchPeople = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 3) {
      return res.json([]);
    }
    const people = await RegisterMemberService.searchPeople(q);
    res.json(people);
  } catch (error) {
    console.error("Error in searchPeople:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.getActiveSubscriptions = async (req, res) => {
  try {
    const { personaId } = req.params;
    const { sucursalId } = req.query;
    
    if (!sucursalId) {
      return res.status(400).json({ message: "sucursalId es requerido" });
    }
    
    const subscriptions = await RegisterMemberService.getActiveSubscriptions(personaId, sucursalId);
    res.json(subscriptions);
  } catch (error) {
    console.error("Error in getActiveSubscriptions:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.getCashRegisterStatus = async (req, res) => {
  try {
    const { cajaId } = req.params;
    const status = await RegisterMemberService.getCashRegisterStatus(cajaId);
    res.json(status);
  } catch (error) {
    console.error("Error in getCashRegisterStatus:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.registerMember = async (req, res) => {
  try {
    const registrationData = req.body;
    const result = await RegisterMemberService.registerMember(registrationData);
    res.json(result);
  } catch (error) {
    console.error("Error in registerMember:", error);
    
    if (error.message === "La persona ya existe") {
      return res.status(409).json({ 
        message: error.message,
        existingPerson: error.existingPerson 
      });
    }
    
    res.status(500).json({ message: error.message });
  }
};

// Obtener pagos pendientes de una persona
exports.getPagosPendientes = async (req, res) => {
  try {
    const { personaId } = req.params;
    const pagos = await RegisterMemberService.getPagosPendientes(personaId);
    res.json(pagos);
  } catch (error) {
    console.error("Error in getPagosPendientes:", error);
    res.status(500).json({ message: error.message });
  }
};

// Actualizar pago pendiente
exports.updatePagoPendiente = async (req, res) => {
  try {
    const { pagoId } = req.params;
    const { montoPagado } = req.body;
    
    if (!montoPagado || montoPagado <= 0) {
      return res.status(400).json({ message: "Monto pagado debe ser mayor a 0" });
    }
    
    const result = await RegisterMemberService.updatePagoPendiente(pagoId, montoPagado);
    res.json(result);
  } catch (error) {
    console.error("Error in updatePagoPendiente:", error);
    res.status(500).json({ message: error.message });
  }
};