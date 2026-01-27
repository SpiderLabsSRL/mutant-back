const { query, pool } = require("../../db"); // Asegúrate de importar pool

class UneteAhoraService {
  // Obtener sucursales activas
  static async getSucursales() {
    try {
      const result = await query(
        "SELECT id, nombre, estado FROM sucursales WHERE estado = 1 ORDER BY nombre"
      );
      return result.rows;
    } catch (error) {
      console.error("Error en getSucursales:", error);
      throw error;
    }
  }

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

      // Buscar sucursal de la última inscripción o empleado
      let sucursalId = null;
      let sucursalNombre = null;

      // Intentar obtener de la última inscripción
      const inscripcionResult = await query(
        `SELECT s.id as sucursal_id, s.nombre as sucursal_nombre
         FROM inscripciones i
         JOIN sucursales s ON i.sucursal_id = s.id
         WHERE i.persona_id = $1
         ORDER BY i.fecha_inicio DESC
         LIMIT 1`,
        [persona.id]
      );

      if (inscripcionResult.rows.length > 0) {
        sucursalId = inscripcionResult.rows[0].sucursal_id;
        sucursalNombre = inscripcionResult.rows[0].sucursal_nombre;
      } else {
        // Intentar obtener si es empleado
        const empleadoResult = await query(
          `SELECT s.id as sucursal_id, s.nombre as sucursal_nombre
           FROM empleados e
           JOIN sucursales s ON e.sucursal_id = s.id
           WHERE e.persona_id = $1
           LIMIT 1`,
          [persona.id]
        );

        if (empleadoResult.rows.length > 0) {
          sucursalId = empleadoResult.rows[0].sucursal_id;
          sucursalNombre = empleadoResult.rows[0].sucursal_nombre;
        } else {
          // Usar Bunker como default
          sucursalNombre = "Bunker";
          const bunkerResult = await query(
            "SELECT id FROM sucursales WHERE LOWER(nombre) LIKE '%bunker%' LIMIT 1"
          );
          sucursalId = bunkerResult.rows.length > 0 ? bunkerResult.rows[0].id : 1;
        }
      }

      return {
        id: persona.id,
        ci: persona.ci,
        nombre: persona.nombres,
        apellido: persona.apellidos,
        celular: persona.telefono || '',
        fechaNacimiento: persona.fecha_nacimiento,
        sucursal: sucursalNombre.toLowerCase(),
        sucursalId: sucursalId,
        sucursalNombre: sucursalNombre
      };
    } catch (error) {
      console.error("Error en buscarUsuarioPorCI:", error);
      throw error;
    }
  }

  // Registrar nuevo usuario
  static async registrarUsuario(data) {
    const client = await pool.connect(); // Usar pool.connect() en lugar de query.getClient()
    
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