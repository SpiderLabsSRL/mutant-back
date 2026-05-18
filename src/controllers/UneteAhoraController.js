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

      // Validar campos requeridos (fechaNacimiento es opcional)
      if (
        !usuarioData.ci ||
        !usuarioData.nombre ||
        !usuarioData.apellido ||
        !usuarioData.celular
      ) {
        return res.status(400).json({ 
          error: "Los campos CI, Nombre, Apellido y Celular son requeridos",
          camposFaltantes: {
            ci: !usuarioData.ci,
            nombre: !usuarioData.nombre,
            apellido: !usuarioData.apellido,
            celular: !usuarioData.celular,
          }
        });
      }

      // Validar formato de fecha SOLO si fue proporcionada
      if (usuarioData.fechaNacimiento && usuarioData.fechaNacimiento.trim() !== "") {
        const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!fechaRegex.test(usuarioData.fechaNacimiento)) {
          return res.status(400).json({
            error: "Formato de fecha inválido. Use YYYY-MM-DD"
          });
        }
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