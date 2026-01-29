// src/controllers/sidebarPasswordController.js
const passwordService = require("../services/sidebarPasswordService");

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, userId } = req.body;

    console.log("Received password change request:", {
      userId,
      currentPassword,
      newPassword,
    });

    // Validaciones
    if (!currentPassword || !newPassword || !userId) {
      return res.status(400).json({
        success: false,
        message: "Todos los campos son obligatorios",
      });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({
        success: false,
        message: "La nueva contraseña debe tener al menos 4 caracteres",
      });
    }

    if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: "La contraseña debe contener letras y números",
      });
    }

    const result = await passwordService.changePassword(
      userId,
      currentPassword,
      newPassword,
    );

    if (result.success) {
      res.json({
        success: true,
        message: "Contraseña actualizada exitosamente",
      });
    } else {
      res.status(400).json({ success: false, message: result.message });
    }
  } catch (error) {
    console.error("Error in changePassword controller:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al cambiar la contraseña",
    });
  }
};

module.exports = {
  changePassword,
};
