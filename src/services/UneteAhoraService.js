const { query } = require("../../db");

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

  // Obtener todos los planes activos
  static async getPlanes() {
    try {
      const result = await query(
        `SELECT s.id as idservicio, s.nombre, s.precio, s.numero_ingresos, 
                s.categoria, s.estado, s.multisucursal
         FROM servicios s
         WHERE s.estado = 1 
         ORDER BY s.precio`
      );
      
      return result.rows;
    } catch (error) {
      console.error("Error en getPlanes:", error);
      throw error;
    }
  }

  // Buscar usuario por CI
  static async buscarUsuarioPorCI(ci) {
    try {
      console.log("Buscando usuario con CI:", ci);
      
      // Buscar persona por CI
      const personaResult = await query(
        `SELECT p.id, p.nombres, p.apellidos, p.ci, p.telefono, p.fecha_nacimiento
         FROM personas p
         WHERE p.ci = $1`,
        [ci]
      );

      if (personaResult.rows.length === 0) {
        console.log("No se encontró persona con CI:", ci);
        return null;
      }

      const persona = personaResult.rows[0];

      // Buscar inscripciones
      const inscripcionesResult = await query(
        `SELECT i.id, i.servicio_id, i.sucursal_id, i.fecha_inicio, 
                i.fecha_vencimiento, i.ingresos_disponibles, i.estado,
                s.nombre as servicio_nombre, s.precio, s.numero_ingresos,
                su.nombre as sucursal_nombre, su.id as sucursal_id_db
         FROM inscripciones i
         JOIN servicios s ON i.servicio_id = s.id
         JOIN sucursales su ON i.sucursal_id = su.id
         WHERE i.persona_id = $1
         ORDER BY i.fecha_vencimiento DESC`,
        [persona.id]
      );

      console.log("Inscripciones encontradas:", inscripcionesResult.rows.length);

      const hoy = new Date().toISOString().split('T')[0];
      const planesActivos = [];
      const planesVencidos = [];

      let ultimaSucursalId = null;
      let ultimaSucursalNombre = null;

      for (const insc of inscripcionesResult.rows) {
        const plan = {
          id: insc.servicio_id.toString(),
          idServicio: insc.servicio_id,
          nombre: insc.servicio_nombre,
          descripcion: this.getDescripcionPlan(insc.servicio_nombre),
          precio: parseFloat(insc.precio),
          ingresos: insc.numero_ingresos,
          duracion: insc.numero_ingresos === 1 ? "1 día" : "30 días",
          caracteristicas: this.getCaracteristicasPlan(insc.servicio_nombre, insc.numero_ingresos),
          activo: insc.estado === 1,
          fechaVencimiento: insc.fecha_vencimiento,
          sucursal: insc.sucursal_nombre.toLowerCase(),
          sucursalId: insc.sucursal_id_db,
          ingresosDisponibles: insc.ingresos_disponibles
        };

        // Guardar información de sucursal de la última inscripción
        ultimaSucursalId = insc.sucursal_id_db;
        ultimaSucursalNombre = insc.sucursal_nombre;

        const fechaVencimiento = new Date(insc.fecha_vencimiento);
        const fechaHoy = new Date(hoy);
        
        if (insc.estado === 1 && fechaVencimiento >= fechaHoy) {
          planesActivos.push(plan);
        } else {
          planesVencidos.push(plan);
        }
      }

      // Obtener último ingreso
      const ultimoIngresoResult = await query(
        `SELECT fecha, sucursal_id 
         FROM registros_acceso 
         WHERE persona_id = $1 AND estado = 'exitoso'
         ORDER BY fecha DESC 
         LIMIT 1`,
        [persona.id]
      );

      let ultimoIngreso = null;
      if (ultimoIngresoResult.rows.length > 0) {
        ultimoIngreso = ultimoIngresoResult.rows[0].fecha.toISOString().split('T')[0];
        
        // Si hay último ingreso, usar su sucursal
        if (ultimoIngresoResult.rows[0].sucursal_id) {
          const sucursalResult = await query(
            "SELECT id, nombre FROM sucursales WHERE id = $1",
            [ultimoIngresoResult.rows[0].sucursal_id]
          );
          
          if (sucursalResult.rows.length > 0) {
            ultimaSucursalId = sucursalResult.rows[0].id;
            ultimaSucursalNombre = sucursalResult.rows[0].nombre;
          }
        }
      }

      // Si no tenemos sucursal de inscripciones, buscar si tiene asignación de usuario
      if (!ultimaSucursalId) {
        const usuarioResult = await query(
          `SELECT e.sucursal_id, s.nombre 
           FROM empleados e
           JOIN sucursales s ON e.sucursal_id = s.id
           JOIN personas p ON e.persona_id = p.id
           WHERE p.ci = $1`,
          [ci]
        );
        
        if (usuarioResult.rows.length > 0) {
          ultimaSucursalId = usuarioResult.rows[0].sucursal_id;
          ultimaSucursalNombre = usuarioResult.rows[0].nombre;
        }
      }

      // Si todavía no hay sucursal, usar Bunker como default
      if (!ultimaSucursalNombre) {
        ultimaSucursalNombre = "Bunker";
        // Buscar ID de Bunker
        const bunkerResult = await query(
          "SELECT id FROM sucursales WHERE LOWER(nombre) LIKE '%bunker%' LIMIT 1"
        );
        ultimaSucursalId = bunkerResult.rows.length > 0 ? bunkerResult.rows[0].id : 1;
      }

      return {
        id: persona.id,
        ci: persona.ci,
        nombre: persona.nombres,
        apellido: persona.apellidos,
        celular: persona.telefono || '',
        fechaNacimiento: persona.fecha_nacimiento,
        sucursal: ultimaSucursalNombre.toLowerCase(),
        sucursalId: ultimaSucursalId,
        sucursalNombre: ultimaSucursalNombre, // Agregamos el nombre completo
        planesActivos,
        planesVencidos,
        ultimoIngreso
      };
    } catch (error) {
      console.error("Error en buscarUsuarioPorCI:", error);
      throw error;
    }
  }

  // Obtener último ingreso de una persona
  static async obtenerUltimoIngreso(personaId) {
    try {
      const result = await query(
        `SELECT fecha 
         FROM registros_acceso 
         WHERE persona_id = $1 AND estado = 'exitoso'
         ORDER BY fecha DESC 
         LIMIT 1`,
        [personaId]
      );
      
      return result.rows.length > 0 ? result.rows[0].fecha.toISOString().split('T')[0] : null;
    } catch (error) {
      console.error("Error en obtenerUltimoIngreso:", error);
      throw error;
    }
  }

  // Verificar disponibilidad de plan en sucursal
  static async verificarDisponibilidadPlan(servicioId, sucursalId) {
    try {
      const result = await query(
        `SELECT disponible 
         FROM servicio_sucursal 
         WHERE servicio_id = $1 AND sucursal_id = $2`,
        [servicioId, sucursalId]
      );
      
      if (result.rows.length === 0) {
        // Verificar si el servicio es multisucursal
        const servicioResult = await query(
          `SELECT multisucursal 
           FROM servicios 
           WHERE id = $1`,
          [servicioId]
        );
        
        return servicioResult.rows.length > 0 && servicioResult.rows[0].multisucursal;
      }
      
      return result.rows[0].disponible;
    } catch (error) {
      console.error("Error en verificarDisponibilidadPlan:", error);
      throw error;
    }
  }

  // Crear nueva inscripción
  static async crearInscripcion(data) {
    const client = await query.getClient();
    
    try {
      await client.query('BEGIN');

      // Verificar si la persona ya existe
      let personaResult = await client.query(
        `SELECT id FROM personas WHERE ci = $1`,
        [data.ci]
      );

      let personaId;
      if (personaResult.rows.length > 0) {
        // Actualizar datos de la persona existente
        personaId = personaResult.rows[0].id;
        await client.query(
          `UPDATE personas 
           SET nombres = $1, apellidos = $2, telefono = $3, fecha_nacimiento = $4
           WHERE id = $5`,
          [data.nombre, data.apellido, data.celular, data.fechaNacimiento, personaId]
        );
      } else {
        // Crear nueva persona
        personaResult = await client.query(
          `INSERT INTO personas (nombres, apellidos, ci, telefono, fecha_nacimiento)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [data.nombre, data.apellido, data.ci, data.celular, data.fechaNacimiento]
        );
        personaId = personaResult.rows[0].id;
      }

      // Crear inscripciones para cada plan
      const inscripcionesCreadas = [];
      const hoy = new Date();
      
      for (const plan of data.planes) {
        // Calcular fecha de vencimiento (30 días desde hoy para membresías)
        const fechaVencimiento = new Date(hoy);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);

        const inscripcionResult = await client.query(
          `INSERT INTO inscripciones 
           (persona_id, servicio_id, sucursal_id, fecha_inicio, fecha_vencimiento, ingresos_disponibles, estado)
           VALUES ($1, $2, $3, $4, $5, $6, 1)
           RETURNING id, fecha_vencimiento`,
          [
            personaId,
            plan.servicioId,
            data.sucursalId,
            hoy.toISOString().split('T')[0],
            fechaVencimiento.toISOString().split('T')[0],
            plan.ingresos
          ]
        );

        inscripcionesCreadas.push({
          id: inscripcionResult.rows[0].id,
          servicioId: plan.servicioId,
          fechaVencimiento: inscripcionResult.rows[0].fecha_vencimiento
        });
      }

      await client.query('COMMIT');

      return {
        success: true,
        mensaje: "Inscripción completada exitosamente",
        inscripciones: inscripcionesCreadas
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error("Error en crearInscripcion:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Renovar inscripción existente
  static async renovarInscripcion(data) {
    const client = await query.getClient();
    
    try {
      await client.query('BEGIN');

      const inscripcionesCreadas = [];
      const hoy = new Date();

      for (const plan of data.planes) {
        // Calcular fecha de vencimiento
        const fechaVencimiento = new Date(hoy);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + 30);

        // Crear nueva inscripción
        const inscripcionResult = await client.query(
          `INSERT INTO inscripciones 
           (persona_id, servicio_id, sucursal_id, fecha_inicio, fecha_vencimiento, ingresos_disponibles, estado)
           VALUES ($1, $2, $3, $4, $5, $6, 1)
           RETURNING id, fecha_vencimiento`,
          [
            data.personaId,
            plan.servicioId,
            data.sucursalId,
            hoy.toISOString().split('T')[0],
            fechaVencimiento.toISOString().split('T')[0],
            plan.ingresos
          ]
        );

        inscripcionesCreadas.push({
          id: inscripcionResult.rows[0].id,
          servicioId: plan.servicioId,
          fechaVencimiento: inscripcionResult.rows[0].fecha_vencimiento
        });
      }

      await client.query('COMMIT');

      return {
        success: true,
        mensaje: "Renovación completada exitosamente",
        inscripciones: inscripcionesCreadas
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error("Error en renovarInscripcion:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Helper methods
  static getDescripcionPlan(nombre) {
    if (nombre.includes("Básico")) return "Ideal para comenzar";
    if (nombre.includes("Avanzado")) return "Para resultados rápidos";
    if (nombre.includes("Premium")) return "Experiencia completa";
    if (nombre.includes("Diario") || nombre.includes("Sesión")) return "Prueba nuestro gimnasio";
    return "Acceso al gimnasio";
  }

  static getCaracteristicasPlan(nombre, ingresos) {
    const caracteristicasBase = ["Acceso ilimitado", "Área de cardio", "Pesas libres"];
    
    if (nombre.includes("Básico")) {
      return [...caracteristicasBase, "Clases grupales básicas"];
    } else if (nombre.includes("Avanzado")) {
      return [
        ...caracteristicasBase,
        "Todo del plan básico",
        "Entrenador personal 2x/semana",
        "Clases de Crossfit",
        "Nutrición básica"
      ];
    } else if (nombre.includes("Premium")) {
      return [
        ...caracteristicasBase,
        "Todo del plan avanzado",
        "Entrenador personal ilimitado",
        "Nutrición personalizada",
        "Lockers VIP"
      ];
    } else if (ingresos === 1) {
      return [
        "Acceso por un día",
        "Área de cardio",
        "Pesas libres",
        "Clase grupal incluida"
      ];
    }
    
    return caracteristicasBase;
  }
}

module.exports = UneteAhoraService;