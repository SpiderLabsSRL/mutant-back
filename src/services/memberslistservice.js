const { query } = require("../../db");

// Obtener miembros con paginación y filtros - CORREGIDO para evitar servicios duplicados
const getMembers = async (
  page,
  limit,
  searchTerm,
  serviceFilter,
  statusFilter,
  sucursalFilter,
  userSucursalId,
  userRol
) => {
  try {
    console.log("Parámetros del servicio:", {
      page,
      limit,
      searchTerm,
      serviceFilter,
      statusFilter,
      sucursalFilter,
      userSucursalId,
      userRol,
    });

    const offset = (page - 1) * limit;

    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    // Filtrar por sucursal según el rol del usuario
    if (userRol === "recepcionista" && userSucursalId) {
      paramCount++;
      whereConditions.push(`i.sucursal_id = $${paramCount}`);
      queryParams.push(parseInt(userSucursalId));
    } else if (sucursalFilter && sucursalFilter !== "all") {
      paramCount++;
      whereConditions.push(`i.sucursal_id = $${paramCount}`);
      queryParams.push(parseInt(sucursalFilter));
    }

    // Excluir empleados - solo personas con servicios
    whereConditions.push(
      `p.id NOT IN (SELECT persona_id FROM empleados WHERE estado = 1)`
    );

    // SOLO MOSTRAR PERSONAS ACTIVAS (estado = 0)
    whereConditions.push(`p.estado = 0`);

    // Filtro de búsqueda
    if (searchTerm && searchTerm.trim() !== "") {
      paramCount++;
      whereConditions.push(
        `(p.nombres ILIKE $${paramCount} OR p.apellidos ILIKE $${paramCount} OR p.ci ILIKE $${paramCount})`
      );
      queryParams.push(`%${searchTerm}%`);
    }

    // Filtro por servicio
    if (serviceFilter && serviceFilter !== "all") {
      paramCount++;
      whereConditions.push(`s.nombre = $${paramCount}`);
      queryParams.push(serviceFilter);
    }

    // Filtro por estado - CORREGIDO para manejar ingresos_disponibles NULL
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "active") {
        whereConditions.push(
          `i.fecha_vencimiento >= TIMEZONE('America/La_Paz', NOW())::date AND (i.ingresos_disponibles > 0 OR i.ingresos_disponibles IS NULL)`
        );
      } else if (statusFilter === "inactive") {
        whereConditions.push(
          `(i.fecha_vencimiento < TIMEZONE('America/La_Paz', NOW())::date OR (i.ingresos_disponibles = 0 AND i.ingresos_disponibles IS NOT NULL))`
        );
      }
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // Subconsulta para obtener la última inscripción por servicio, persona y sucursal - CORREGIDO
    const membersQuery = `
      WITH UltimasInscripciones AS (
        SELECT 
          i.persona_id,
          i.servicio_id,
          i.sucursal_id,
          MAX(i.fecha_inicio) as ultima_fecha
        FROM inscripciones i
        INNER JOIN servicios s ON i.servicio_id = s.id AND s.estado = 1
        GROUP BY i.persona_id, i.servicio_id, i.sucursal_id
      ),
      ServiciosUnicos AS (
        SELECT DISTINCT ON (ui.persona_id, ui.sucursal_id, ui.servicio_id)
          p.id as persona_id,
          p.nombres,
          p.apellidos,
          p.ci,
          p.telefono,
          p.fecha_nacimiento,
          ui.sucursal_id,
          su.nombre as sucursal_name,
          ui.servicio_id,
          s.nombre as servicio_nombre,
          i.ingresos_disponibles,
          i.fecha_vencimiento,
          i.fecha_inicio,
          CASE 
            WHEN i.fecha_vencimiento >= TIMEZONE('America/La_Paz', NOW())::date 
                 AND (i.ingresos_disponibles > 0 OR i.ingresos_disponibles IS NULL) 
                 THEN 'active'
            ELSE 'inactive'
          END as servicio_status
        FROM personas p
        INNER JOIN UltimasInscripciones ui ON p.id = ui.persona_id
        INNER JOIN inscripciones i ON p.id = i.persona_id 
          AND i.servicio_id = ui.servicio_id 
          AND i.sucursal_id = ui.sucursal_id 
          AND i.fecha_inicio = ui.ultima_fecha
        INNER JOIN servicios s ON i.servicio_id = s.id AND s.estado = 1
        INNER JOIN sucursales su ON i.sucursal_id = su.id AND su.estado = 1
        ${whereClause}
        ORDER BY ui.persona_id, ui.sucursal_id, ui.servicio_id, ui.ultima_fecha DESC
      )
      SELECT 
        persona_id as id,
        CONCAT(nombres, ' ', apellidos) as name,
        ci,
        telefono as phone,
        TO_CHAR(fecha_nacimiento, 'YYYY-MM-DD') as birthDate,
        sucursal_id,
        sucursal_name,
        servicio_id,
        servicio_nombre,
        ingresos_disponibles,
        TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') as fecha_vencimiento,
        servicio_status,
        TO_CHAR(fecha_inicio, 'YYYY-MM-DD') as registrationDate,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM inscripciones i2 
            WHERE i2.persona_id = persona_id 
            AND i2.sucursal_id = sucursal_id
            AND i2.fecha_vencimiento >= TIMEZONE('America/La_Paz', NOW())::date 
            AND (i2.ingresos_disponibles > 0 OR i2.ingresos_disponibles IS NULL)
          ) THEN 'active'
          ELSE 'inactive'
        END as member_status
      FROM ServiciosUnicos
      ORDER BY nombres, apellidos, servicio_nombre
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    // Consulta para contar total - CORREGIDA
    const countQuery = `
      WITH UltimasInscripciones AS (
        SELECT 
          i.persona_id,
          i.servicio_id,
          i.sucursal_id,
          MAX(i.fecha_inicio) as ultima_fecha
        FROM inscripciones i
        INNER JOIN servicios s ON i.servicio_id = s.id AND s.estado = 1
        GROUP BY i.persona_id, i.servicio_id, i.sucursal_id
      )
      SELECT COUNT(DISTINCT CONCAT(p.id, '-', i.sucursal_id))
      FROM personas p
      INNER JOIN UltimasInscripciones ui ON p.id = ui.persona_id
      INNER JOIN inscripciones i ON p.id = i.persona_id 
        AND i.servicio_id = ui.servicio_id 
        AND i.sucursal_id = ui.sucursal_id 
        AND i.fecha_inicio = ui.ultima_fecha
      INNER JOIN servicios s ON i.servicio_id = s.id AND s.estado = 1
      INNER JOIN sucursales su ON i.sucursal_id = su.id AND su.estado = 1
      ${whereClause}
    `;

    queryParams.push(limit, offset);

    console.log("Ejecutando consulta members:", membersQuery);
    console.log("Parámetros:", queryParams);

    const membersResult = await query(membersQuery, queryParams);
    const countResult = await query(countQuery, queryParams.slice(0, -2));

    // Agrupar servicios por persona y sucursal - CORREGIDO para evitar duplicados
    const membersMap = new Map();

    membersResult.rows.forEach((row) => {
      const key = `${row.id}-${row.sucursal_id}`;

      if (!membersMap.has(key)) {
        membersMap.set(key, {
          id: row.id.toString(),
          name: row.name || "",
          ci: row.ci || "",
          phone: row.phone || "",
          birthDate: row.birthdate || "",
          sucursal: row.sucursal_id ? row.sucursal_id.toString() : "",
          status: row.member_status || "inactive",
          registrationDate: row.registrationdate || "",
          services: [],
        });
      }

      const member = membersMap.get(key);

      // Verificar si el servicio ya existe antes de agregarlo
      const servicioExistente = member.services.find(
        service => service.name === row.servicio_nombre
      );

      if (!servicioExistente) {
        member.services.push({
          name: row.servicio_nombre,
          expirationDate: row.fecha_vencimiento,
          status: row.servicio_status,
          ingresos_disponibles: row.ingresos_disponibles,
        });
      }
    });

    const members = Array.from(membersMap.values());

    return {
      members,
      totalCount: parseInt(countResult.rows[0]?.count || 0),
    };
  } catch (error) {
    console.error("Error en getMembers service:", error);
    throw new Error(
      `Error al obtener miembros desde la base de datos: ${error.message}`
    );
  }
};

// Obtener todos los miembros (sin paginación) - CORREGIDO para evitar servicios duplicados
const getAllMembers = async (
  searchTerm,
  serviceFilter,
  statusFilter,
  sucursalFilter,
  userSucursalId,
  userRol
) => {
  try {
    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    // Filtrar por sucursal según el rol del usuario
    if (userRol === "recepcionista" && userSucursalId) {
      paramCount++;
      whereConditions.push(`i.sucursal_id = $${paramCount}`);
      queryParams.push(parseInt(userSucursalId));
    } else if (sucursalFilter && sucursalFilter !== "all") {
      paramCount++;
      whereConditions.push(`i.sucursal_id = $${paramCount}`);
      queryParams.push(parseInt(sucursalFilter));
    }

    // Excluir empleados - solo personas con servicios
    whereConditions.push(
      `p.id NOT IN (SELECT persona_id FROM empleados WHERE estado = 1)`
    );

    // SOLO MOSTRAR PERSONAS ACTIVAS (estado = 0)
    whereConditions.push(`p.estado = 0`);

    // Filtro de búsqueda
    if (searchTerm && searchTerm.trim() !== "") {
      paramCount++;
      whereConditions.push(
        `(p.nombres ILIKE $${paramCount} OR p.apellidos ILIKE $${paramCount} OR p.ci ILIKE $${paramCount})`
      );
      queryParams.push(`%${searchTerm}%`);
    }

    // Filtro por servicio
    if (serviceFilter && serviceFilter !== "all") {
      paramCount++;
      whereConditions.push(`s.nombre = $${paramCount}`);
      queryParams.push(serviceFilter);
    }

    // Filtro por estado - CORREGIDO para manejar ingresos_disponibles NULL
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "active") {
        whereConditions.push(
          `i.fecha_vencimiento >= TIMEZONE('America/La_Paz', NOW())::date AND (i.ingresos_disponibles > 0 OR i.ingresos_disponibles IS NULL)`
        );
      } else if (statusFilter === "inactive") {
        whereConditions.push(
          `(i.fecha_vencimiento < TIMEZONE('America/La_Paz', NOW())::date OR (i.ingresos_disponibles = 0 AND i.ingresos_disponibles IS NOT NULL))`
        );
      }
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // Subconsulta para obtener la última inscripción por servicio, persona y sucursal - CORREGIDO
    const queryText = `
      WITH UltimasInscripciones AS (
        SELECT 
          i.persona_id,
          i.servicio_id,
          i.sucursal_id,
          MAX(i.fecha_inicio) as ultima_fecha
        FROM inscripciones i
        INNER JOIN servicios s ON i.servicio_id = s.id AND s.estado = 1
        GROUP BY i.persona_id, i.servicio_id, i.sucursal_id
      ),
      ServiciosUnicos AS (
        SELECT DISTINCT ON (ui.persona_id, ui.sucursal_id, ui.servicio_id)
          p.id as persona_id,
          p.nombres,
          p.apellidos,
          p.ci,
          p.telefono,
          p.fecha_nacimiento,
          ui.sucursal_id,
          su.nombre as sucursal_name,
          ui.servicio_id,
          s.nombre as servicio_nombre,
          i.ingresos_disponibles,
          i.fecha_vencimiento,
          i.fecha_inicio,
          CASE 
            WHEN i.fecha_vencimiento >= TIMEZONE('America/La_Paz', NOW())::date 
                 AND (i.ingresos_disponibles > 0 OR i.ingresos_disponibles IS NULL) 
                 THEN 'active'
            ELSE 'inactive'
          END as servicio_status
        FROM personas p
        INNER JOIN UltimasInscripciones ui ON p.id = ui.persona_id
        INNER JOIN inscripciones i ON p.id = i.persona_id 
          AND i.servicio_id = ui.servicio_id 
          AND i.sucursal_id = ui.sucursal_id 
          AND i.fecha_inicio = ui.ultima_fecha
        INNER JOIN servicios s ON i.servicio_id = s.id AND s.estado = 1
        INNER JOIN sucursales su ON i.sucursal_id = su.id AND su.estado = 1
        ${whereClause}
        ORDER BY ui.persona_id, ui.sucursal_id, ui.servicio_id, ui.ultima_fecha DESC
      )
      SELECT 
        persona_id as id,
        CONCAT(nombres, ' ', apellidos) as name,
        ci,
        telefono as phone,
        TO_CHAR(fecha_nacimiento, 'YYYY-MM-DD') as birthDate,
        sucursal_id,
        sucursal_name,
        servicio_id,
        servicio_nombre,
        ingresos_disponibles,
        TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') as fecha_vencimiento,
        servicio_status,
        TO_CHAR(fecha_inicio, 'YYYY-MM-DD') as registrationDate,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM inscripciones i2 
            WHERE i2.persona_id = persona_id 
            AND i2.sucursal_id = sucursal_id
            AND i2.fecha_vencimiento >= TIMEZONE('America/La_Paz', NOW())::date 
            AND (i2.ingresos_disponibles > 0 OR i2.ingresos_disponibles IS NULL)
          ) THEN 'active'
          ELSE 'inactive'
        END as member_status
      FROM ServiciosUnicos
      ORDER BY nombres, apellidos, servicio_nombre
    `;

    console.log("Ejecutando consulta todos los miembros:", queryText);
    console.log("Parámetros:", queryParams);

    const result = await query(queryText, queryParams);

    // Agrupar servicios por persona y sucursal - CORREGIDO para evitar duplicados
    const membersMap = new Map();

    result.rows.forEach((row) => {
      const key = `${row.id}-${row.sucursal_id}`;

      if (!membersMap.has(key)) {
        membersMap.set(key, {
          id: row.id.toString(),
          name: row.name || "",
          ci: row.ci || "",
          phone: row.phone || "",
          birthDate: row.birthdate || "",
          sucursal: row.sucursal_id ? row.sucursal_id.toString() : "",
          status: row.member_status || "inactive",
          registrationDate: row.registrationdate || "",
          services: [],
        });
      }

      const member = membersMap.get(key);

      // Verificar si el servicio ya existe antes de agregarlo
      const servicioExistente = member.services.find(
        service => service.name === row.servicio_nombre
      );

      if (!servicioExistente) {
        member.services.push({
          name: row.servicio_nombre,
          expirationDate: row.fecha_vencimiento,
          status: row.servicio_status,
          ingresos_disponibles: row.ingresos_disponibles,
        });
      }
    });

    return Array.from(membersMap.values());
  } catch (error) {
    console.error("Error en getAllMembers service:", error);
    throw new Error(
      `Error al obtener todos los miembros desde la base de datos: ${error.message}`
    );
  }
};

// Editar miembro - MODIFICADO para permitir letras y números en CI
const editMember = async (id, nombres, apellidos, ci, phone, birthDate) => {
  try {
    // Verificar si el CI ya existe en otro miembro ACTIVO
    const checkCiQuery = `
      SELECT id, nombres, apellidos, ci, telefono, fecha_nacimiento
      FROM personas WHERE ci = $1 AND id != $2 AND estado = 0
    `;
    const ciResult = await query(checkCiQuery, [ci, id]);

    if (ciResult.rows.length > 0) {
      const existingPerson = ciResult.rows[0];
      const error = new Error("La persona ya existe con este número de cédula");
      error.existingPerson = existingPerson;
      throw error;
    }

    const updateQuery = `
      UPDATE personas 
      SET nombres = $1, apellidos = $2, ci = $3, telefono = $4, fecha_nacimiento = $5
      WHERE id = $6 AND estado = 0
      RETURNING *
    `;

    console.log("Ejecutando update de miembro:", {
      id,
      nombres,
      apellidos,
      ci,
      phone,
      birthDate,
    });

    const result = await query(updateQuery, [
      nombres,
      apellidos,
      ci,
      phone,
      birthDate,
      id,
    ]);

    if (result.rows.length === 0) {
      throw new Error("Miembro no encontrado o ya está eliminado");
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error en editMember service:", error);

    // Si ya es un error personalizado, re-lanzarlo
    if (error.message.includes("La persona ya existe")) {
      throw error;
    }

    throw new Error(
      `Error al editar miembro en la base de datos: ${error.message}`
    );
  }
};

// Eliminar miembro - MODIFICADO para cambiar estado a 1 en lugar de borrar
const deleteMember = async (id) => {
  try {
    // Verificar si el miembro existe y está activo
    const checkQuery = "SELECT * FROM personas WHERE id = $1 AND estado = 0";
    const checkResult = await query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      throw new Error("Miembro no encontrado o ya está eliminado");
    }

    // Actualizar el estado a 1 (eliminado) en lugar de borrar
    const result = await query(
      "UPDATE personas SET estado = 1 WHERE id = $1 AND estado = 0 RETURNING *",
      [id]
    );

    return result.rows[0];
  } catch (error) {
    console.error("Error en deleteMember service:", error);
    throw new Error(
      `Error al eliminar miembro de la base de datos: ${error.message}`
    );
  }
};

const getAvailableServices = async () => {
  try {
    const queryText = `
      SELECT nombre 
      FROM servicios 
      WHERE estado = 1 
      ORDER BY nombre
    `;

    const result = await query(queryText);

    return result.rows.map((row) => row.nombre);
  } catch (error) {
    console.error("Error en getAvailableServices service:", error);
    throw new Error(
      `Error al obtener servicios disponibles desde la base de datos: ${error.message}`
    );
  }
};

const getAvailableBranches = async () => {
  try {
    const queryText = `
      SELECT id, nombre 
      FROM sucursales 
      WHERE estado = 1 
      ORDER BY nombre
    `;

    const result = await query(queryText);

    return result.rows.map((row) => ({
      id: row.id.toString(),
      name: row.nombre,
    }));
  } catch (error) {
    console.error("Error en getAvailableBranches service:", error);
    throw new Error(
      `Error al obtener sucursales disponibles desde la base de datos: ${error.message}`
    );
  }
};

module.exports = {
  getMembers,
  getAllMembers,
  editMember,
  deleteMember,
  getAvailableServices,
  getAvailableBranches,
};