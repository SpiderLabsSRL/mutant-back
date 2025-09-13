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

// MODIFICADO: Ahora acepta sucursalId como parámetro de consulta
exports.getActiveSubscriptions = async (req, res) => {
  try {
    const { personaId } = req.params;
    const { sucursalId } = req.query; // Nuevo parámetro
    
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
    
    // Manejar específicamente el error de persona existente
    if (error.message === "La persona ya existe") {
      return res.status(409).json({ 
        message: error.message,
        existingPerson: error.existingPerson 
      });
    }
    
    res.status(500).json({ message: error.message });
  }
};