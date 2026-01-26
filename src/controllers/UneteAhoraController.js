const UneteAhoraService = require("../services/UneteAhoraService");

class UneteAhoraController {
  // Obtener todas las sucursales activas
  static async getSucursales(req, res) {
    try {
      console.log("Solicitando sucursales...");
      const sucursales = await UneteAhoraService.getSucursales();
      console.log("Sucursales obtenidas:", sucursales.length);
      res.json(sucursales);
    } catch (error) {
      console.error("Error en getSucursales:", error);
      res.status(500).json({ 
        error: "Error al obtener sucursales",
        detalles: error.message 
      });
    }
  }

  // Obtener todos los planes activos
  static async getPlanes(req, res) {
    try {
      console.log("Solicitando planes...");
      const planes = await UneteAhoraService.getPlanes();
      console.log("Planes obtenidos:", planes.length);
      res.json(planes);
    } catch (error) {
      console.error("Error en getPlanes:", error);
      res.status(500).json({ 
        error: "Error al obtener planes",
        detalles: error.message 
      });
    }
  }

  // Buscar usuario por CI
  static async buscarUsuarioPorCI(req, res) {
    try {
      const { ci } = req.params;
      console.log("Buscando usuario con CI:", ci);
      
      if (!ci) {
        return res.status(400).json({ error: "CI es requerido" });
      }

      const usuario = await UneteAhoraService.buscarUsuarioPorCI(ci);
      
      if (!usuario) {
        console.log("Usuario no encontrado para CI:", ci);
        return res.status(404).json({ 
          encontrado: false, 
          mensaje: "Usuario no encontrado" 
        });
      }

      console.log("Usuario encontrado:", usuario.nombre);
      res.json({
        encontrado: true,
        usuario
      });
    } catch (error) {
      console.error("Error en buscarUsuarioPorCI:", error);
      res.status(500).json({ 
        error: "Error al buscar usuario",
        detalles: error.message 
      });
    }
  }

  // Obtener último ingreso de una persona
  static async obtenerUltimoIngreso(req, res) {
    try {
      const { personaId } = req.params;
      const ultimoIngreso = await UneteAhoraService.obtenerUltimoIngreso(personaId);
      res.json({ ultimoIngreso });
    } catch (error) {
      console.error("Error en obtenerUltimoIngreso:", error);
      res.status(500).json({ 
        error: "Error al obtener último ingreso",
        detalles: error.message 
      });
    }
  }

  // Verificar disponibilidad de plan en sucursal
  static async verificarDisponibilidadPlan(req, res) {
    try {
      const { servicioId, sucursalId } = req.params;
      const disponible = await UneteAhoraService.verificarDisponibilidadPlan(servicioId, sucursalId);
      res.json({ disponible });
    } catch (error) {
      console.error("Error en verificarDisponibilidadPlan:", error);
      res.status(500).json({ 
        error: "Error al verificar disponibilidad",
        detalles: error.message 
      });
    }
  }

  // Crear nueva inscripción
  static async crearInscripcion(req, res) {
    try {
      const inscripcionData = req.body;
      console.log("Creando inscripción:", inscripcionData);
      
      // Validar datos requeridos
      if (!inscripcionData.ci || !inscripcionData.nombre || !inscripcionData.apellido || 
          !inscripcionData.celular || !inscripcionData.fechaNacimiento || 
          !inscripcionData.sucursalId || !inscripcionData.planes || inscripcionData.planes.length === 0) {
        return res.status(400).json({ error: "Todos los campos son requeridos" });
      }

      const result = await UneteAhoraService.crearInscripcion(inscripcionData);
      res.json(result);
    } catch (error) {
      console.error("Error en crearInscripcion:", error);
      res.status(500).json({ 
        error: "Error al crear inscripción",
        detalles: error.message 
      });
    }
  }

  // Renovar inscripción existente
  static async renovarInscripcion(req, res) {
    try {
      const renovacionData = req.body;
      console.log("Renovando inscripción:", renovacionData);
      
      if (!renovacionData.personaId || !renovacionData.sucursalId || 
          !renovacionData.planes || renovacionData.planes.length === 0) {
        return res.status(400).json({ error: "Datos incompletos para renovación" });
      }

      const result = await UneteAhoraService.renovarInscripcion(renovacionData);
      res.json(result);
    } catch (error) {
      console.error("Error en renovarInscripcion:", error);
      res.status(500).json({ 
        error: "Error al renovar inscripción",
        detalles: error.message 
      });
    }
  }
}

module.exports = UneteAhoraController;