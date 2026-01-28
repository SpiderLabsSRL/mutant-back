const { query, pool } = require("../../db");

class UneteAhoraService {
  // Buscar usuario por CI
  static async buscarUsuarioPorCI(ci) {
    try {
      // Buscar persona por CI - SOLO si no está eliminado (estado != 0)
      const personaResult = await query(
        `SELECT p.id, p.nombres, p.apellidos, p.ci, p.telefono, p.fecha_nacimiento
         FROM personas p
         WHERE p.ci = $1 AND p.estado != 1`,
        [ci],
      );

      if (personaResult.rows.length === 0) {
        return null;
      }

      const persona = personaResult.rows[0];

      // Buscar inscripciones activas (estado = 1) de la persona
      const inscripcionesResult = await query(
        `SELECT 
          i.id,
          i.servicio_id,
          s.nombre as servicio_nombre,
          i.fecha_inicio,
          i.fecha_vencimiento,
          i.ingresos_disponibles,
          i.sucursal_id,
          su.nombre as sucursal_nombre,
          i.estado
         FROM inscripciones i
         JOIN servicios s ON i.servicio_id = s.id
         JOIN sucursales su ON i.sucursal_id = su.id
         WHERE i.persona_id = $1 
           AND i.estado = 1 -- Solo inscripciones activas
         ORDER BY i.fecha_vencimiento DESC, i.id DESC`, // Ordenar por fecha de vencimiento y ID para obtener la última
        [persona.id],
      );

      const inscripciones = inscripcionesResult.rows;

      // Obtener la última inscripción (la más reciente)
      let ultimaInscripcion = null;
      if (inscripciones.length > 0) {
        ultimaInscripcion = inscripciones[0]; // Primera fila por ORDER BY DESC
      }

      // Determinar si tiene inscripción activa (vencimiento >= hoy)
      let tieneInscripcionActiva = false;
      if (ultimaInscripcion) {
        const hoy = new Date();
        const vencimiento = new Date(ultimaInscripcion.fecha_vencimiento);
        tieneInscripcionActiva = vencimiento >= hoy;
      }

      return {
        id: persona.id,
        ci: persona.ci,
        nombre: persona.nombres,
        apellido: persona.apellidos,
        celular: persona.telefono || "",
        fechaNacimiento: persona.fecha_nacimiento,
        inscripciones: inscripciones,
        tieneInscripcionActiva: tieneInscripcionActiva,
        ultimaInscripcion: ultimaInscripcion,
      };
    } catch (error) {
      console.error("Error en buscarUsuarioPorCI:", error);
      throw error;
    }
  }

  // Registrar nuevo usuario
  static async registrarUsuario(data) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Verificar si la persona ya existe y no está eliminada
      const personaExistente = await client.query(
        `SELECT id, estado FROM personas WHERE ci = $1`,
        [data.ci],
      );

      if (personaExistente.rows.length > 0) {
        const persona = personaExistente.rows[0];

        // Si el usuario existe pero está eliminado (estado = 0)
        if (persona.estado === 0) {
          // Reactivar el usuario
          await client.query(
            `UPDATE personas 
             SET nombres = $1, apellidos = $2, telefono = $3, 
                 fecha_nacimiento = $4, estado = 1
             WHERE id = $5`,
            [
              data.nombre,
              data.apellido,
              data.celular,
              data.fechaNacimiento,
              persona.id,
            ],
          );

          await client.query("COMMIT");

          return {
            success: true,
            mensaje: "Usuario reactivado exitosamente",
            usuarioId: persona.id,
          };
        } else {
          // Si ya existe y no está eliminado
          await client.query("ROLLBACK");
          return {
            success: false,
            mensaje: "El usuario ya está registrado en el sistema",
          };
        }
      }

      // Crear nueva persona
      const personaResult = await client.query(
        `INSERT INTO personas (nombres, apellidos, ci, telefono, fecha_nacimiento, estado)
         VALUES ($1, $2, $3, $4, $5, 0)
         RETURNING id`,
        [
          data.nombre,
          data.apellido,
          data.ci,
          data.celular,
          data.fechaNacimiento,
        ],
      );

      const personaId = personaResult.rows[0].id;

      await client.query("COMMIT");

      return {
        success: true,
        mensaje: "Usuario registrado exitosamente",
        usuarioId: personaId,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error en registrarUsuario:", error);

      // Si es error de duplicado de CI
      if (error.code === "23505") {
        return {
          success: false,
          mensaje: "El CI ingresado ya está registrado en el sistema",
        };
      }

      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = UneteAhoraService;
