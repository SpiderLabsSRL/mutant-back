const { query, pool } = require("../../db");

class UneteAhoraService {
  // Buscar usuario por CI
  static async buscarUsuarioPorCI(ci) {
    try {
      // Buscar persona por CI
      const personaResult = await query(
        `SELECT p.id, p.nombres, p.apellidos, p.ci, p.telefono, p.fecha_nacimiento
         FROM personas p
         WHERE p.ci = $1`,
        [ci]
      );

      if (personaResult.rows.length === 0) {
        return null;
      }

      const persona = personaResult.rows[0];

      return {
        id: persona.id,
        ci: persona.ci,
        nombre: persona.nombres,
        apellido: persona.apellidos,
        celular: persona.telefono || '',
        fechaNacimiento: persona.fecha_nacimiento,
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
      await client.query('BEGIN');

      // Verificar si la persona ya existe
      const personaExistente = await client.query(
        `SELECT id FROM personas WHERE ci = $1`,
        [data.ci]
      );

      if (personaExistente.rows.length > 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          mensaje: "El usuario ya está registrado en el sistema"
        };
      }

      // Crear nueva persona
      const personaResult = await client.query(
        `INSERT INTO personas (nombres, apellidos, ci, telefono, fecha_nacimiento)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [data.nombre, data.apellido, data.ci, data.celular, data.fechaNacimiento]
      );

      const personaId = personaResult.rows[0].id;

      await client.query('COMMIT');

      return {
        success: true,
        mensaje: "Usuario registrado exitosamente",
        usuarioId: personaId
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error("Error en registrarUsuario:", error);
      
      // Si es error de duplicado de CI
      if (error.code === '23505') {
        return {
          success: false,
          mensaje: "El CI ingresado ya está registrado en el sistema"
        };
      }
      
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = UneteAhoraService;