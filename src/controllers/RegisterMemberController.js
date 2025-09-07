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
    const subscriptions = await RegisterMemberService.getActiveSubscriptions(personaId);
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
    res.status(500).json({ message: error.message });
  }
};