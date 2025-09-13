const remindersService = require("../services/remindersservice");

const getNewMembers = async (req, res) => {
  try {
    const sucursalId = req.params.sucursalId;
    console.log("Solicitud recibida para /api/reminders/new-members/", sucursalId);
    const newMembers = await remindersService.getNewMembers(sucursalId);
    console.log("Nuevos miembros encontrados:", newMembers.length);
    res.json(newMembers);
  } catch (error) {
    console.error("Error en getNewMembers:", error);
    res.status(500).json({ 
      message: "Error al obtener nuevos miembros", 
      error: error.message 
    });
  }
};

const getExpiringMembers = async (req, res) => {
  try {
    const sucursalId = req.params.sucursalId;
    console.log("Solicitud recibida para /api/reminders/expiring-members/", sucursalId);
    const expiringMembers = await remindersService.getExpiringMembers(sucursalId);
    console.log("Miembros próximos a vencer encontrados:", expiringMembers.length);
    res.json(expiringMembers);
  } catch (error) {
    console.error("Error en getExpiringMembers:", error);
    res.status(500).json({ 
      message: "Error al obtener miembros con membresías próximas a vencer", 
      error: error.message 
    });
  }
};

const getBirthdayMembers = async (req, res) => {
  try {
    const sucursalId = req.params.sucursalId;
    console.log("Solicitud recibida para /api/reminders/birthday-members/", sucursalId);
    const birthdayMembers = await remindersService.getBirthdayMembers(sucursalId);
    console.log("Cumpleañeros encontrados:", birthdayMembers.length);
    res.json(birthdayMembers);
  } catch (error) {
    console.error("Error en getBirthdayMembers:", error);
    res.status(500).json({ 
      message: "Error al obtener miembros que cumplen años hoy", 
      error: error.message 
    });
  }
};

module.exports = {
  getNewMembers,
  getExpiringMembers,
  getBirthdayMembers
};