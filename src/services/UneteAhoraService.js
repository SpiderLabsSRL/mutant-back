const { query, pool } = require("../../db");

class UneteAhoraService {
  // Buscar usuario por CI
  static async buscarUsuarioPorCI(ci) {
    try {
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
           AND i.estado = 1
         ORDER BY i.fecha_vencimiento DESC, i.id DESC`,
        [persona.id],
      );

      const todasInscripciones = inscripcionesResult.rows;

      if (todasInscripciones.length === 0) {
        return {
          id: persona.id,
          ci: persona.ci,
          nombre: persona.nombres,
          apellido: persona.apellidos,
          celular: persona.telefono || "",
          fechaNacimiento: persona.fecha_nacimiento,
          inscripciones: [],
          tieneInscripcionActiva: false,
          ultimasInscripciones: [],
        };
      }

      const inscripcionesPorServicio = new Map();

      todasInscripciones.forEach((inscripcion) => {
        const servicioId = inscripcion.servicio_id;

        if (!inscripcionesPorServicio.has(servicioId)) {
          inscripcionesPorServicio.set(servicioId, inscripcion);
        } else {
          const existente = inscripcionesPorServicio.get(servicioId);
          const fechaExistente = new Date(existente.fecha_vencimiento);
          const fechaNueva = new Date(inscripcion.fecha_vencimiento);

          if (fechaNueva > fechaExistente) {
            inscripcionesPorServicio.set(servicioId, inscripcion);
          }
        }
      });

      const ultimasInscripciones = Array.from(
        inscripcionesPorServicio.values(),
      ).sort(
        (a, b) => new Date(b.fecha_vencimiento) - new Date(a.fecha_vencimiento),
      );

      const hoy = new Date();
      let tieneInscripcionActiva = false;
      const inscripcionesConEstado = ultimasInscripciones.map((inscripcion) => {
        const vencimiento = new Date(inscripcion.fecha_vencimiento);
        const activa = vencimiento >= hoy;

        if (activa) {
          tieneInscripcionActiva = true;
        }

        return {
          ...inscripcion,
          activa: activa,
          dias_restantes: Math.ceil(
            (vencimiento - hoy) / (1000 * 60 * 60 * 24),
          ),
        };
      });

      return {
        id: persona.id,
        ci: persona.ci,
        nombre: persona.nombres,
        apellido: persona.apellidos,
        celular: persona.telefono || "",
        fechaNacimiento: persona.fecha_nacimiento,
        inscripciones: todasInscripciones,
        tieneInscripcionActiva: tieneInscripcionActiva,
        ultimasInscripciones: inscripcionesConEstado,
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

      // Validar fecha de nacimiento SOLO si fue proporcionada
      if (data.fechaNacimiento && data.fechaNacimiento.trim() !== "") {
        const fechaNac = new Date(data.fechaNacimiento);
        const hoy = new Date();
        
        if (isNaN(fechaNac.getTime())) {
          await client.query("ROLLBACK");
          return {
            success: false,
            mensaje: "Formato de fecha de nacimiento inválido",
          };
        }

        if (fechaNac > hoy) {
          await client.query("ROLLBACK");
          return {
            success: false,
            mensaje: "La fecha de nacimiento no puede ser futura",
          };
        }

        // Validar edad mínima (8 años)
        let edad = hoy.getFullYear() - fechaNac.getFullYear();
        const mes = hoy.getMonth() - fechaNac.getMonth();
        if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNac.getDate())) {
          edad--;
        }
        
        if (edad < 8) {
          await client.query("ROLLBACK");
          return {
            success: false,
            mensaje: "Debes tener al menos 8 años para registrarte",
          };
        }

        // Validar edad máxima (120 años)
        if (edad > 120) {
          await client.query("ROLLBACK");
          return {
            success: false,
            mensaje: "Por favor, verifica tu fecha de nacimiento",
          };
        }
      }

      const personaExistente = await client.query(
        `SELECT id, estado FROM personas WHERE ci = $1`,
        [data.ci],
      );

      if (personaExistente.rows.length > 0) {
        const persona = personaExistente.rows[0];

        if (persona.estado === 0) {
          // Si la fecha no está presente, mantener la existente o usar null
          const fechaNacimiento = data.fechaNacimiento && data.fechaNacimiento.trim() !== "" 
            ? data.fechaNacimiento 
            : null;

          await client.query(
            `UPDATE personas 
             SET nombres = $1, apellidos = $2, telefono = $3, 
                 fecha_nacimiento = COALESCE($4, fecha_nacimiento), estado = 1
             WHERE id = $5`,
            [
              data.nombre,
              data.apellido,
              data.celular,
              fechaNacimiento,
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
          await client.query("ROLLBACK");
          return {
            success: false,
            mensaje: "El usuario ya está registrado en el sistema",
          };
        }
      }

      // Crear nueva persona - fecha_nacimiento puede ser null si no se proporcionó
      const fechaNacimiento = data.fechaNacimiento && data.fechaNacimiento.trim() !== "" 
        ? data.fechaNacimiento 
        : null;

      const personaResult = await client.query(
        `INSERT INTO personas (nombres, apellidos, ci, telefono, fecha_nacimiento, estado)
         VALUES ($1, $2, $3, $4, $5, 0)
         RETURNING id`,
        [
          data.nombre,
          data.apellido,
          data.ci,
          data.celular,
          fechaNacimiento,
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