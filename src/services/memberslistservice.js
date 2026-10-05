// server/services/memberslistservice.js
const { query } = require("../../db");

// ============================================
// HELPER: construir WHERE base (reusado por getMembers y getAllMembers)
// ============================================
function buildWhereConditions({
  searchTerm,
  serviceFilter,
  sucursalFilter,
  userSucursalId,
  userRol,
}) {
  const whereConditions = [];
  const queryParams = [];
  let paramCount = 0;

  const esAdmin = userRol === "admin";

  if (!esAdmin && userSucursalId) {
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

  return { whereConditions, queryParams, paramCount };
}

// ============================================
// GET MEMBERS (paginado)
// ============================================
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

    const { whereConditions, queryParams, paramCount } = buildWhereConditions({
      searchTerm,
      serviceFilter,
      sucursalFilter,
      userSucursalId,
      userRol,
    });

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    const membersQuery = `
      WITH inscripciones_calculadas AS (
        SELECT 
          i.id AS inscripcion_id,
          i.persona_id,
          i.servicio_id,
          i.sucursal_id,
          i.ingresos_disponibles,
          i.fecha_inicio,
          i.fecha_vencimiento,
          i.estado_inscripcion,
          s.nombre AS servicio_nombre,
          COALESCE(ts.nombre, 'general') AS tipo_servicio,
          CASE 
            WHEN i.estado_inscripcion = 'activo' THEN true 
            ELSE false 
          END AS es_activa
        FROM inscripciones i
        INNER JOIN servicios s ON i.servicio_id = s.id
        LEFT JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
        INNER JOIN personas p ON i.persona_id = p.id
        INNER JOIN sucursales su ON i.sucursal_id = su.id AND su.estado = 1
        ${whereClause}
      ),
      candidatas AS (
        SELECT 
          ic.*,
          ROW_NUMBER() OVER (
            PARTITION BY ic.persona_id, ic.sucursal_id, ic.tipo_servicio
            ORDER BY 
              CASE WHEN ic.es_activa THEN 0 ELSE 1 END,
              ic.fecha_vencimiento DESC,
              ic.inscripcion_id DESC
          ) AS rn_por_tipo
        FROM inscripciones_calculadas ic
      ),
      PersonasUnicas AS (
        SELECT DISTINCT ON (c.persona_id, c.sucursal_id)
          c.persona_id,
          c.sucursal_id,
          su.nombre AS sucursal_name
        FROM candidatas c
        INNER JOIN sucursales su ON c.sucursal_id = su.id
        WHERE c.rn_por_tipo = 1
        ORDER BY c.persona_id, c.sucursal_id
      )
      SELECT 
        pu.persona_id AS id,
        CONCAT(p.nombres, ' ', p.apellidos) AS name,
        p.ci,
        p.telefono AS phone,
        TO_CHAR(p.fecha_nacimiento, 'YYYY-MM-DD') AS birthdate,
        pu.sucursal_id,
        pu.sucursal_name,
        TO_CHAR(MIN(c.fecha_inicio), 'YYYY-MM-DD') AS registrationdate,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM inscripciones i2 
            WHERE i2.persona_id = pu.persona_id 
            AND i2.sucursal_id = pu.sucursal_id
            AND i2.estado = 1
            AND i2.estado_inscripcion = 'activo'
          ) THEN 'active'
          ELSE 'inactive'
        END AS member_status
      FROM PersonasUnicas pu
      INNER JOIN personas p ON p.id = pu.persona_id
      LEFT JOIN candidatas c 
        ON c.persona_id = pu.persona_id 
        AND c.sucursal_id = pu.sucursal_id
        AND c.rn_por_tipo = 1
      GROUP BY pu.persona_id, p.nombres, p.apellidos, p.ci, p.telefono,
               p.fecha_nacimiento, pu.sucursal_id, pu.sucursal_name
      ORDER BY pu.persona_id, pu.sucursal_id
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    const countQuery = `
      WITH inscripciones_calculadas AS (
        SELECT 
          i.persona_id,
          i.sucursal_id,
          COALESCE(ts.nombre, 'general') AS tipo_servicio
        FROM inscripciones i
        INNER JOIN servicios s ON i.servicio_id = s.id
        LEFT JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
        INNER JOIN personas p ON i.persona_id = p.id
        INNER JOIN sucursales su ON i.sucursal_id = su.id AND su.estado = 1
        ${whereClause}
      ),
      PersonasUnicas AS (
        SELECT DISTINCT persona_id, sucursal_id
        FROM inscripciones_calculadas
      )
      SELECT COUNT(*) AS total_count
      FROM PersonasUnicas
    `;

    queryParams.push(itemsPerPage, offset);

    const membersResult = await query(membersQuery, queryParams);
    const countResult = await query(countQuery, queryParams.slice(0, -2));

    const totalCount = parseInt(countResult.rows[0]?.total_count || 0);

    const uniqueIds = [...new Set(membersResult.rows.map((m) => m.id))];

    let allServices = [];

    if (uniqueIds.length > 0) {
      const placeholders = uniqueIds.map((_, i) => `$${i + 1}`).join(",");

      const allServicesQuery = `
        WITH inscripciones_calculadas AS (
          SELECT 
            i.id AS inscripcion_id,
            i.persona_id,
            i.servicio_id,
            i.sucursal_id,
            i.ingresos_disponibles,
            i.fecha_inicio,
            i.fecha_vencimiento,
            i.estado_inscripcion,
            s.nombre AS servicio_nombre,
            COALESCE(ts.nombre, 'general') AS tipo_servicio,
            CASE 
              WHEN i.estado_inscripcion = 'activo' THEN true 
              ELSE false 
            END AS es_activa
          FROM inscripciones i
          INNER JOIN servicios s ON i.servicio_id = s.id
          LEFT JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
          WHERE i.estado = 1
            AND i.persona_id IN (${placeholders})
        ),
        candidatas AS (
          SELECT 
            ic.*,
            ROW_NUMBER() OVER (
              PARTITION BY ic.persona_id, ic.sucursal_id, ic.tipo_servicio
              ORDER BY 
                CASE WHEN ic.es_activa THEN 0 ELSE 1 END,
                ic.fecha_vencimiento DESC,
                ic.inscripcion_id DESC
            ) AS rn_por_tipo
          FROM inscripciones_calculadas ic
        )
        SELECT 
          c.persona_id,
          c.sucursal_id,
          c.servicio_nombre,
          c.ingresos_disponibles,
          TO_CHAR(c.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
          TO_CHAR(c.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
          CASE WHEN c.es_activa THEN 'active' ELSE 'inactive' END AS servicio_status,
          c.tipo_servicio
        FROM candidatas c
        WHERE c.rn_por_tipo = 1
        ORDER BY c.persona_id, c.sucursal_id, 
                 CASE WHEN c.es_activa THEN 0 ELSE 1 END,
                 c.tipo_servicio ASC,
                 c.fecha_vencimiento DESC
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

// ============================================
// GET ALL MEMBERS (sin paginación, para exportar)
// ============================================
const getAllMembers = async (
  searchTerm,
  serviceFilter,
  statusFilter,
  sucursalFilter,
  userSucursalId,
  userRol
) => {
  try {
    const { whereConditions, queryParams } = buildWhereConditions({
      searchTerm,
      serviceFilter,
      sucursalFilter,
      userSucursalId,
      userRol,
    });

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    const queryText = `
      WITH inscripciones_calculadas AS (
        SELECT 
          i.id AS inscripcion_id,
          i.persona_id,
          i.servicio_id,
          i.sucursal_id,
          i.ingresos_disponibles,
          i.fecha_inicio,
          i.fecha_vencimiento,
          i.estado_inscripcion,
          s.nombre AS servicio_nombre,
          COALESCE(ts.nombre, 'general') AS tipo_servicio,
          p.nombres,
          p.apellidos,
          p.ci,
          p.telefono,
          p.fecha_nacimiento,
          su.nombre AS sucursal_name,
          CASE 
            WHEN i.estado_inscripcion = 'activo' THEN true 
            ELSE false 
          END AS es_activa
        FROM inscripciones i
        INNER JOIN servicios s ON i.servicio_id = s.id
        LEFT JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
        INNER JOIN personas p ON i.persona_id = p.id
        INNER JOIN sucursales su ON i.sucursal_id = su.id AND su.estado = 1
        ${whereClause}
      ),
      candidatas AS (
        SELECT 
          ic.*,
          ROW_NUMBER() OVER (
            PARTITION BY ic.persona_id, ic.sucursal_id, ic.tipo_servicio
            ORDER BY 
              CASE WHEN ic.es_activa THEN 0 ELSE 1 END,
              ic.fecha_vencimiento DESC,
              ic.inscripcion_id DESC
          ) AS rn_por_tipo
        FROM inscripciones_calculadas ic
      )
      SELECT 
        c.persona_id,
        CONCAT(c.nombres, ' ', c.apellidos) AS name,
        c.ci,
        c.telefono AS phone,
        TO_CHAR(c.fecha_nacimiento, 'YYYY-MM-DD') AS birthdate,
        c.sucursal_id,
        c.sucursal_name,
        c.servicio_nombre,
        c.ingresos_disponibles,
        TO_CHAR(c.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
        TO_CHAR(c.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
        CASE WHEN c.es_activa THEN 'active' ELSE 'inactive' END AS servicio_status,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM inscripciones i2 
            WHERE i2.persona_id = c.persona_id 
            AND i2.sucursal_id = c.sucursal_id
            AND i2.estado = 1
            AND i2.estado_inscripcion = 'activo'
          ) THEN 'active'
          ELSE 'inactive'
        END AS member_status
      FROM candidatas c
      WHERE c.rn_por_tipo = 1
      ORDER BY c.nombres, c.apellidos, c.sucursal_id,
               CASE WHEN c.es_activa THEN 0 ELSE 1 END,
               c.tipo_servicio ASC,
               c.fecha_vencimiento DESC
    `;

    const result = await query(queryText, queryParams);

    const membersMap = new Map();

    result.rows.forEach((row) => {
      const key = `${row.persona_id}-${row.sucursal_id}`;

      if (!membersMap.has(key)) {
        membersMap.set(key, {
          id: row.persona_id.toString(),
          name: row.name || "",
          ci: row.ci || "",
          phone: row.phone || "",
          birthDate: row.birthdate || "",
          sucursal: row.sucursal_id ? row.sucursal_id.toString() : "",
          status: row.member_status || "inactive",
          registrationDate: row.fecha_inicio || "",
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
// ============================================
// EDIT MEMBER
// ============================================
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

    // ✅ Ya NO se actualiza fecha_nacimiento
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

// UPDATE INSCRIPTION DATES
// ✅ Admin y recepcionista pueden editar siempre
// ✅ Registra el movimiento en movimientos_fechas_inscripcion
// ============================================
const updateInscriptionDates = async (
  personaId,
  serviceName,
  startDate,
  expirationDate,
  userContext = {}
) => {
  try {
    const { usuarioId, sucursalId } = userContext;

    if (!usuarioId) {
      throw new Error(
        "No se pudo identificar al usuario que realiza el cambio"
      );
    }

    console.log("updateInscriptionDates - Buscando inscripción:", {
      personaId,
      serviceName,
      usuarioId,
      sucursalId,
    });

    // 1) Buscar la inscripción (activa o no)
    const findQuery = `
      SELECT 
        i.id, 
        i.persona_id,
        i.servicio_id,
        i.sucursal_id,
        TO_CHAR(i.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
        TO_CHAR(i.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
        i.estado_inscripcion
      FROM inscripciones i
      INNER JOIN servicios s ON i.servicio_id = s.id
      WHERE i.persona_id = $1 AND s.nombre = $2 AND i.estado = 1
      ORDER BY i.id DESC
      LIMIT 1
    `;

    const findResult = await query(findQuery, [personaId, serviceName]);

    if (findResult.rows.length === 0) {
      throw new Error(
        `No se encontró inscripción para la persona ${personaId} con el servicio ${serviceName}`
      );
    }

    const inscripcion = findResult.rows[0];

    // ✅ Ya NO se bloquea por estado_inscripcion

    const fechaInicioAnterior = inscripcion.fecha_inicio;
    const fechaVencimientoAnterior = inscripcion.fecha_vencimiento;

    // 2) Actualizar fechas
    const updateQuery = `
      UPDATE inscripciones
      SET fecha_inicio = $1::date, fecha_vencimiento = $2::date
      WHERE id = $3
      RETURNING 
        id, 
        TO_CHAR(fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio, 
        TO_CHAR(fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento
    `;

    const result = await query(updateQuery, [
      startDate,
      expirationDate,
      inscripcion.id,
    ]);

    const updated = result.rows[0];

    console.log("Inscripción actualizada:", updated);

    // 3) Registrar movimiento (auditoría)
    const sucursalMovimiento =
      inscripcion.sucursal_id || (sucursalId ? Number(sucursalId) : null);

    if (sucursalMovimiento) {
      const descripcion = [
        `Cambio de fechas del servicio "${serviceName}"`,
        `Inicio: ${fechaInicioAnterior || "—"} → ${updated.fecha_inicio}`,
        `Vencimiento: ${fechaVencimientoAnterior || "—"} → ${updated.fecha_vencimiento}`,
      ].join(" | ");

      const insertMovQuery = `
        INSERT INTO movimientos_fechas_inscripcion (
          inscripcion_id,
          persona_id,
          servicio_id,
          sucursal_id,
          usuario_id,
          fecha_inicio_anterior,
          fecha_inicio_nueva,
          fecha_vencimiento_anterior,
          fecha_vencimiento_nueva,
          descripcion
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6::date, $7::date, $8::date, $9::date,
          $10
        )
        RETURNING id
      `;

      await query(insertMovQuery, [
        inscripcion.id,
        inscripcion.persona_id,
        inscripcion.servicio_id,
        sucursalMovimiento,
        usuarioId,
        fechaInicioAnterior,
        updated.fecha_inicio,
        fechaVencimientoAnterior,
        updated.fecha_vencimiento,
        descripcion,
      ]);
    } else {
      console.warn(
        "⚠️ No se pudo registrar el movimiento: falta sucursal_id"
      );
    }

    return updated;
  } catch (error) {
    console.error("Error en updateInscriptionDates service:", error);
    throw new Error(
      `Error al actualizar fechas de inscripción: ${error.message}`
    );
  }
};

// ============================================
// DELETE MEMBER
// ============================================
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

// ============================================
// GET AVAILABLE SERVICES
// ============================================
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

// ============================================
// GET AVAILABLE BRANCHES
// ============================================
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