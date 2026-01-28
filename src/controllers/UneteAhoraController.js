const UneteAhoraService = require("../services/UneteAhoraService");

class UneteAhoraController {
  // Buscar usuario por CI
  static async buscarUsuarioPorCI(req, res) {
    try {
      const { ci } = req.params;

      if (!ci) {
        return res.status(400).json({ error: "CI es requerido" });
      }

      const usuario = await UneteAhoraService.buscarUsuarioPorCI(ci);

      if (!usuario) {
        return res.status(404).json({
          encontrado: false,
          mensaje: "Usuario no encontrado",
        });
      }

      res.json({
        encontrado: true,
        usuario,
      });
    } catch (error) {
      console.error("Error en buscarUsuarioPorCI:", error);
      res.status(500).json({
        error: "Error al buscar usuario",
        detalles: error.message,
      });
    }
  }

  // Registrar nuevo usuario
  static async registrarUsuario(req, res) {
    try {
      const usuarioData = req.body;

      // Validar datos requeridos
      if (
        !usuarioData.ci ||
        !usuarioData.nombre ||
        !usuarioData.apellido ||
        !usuarioData.celular ||
        !usuarioData.fechaNacimiento
      ) {
        return res
          .status(400)
          .json({ error: "Todos los campos son requeridos" });
      }

      const result = await UneteAhoraService.registrarUsuario(usuarioData);
      res.json(result);
    } catch (error) {
      console.error("Error en registrarUsuario:", error);
      res.status(500).json({
        error: "Error al registrar usuario",
        detalles: error.message,
      });
    }
  }
}

module.exports = UneteAhoraController;
