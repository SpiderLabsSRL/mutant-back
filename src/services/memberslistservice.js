const { query } = require("../../db");
const PDFDocument = require("pdfkit");
const bcrypt = require("bcrypt");

// Obtener miembros con paginación y filtros - CONSULTA CORREGIDA
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

    // Filtro por estado
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "active") {
        whereConditions.push(
          `i.fecha_vencimiento >= CURRENT_DATE AND i.ingresos_disponibles > 0`
        );
      } else if (statusFilter === "inactive") {
        whereConditions.push(
          `(i.fecha_vencimiento < CURRENT_DATE OR i.ingresos_disponibles = 0)`
        );
      }
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // Consulta para obtener miembros - CORREGIDA PARA MULTISUCURSAL
    const membersQuery = `
      SELECT 
        p.id,
        CONCAT(p.nombres, ' ', p.apellidos) as name,
        p.ci,
        p.telefono as phone,
        TO_CHAR(p.fecha_nacimiento, 'YYYY-MM-DD') as birthDate,
        i.sucursal_id as sucursal_id,
        su.nombre as sucursal_name,
        i.ingresos_disponibles,
        jsonb_build_object(
          'name', s.nombre,
          'expirationDate', TO_CHAR(i.fecha_vencimiento, 'YYYY-MM-DD'),
          'status', CASE 
            WHEN i.fecha_vencimiento >= CURRENT_DATE AND i.ingresos_disponibles > 0 THEN 'active' 
            ELSE 'inactive' 
          END
        ) as service,
        CASE 
          WHEN i.fecha_vencimiento >= CURRENT_DATE AND i.ingresos_disponibles > 0 THEN 'active'
          ELSE 'inactive'
        END as status,
        TO_CHAR(i.fecha_inicio, 'YYYY-MM-DD') as registrationDate
      FROM personas p
      INNER JOIN inscripciones i ON p.id = i.persona_id
      INNER JOIN servicios s ON i.servicio_id = s.id AND s.estado = 1
      INNER JOIN sucursales su ON i.sucursal_id = su.id AND su.estado = 1
      ${whereClause}
      ORDER BY p.nombres, p.apellidos
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    // Consulta para contar total - CORREGIDA (COUNT correcto)
    const countQuery = `
      SELECT COUNT(*)
      FROM (
        SELECT DISTINCT p.id, i.sucursal_id
        FROM personas p
        INNER JOIN inscripciones i ON p.id = i.persona_id
        INNER JOIN servicios s ON i.servicio_id = s.id AND s.estado = 1
        INNER JOIN sucursales su ON i.sucursal_id = su.id AND su.estado = 1
        ${whereClause}
      ) as total_count
    `;

    queryParams.push(limit, offset);

    console.log("Ejecutando consulta members:", membersQuery);
    console.log("Parámetros:", queryParams);

    const membersResult = await query(membersQuery, queryParams);
    const countResult = await query(countQuery, queryParams.slice(0, -2));

    // Agrupar servicios por persona y sucursal
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
          ingresos_disponibles: row.ingresos_disponibles || 0,
          services: [],
          status: row.status || "inactive",
          registrationDate: row.registrationdate || "",
        });
      }

      const member = membersMap.get(key);
      member.services.push(row.service);
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

// Obtener todos los miembros (sin paginación) - CONSULTA CORREGIDA
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

    // Filtro por estado
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "active") {
        whereConditions.push(
          `i.fecha_vencimiento >= CURRENT_DATE AND i.ingresos_disponibles > 0`
        );
      } else if (statusFilter === "inactive") {
        whereConditions.push(
          `(i.fecha_vencimiento < CURRENT_DATE OR i.ingresos_disponibles = 0)`
        );
      }
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    const queryText = `
      SELECT 
        p.id,
        CONCAT(p.nombres, ' ', p.apellidos) as name,
        p.ci,
        p.telefono as phone,
        TO_CHAR(p.fecha_nacimiento, 'YYYY-MM-DD') as birthDate,
        i.sucursal_id as sucursal_id,
        su.nombre as sucursal_name,
        i.ingresos_disponibles,
        jsonb_build_object(
          'name', s.nombre,
          'expirationDate', TO_CHAR(i.fecha_vencimiento, 'YYYY-MM-DD'),
          'status', CASE 
            WHEN i.fecha_vencimiento >= CURRENT_DATE AND i.ingresos_disponibles > 0 THEN 'active' 
            ELSE 'inactive' 
          END
        ) as service,
        CASE 
          WHEN i.fecha_vencimiento >= CURRENT_DATE AND i.ingresos_disponibles > 0 THEN 'active'
          ELSE 'inactive'
        END as status,
        TO_CHAR(i.fecha_inicio, 'YYYY-MM-DD') as registrationDate
      FROM personas p
      INNER JOIN inscripciones i ON p.id = i.persona_id
      INNER JOIN servicios s ON i.servicio_id = s.id AND s.estado = 1
      INNER JOIN sucursales su ON i.sucursal_id = su.id AND su.estado = 1
      ${whereClause}
      ORDER BY p.nombres, p.apellidos
    `;

    console.log("Ejecutando consulta todos los miembros:", queryText);
    console.log("Parámetros:", queryParams);

    const result = await query(queryText, queryParams);

    // Agrupar servicios por persona y sucursal
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
          ingresos_disponibles: row.ingresos_disponibles || 0,
          services: [],
          status: row.status || "inactive",
          registrationDate: row.registrationdate || "",
        });
      }

      const member = membersMap.get(key);
      member.services.push(row.service);
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
const editMember = async (id, nombres, apellidos, ci, phone, birthDate) => {
  try {
    // Verificar si el CI ya existe en otro miembro
    const checkCiQuery = `
      SELECT id FROM personas WHERE ci = $1 AND id != $2
    `;
    const ciResult = await query(checkCiQuery, [ci, id]);

    if (ciResult.rows.length > 0) {
      throw new Error("La cédula de identidad ya existe para otro miembro");
    }

    const updateQuery = `
      UPDATE personas 
      SET nombres = $1, apellidos = $2, ci = $3, telefono = $4, fecha_nacimiento = $5
      WHERE id = $6
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
      throw new Error("Miembro no encontrado");
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error en editMember service:", error);
    throw new Error(
      `Error al editar miembro en la base de datos: ${error.message}`
    );
  }
};

// Eliminar miembro
const deleteMember = async (id) => {
  try {
    // Verificar si el miembro existe
    const checkQuery = "SELECT * FROM personas WHERE id = $1";
    const checkResult = await query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      throw new Error("Miembro no encontrado");
    }

    // Primero eliminamos las inscripciones relacionadas
    await query("DELETE FROM inscripciones WHERE persona_id = $1", [id]);

    // Luego eliminamos la persona
    const result = await query(
      "DELETE FROM personas WHERE id = $1 RETURNING *",
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

// Obtener servicios disponibles
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

// Obtener sucursales disponibles
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
