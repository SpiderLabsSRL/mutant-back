// server/services/memberslistservice.js
const { query } = require("../../db");

// Obtener miembros con paginación y filtros
const getMembers = async (
  page = 1,
  limit = 10,
  searchTerm,
  serviceFilter,
  statusFilter,
  sucursalFilter,
  userSucursalId,
  userRol
) => {
  try {
    const itemsPerPage = 10;
    const currentPage = Math.max(1, parseInt(page) || 1);
    const offset = (currentPage - 1) * itemsPerPage;

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

    // Excluir empleados
    whereConditions.push(
      `p.id NOT IN (SELECT persona_id FROM empleados WHERE estado = 1)`
    );

    // SOLO MOSTRAR PERSONAS ACTIVAS
    whereConditions.push(`p.estado = 0`);

    // ✅ BÚSQUEDA ULTRA ROBUSTA: normaliza espacios múltiples + sin acentos + case-insensitive
    if (searchTerm && searchTerm.trim() !== "") {
      paramCount++;

      const normalizedSearch = searchTerm.trim().replace(/\s+/g, " ");

      whereConditions.push(`
        (
          unaccent(LOWER(REGEXP_REPLACE(TRIM(p.nombres), '\\s+', ' ', 'g'))) 
            ILIKE unaccent(LOWER($${paramCount}))
          
          OR unaccent(LOWER(REGEXP_REPLACE(TRIM(p.apellidos), '\\s+', ' ', 'g'))) 
            ILIKE unaccent(LOWER($${paramCount}))
          
          OR TRIM(p.ci) ILIKE $${paramCount}
          
          OR unaccent(LOWER(
            REGEXP_REPLACE(
              TRIM(CONCAT(
                REGEXP_REPLACE(TRIM(p.nombres), '\\s+', ' ', 'g'),
                ' ',
                REGEXP_REPLACE(TRIM(p.apellidos), '\\s+', ' ', 'g')
              )),
              '\\s+', ' ', 'g'
            )
          )) ILIKE unaccent(LOWER($${paramCount}))
          
          OR unaccent(LOWER(
            REGEXP_REPLACE(
              TRIM(CONCAT(
                REGEXP_REPLACE(TRIM(p.apellidos), '\\s+', ' ', 'g'),
                ' ',
                REGEXP_REPLACE(TRIM(p.nombres), '\\s+', ' ', 'g')
              )),
              '\\s+', ' ', 'g'
            )
          )) ILIKE unaccent(LOWER($${paramCount}))
        )
      `);

      queryParams.push(`%${normalizedSearch}%`);
    }

    // Filtro por servicio
    if (serviceFilter && serviceFilter !== "all") {
      paramCount++;
      whereConditions.push(`s.nombre = $${paramCount}`);
      queryParams.push(serviceFilter);
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // ✅ Usamos MAX(i.id) en lugar de MAX(i.fecha_inicio) porque la fecha_inicio
    // puede cambiar y no es un buen identificador único.
    const membersQuery = `
      WITH UltimasInscripciones AS (
        SELECT 
          i.persona_id,
          i.servicio_id,
          i.sucursal_id,
          MAX(i.id) as ultima_inscripcion_id
        FROM inscripciones i
        INNER JOIN servicios s ON i.servicio_id = s.id
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
        INNER JOIN inscripciones i ON i.id = ui.ultima_inscripcion_id
        INNER JOIN servicios s ON i.servicio_id = s.id
        INNER JOIN sucursales su ON i.sucursal_id = su.id AND su.estado = 1
        ${whereClause}
        ORDER BY ui.persona_id, ui.sucursal_id, ui.servicio_id, i.id DESC
      ),
      PersonasUnicas AS (
        SELECT DISTINCT ON (persona_id, sucursal_id)
          persona_id,
          CONCAT(nombres, ' ', apellidos) as name,
          ci,
          telefono,
          fecha_nacimiento,
          sucursal_id,
          sucursal_name
        FROM ServiciosUnicos
        ORDER BY persona_id, sucursal_id
      )
      SELECT 
        pu.persona_id as id,
        pu.name,
        pu.ci,
        pu.telefono as phone,
        TO_CHAR(pu.fecha_nacimiento, 'YYYY-MM-DD') as birthdate,
        pu.sucursal_id,
        pu.sucursal_name,
        TO_CHAR(MIN(su.fecha_inicio), 'YYYY-MM-DD') as registrationdate,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM inscripciones i2 
            WHERE i2.persona_id = pu.persona_id 
            AND i2.sucursal_id = pu.sucursal_id
            AND i2.fecha_vencimiento >= TIMEZONE('America/La_Paz', NOW())::date 
            AND (i2.ingresos_disponibles > 0 OR i2.ingresos_disponibles IS NULL)
          ) THEN 'active'
          ELSE 'inactive'
        END as member_status
      FROM PersonasUnicas pu
      LEFT JOIN ServiciosUnicos su 
        ON pu.persona_id = su.persona_id 
        AND pu.sucursal_id = su.sucursal_id
      GROUP BY pu.persona_id, pu.name, pu.ci, pu.telefono, pu.fecha_nacimiento, 
               pu.sucursal_id, pu.sucursal_name
      ORDER BY pu.name, pu.sucursal_id
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    const countQuery = `
      WITH UltimasInscripciones AS (
        SELECT 
          i.persona_id,
          i.servicio_id,
          i.sucursal_id,
          MAX(i.id) as ultima_inscripcion_id
        FROM inscripciones i
        INNER JOIN servicios s ON i.servicio_id = s.id
        GROUP BY i.persona_id, i.servicio_id, i.sucursal_id
      ),
      PersonasUnicas AS (
        SELECT DISTINCT ON (p.id, ui.sucursal_id)
          p.id as persona_id,
          ui.sucursal_id
        FROM personas p
        INNER JOIN UltimasInscripciones ui ON p.id = ui.persona_id
        INNER JOIN inscripciones i ON i.id = ui.ultima_inscripcion_id
        INNER JOIN servicios s ON i.servicio_id = s.id
        INNER JOIN sucursales su ON i.sucursal_id = su.id AND su.estado = 1
        ${whereClause}
        ORDER BY p.id, ui.sucursal_id
      )
      SELECT COUNT(*) as total_count
      FROM PersonasUnicas
    `;

    queryParams.push(itemsPerPage, offset);

    const membersResult = await query(membersQuery, queryParams);
    const countResult = await query(countQuery, queryParams.slice(0, -2));

    const totalCount = parseInt(countResult.rows[0]?.total_count || 0);

    // Optimización: una sola query para TODOS los servicios de la página
    const memberKeys = membersResult.rows.map((m) => ({
      persona_id: m.id,
      sucursal_id: m.sucursal_id,
    }));

    let allServices = [];

    if (memberKeys.length > 0) {
      // Construir array de pares (persona_id, sucursal_id) únicos
      const uniqueIds = [...new Set(memberKeys.map((m) => m.persona_id))];
      const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(",");

      const allServicesQuery = `
        WITH UltimasInscripciones AS (
          SELECT 
            i.persona_id,
            i.servicio_id,
            i.sucursal_id,
            MAX(i.id) as ultima_inscripcion_id
          FROM inscripciones i
          INNER JOIN servicios s ON i.servicio_id = s.id
          WHERE i.persona_id IN (${placeholders})
          GROUP BY i.persona_id, i.servicio_id, i.sucursal_id
        )
        SELECT 
          ui.persona_id,
          ui.sucursal_id,
          s.nombre as servicio_nombre,
          i.ingresos_disponibles,
          TO_CHAR(i.fecha_inicio, 'YYYY-MM-DD') as fecha_inicio,
          TO_CHAR(i.fecha_vencimiento, 'YYYY-MM-DD') as fecha_vencimiento,
          CASE 
            WHEN i.fecha_vencimiento >= TIMEZONE('America/La_Paz', NOW())::date 
                 AND (i.ingresos_disponibles > 0 OR i.ingresos_disponibles IS NULL) 
                 THEN 'active'
            ELSE 'inactive'
          END as servicio_status
        FROM UltimasInscripciones ui
        INNER JOIN inscripciones i ON i.id = ui.ultima_inscripcion_id
        INNER JOIN servicios s ON i.servicio_id = s.id
        ORDER BY ui.persona_id, ui.sucursal_id, s.nombre
      `;

      const servicesResult = await query(allServicesQuery, uniqueIds);
      allServices = servicesResult.rows;
    }

    const servicesByMember = new Map();
    allServices.forEach((svc) => {
      const key = `${svc.persona_id}-${svc.sucursal_id}`;
      if (!servicesByMember.has(key)) {
        servicesByMember.set(key, []);
      }
      servicesByMember.get(key).push({
        name: svc.servicio_nombre,
        startDate: svc.fecha_inicio || "",
        expirationDate: svc.fecha_vencimiento,
        status: svc.servicio_status,
        ingresos_disponibles: svc.ingresos_disponibles,
      });
    });

    const membersWithServices = membersResult.rows.map((member) => ({
      id: member.id.toString(),
      name: member.name || "",
      ci: member.ci || "",
      phone: member.phone || "",
      birthDate: member.birthdate || "",
      sucursal: member.sucursal_id ? member.sucursal_id.toString() : "",
      status: member.member_status || "inactive",
      registrationDate: member.registrationdate || "",
      services:
        servicesByMember.get(`${member.id}-${member.sucursal_id}`) || [],
    }));

    return {
      members: membersWithServices,
      totalCount,
      currentPage,
      totalPages: Math.ceil(totalCount / itemsPerPage),
      itemsPerPage,
    };
  } catch (error) {
    console.error("Error en getMembers service:", error);
    throw new Error(
      `Error al obtener miembros desde la base de datos: ${error.message}`
    );
  }
};

// Obtener todos los miembros para exportar (sin paginación)
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

    if (userRol === "recepcionista" && userSucursalId) {
      paramCount++;
      whereConditions.push(`i.sucursal_id = $${paramCount}`);
      queryParams.push(parseInt(userSucursalId));
    } else if (sucursalFilter && sucursalFilter !== "all") {
      paramCount++;
      whereConditions.push(`i.sucursal_id = $${paramCount}`);
      queryParams.push(parseInt(sucursalFilter));
    }

    whereConditions.push(
      `p.id NOT IN (SELECT persona_id FROM empleados WHERE estado = 1)`
    );
    whereConditions.push(`p.estado = 0`);

    if (searchTerm && searchTerm.trim() !== "") {
      paramCount++;

      const normalizedSearch = searchTerm.trim().replace(/\s+/g, " ");

      whereConditions.push(`
        (
          unaccent(LOWER(REGEXP_REPLACE(TRIM(p.nombres), '\\s+', ' ', 'g'))) 
            ILIKE unaccent(LOWER($${paramCount}))
          
          OR unaccent(LOWER(REGEXP_REPLACE(TRIM(p.apellidos), '\\s+', ' ', 'g'))) 
            ILIKE unaccent(LOWER($${paramCount}))
          
          OR TRIM(p.ci) ILIKE $${paramCount}
          
          OR unaccent(LOWER(
            REGEXP_REPLACE(
              TRIM(CONCAT(
                REGEXP_REPLACE(TRIM(p.nombres), '\\s+', ' ', 'g'),
                ' ',
                REGEXP_REPLACE(TRIM(p.apellidos), '\\s+', ' ', 'g')
              )),
              '\\s+', ' ', 'g'
            )
          )) ILIKE unaccent(LOWER($${paramCount}))
          
          OR unaccent(LOWER(
            REGEXP_REPLACE(
              TRIM(CONCAT(
                REGEXP_REPLACE(TRIM(p.apellidos), '\\s+', ' ', 'g'),
                ' ',
                REGEXP_REPLACE(TRIM(p.nombres), '\\s+', ' ', 'g')
              )),
              '\\s+', ' ', 'g'
            )
          )) ILIKE unaccent(LOWER($${paramCount}))
        )
      `);

      queryParams.push(`%${normalizedSearch}%`);
    }

    if (serviceFilter && serviceFilter !== "all") {
      paramCount++;
      whereConditions.push(`s.nombre = $${paramCount}`);
      queryParams.push(serviceFilter);
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    const queryText = `
      WITH UltimasInscripciones AS (
        SELECT 
          i.persona_id,
          i.servicio_id,
          i.sucursal_id,
          MAX(i.id) as ultima_inscripcion_id
        FROM inscripciones i
        INNER JOIN servicios s ON i.servicio_id = s.id
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
        INNER JOIN inscripciones i ON i.id = ui.ultima_inscripcion_id
        INNER JOIN servicios s ON i.servicio_id = s.id
        INNER JOIN sucursales su ON i.sucursal_id = su.id AND su.estado = 1
        ${whereClause}
        ORDER BY ui.persona_id, ui.sucursal_id, ui.servicio_id, i.id DESC
      )
      SELECT 
        persona_id as id,
        CONCAT(nombres, ' ', apellidos) as name,
        ci,
        telefono as phone,
        TO_CHAR(fecha_nacimiento, 'YYYY-MM-DD') as birthdate,
        sucursal_id,
        sucursal_name,
        servicio_id,
        servicio_nombre,
        ingresos_disponibles,
        TO_CHAR(fecha_inicio, 'YYYY-MM-DD') as fecha_inicio,
        TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') as fecha_vencimiento,
        servicio_status,
        TO_CHAR(fecha_inicio, 'YYYY-MM-DD') as registrationdate,
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
      ORDER BY nombres, apellidos, sucursal_id, servicio_nombre
    `;

    const result = await query(queryText, queryParams);

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
      const servicioExistente = member.services.find(
        (service) => service.name === row.servicio_nombre
      );

      if (!servicioExistente) {
        member.services.push({
          name: row.servicio_nombre,
          startDate: row.fecha_inicio || "",
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

// Editar miembro
const editMember = async (id, nombres, apellidos, ci, phone) => {
  try {
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
      SET nombres = $1, apellidos = $2, ci = $3, telefono = $4
      WHERE id = $5 AND estado = 0
      RETURNING *
    `;

    const result = await query(updateQuery, [
      nombres,
      apellidos,
      ci,
      phone,
      id,
    ]);

    if (result.rows.length === 0) {
      throw new Error("Miembro no encontrado o ya está eliminado");
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error en editMember service:", error);
    if (error.message.includes("La persona ya existe")) {
      throw error;
    }
    throw new Error(
      `Error al editar miembro en la base de datos: ${error.message}`
    );
  }
};

// ✅ Actualizar fechas de inscripción (inicio y vencimiento)
const updateInscriptionDates = async (
  personaId,
  serviceName,
  startDate,
  expirationDate
) => {
  try {
    console.log("updateInscriptionDates - Buscando inscripción:", {
      personaId,
      serviceName,
    });

    const findQuery = `
      SELECT i.id, i.fecha_inicio, i.fecha_vencimiento
      FROM inscripciones i
      INNER JOIN servicios s ON i.servicio_id = s.id
      WHERE i.persona_id = $1 AND s.nombre = $2
      ORDER BY i.id DESC
      LIMIT 1
    `;

    const findResult = await query(findQuery, [personaId, serviceName]);

    if (findResult.rows.length === 0) {
      throw new Error(
        `No se encontró inscripción para la persona ${personaId} con el servicio ${serviceName}`
      );
    }

    const inscripcionId = findResult.rows[0].id;
    console.log("Inscripción encontrada:", findResult.rows[0]);

    const updateQuery = `
      UPDATE inscripciones
      SET fecha_inicio = $1::date, fecha_vencimiento = $2::date
      WHERE id = $3
      RETURNING id, TO_CHAR(fecha_inicio, 'YYYY-MM-DD') as fecha_inicio, 
                TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') as fecha_vencimiento
    `;

    const result = await query(updateQuery, [
      startDate,
      expirationDate,
      inscripcionId,
    ]);

    console.log("Inscripción actualizada:", result.rows[0]);
    return result.rows[0];
  } catch (error) {
    console.error("Error en updateInscriptionDates service:", error);
    throw new Error(
      `Error al actualizar fechas de inscripción: ${error.message}`
    );
  }
};

// Eliminar miembro
const deleteMember = async (id) => {
  try {
    const checkQuery = "SELECT * FROM personas WHERE id = $1 AND estado = 0";
    const checkResult = await query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      throw new Error("Miembro no encontrado o ya está eliminado");
    }

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
  updateInscriptionDates,
  getAvailableServices,
  getAvailableBranches,
};