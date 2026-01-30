const { query } = require("../../db");

exports.getBranches = async () => {
  const result = await query(
    "SELECT id, nombre, estado FROM sucursales WHERE estado = 1 ORDER BY nombre"
  );
  return result.rows;
};

exports.getCashBoxesByBranch = async (branchId) => {
  const result = await query(
    "SELECT id, nombre, sucursal_id, estado FROM cajas WHERE sucursal_id = $1 AND estado = 1 ORDER BY nombre",
    [branchId]
  );
  return result.rows;
};

exports.getCashBoxStatus = async (cashBoxId) => {
  try {
    const result = await query(
      `SELECT monto_final 
       FROM estado_caja 
       WHERE caja_id = $1 
       ORDER BY id DESC 
       LIMIT 1`,
      [cashBoxId]
    );
    
    if (result.rows.length === 0) {
      return { monto_final: "0" };
    }
    
    return result.rows[0];
  } catch (error) {
    console.error("Error al consultar estado_caja:", error);
    return { monto_final: "0" };
  }
};

exports.getTransactionsByCashBox = async (cashBoxId, filters = {}, page = 1, pageSize = 20) => {
  try {
    console.log("🔍 Filtros recibidos en getTransactionsByCashBox:", filters);
    console.log("📄 Paginación:", { page, pageSize });

    const offset = (page - 1) * pageSize;

    // Preparar condiciones WHERE
    let whereConditions = ["tc.caja_id = $1"];
    let params = [cashBoxId];
    let paramCount = 2;

    // Filtro por fecha
    if (filters.dateFilterType === "specific" && filters.specificDate) {
      whereConditions.push(`DATE(tc.fecha) = $${paramCount}`);
      params.push(filters.specificDate);
      paramCount++;
    } else if (
      filters.dateFilterType === "range" &&
      filters.startDate &&
      filters.endDate
    ) {
      whereConditions.push(`DATE(tc.fecha) BETWEEN $${paramCount} AND $${paramCount + 1}`);
      params.push(filters.startDate, filters.endDate);
      paramCount += 2;
    } else if (filters.dateFilterType === "today") {
      whereConditions.push(`DATE(tc.fecha) = CURRENT_DATE`);
    } else if (filters.dateFilterType === "yesterday") {
      whereConditions.push(`DATE(tc.fecha) = CURRENT_DATE - INTERVAL '1 day'`);
    } else if (filters.dateFilterType === "thisWeek") {
      whereConditions.push(`DATE(tc.fecha) >= DATE_TRUNC('week', CURRENT_DATE)`);
      whereConditions.push(`DATE(tc.fecha) <= CURRENT_DATE`);
    } else if (filters.dateFilterType === "lastWeek") {
      whereConditions.push(`DATE(tc.fecha) >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days'`);
      whereConditions.push(`DATE(tc.fecha) < DATE_TRUNC('week', CURRENT_DATE)`);
    } else if (filters.dateFilterType === "thisMonth") {
      whereConditions.push(`DATE(tc.fecha) >= DATE_TRUNC('month', CURRENT_DATE)`);
      whereConditions.push(`DATE(tc.fecha) <= CURRENT_DATE`);
    } else if (filters.dateFilterType === "lastMonth") {
      whereConditions.push(`DATE(tc.fecha) >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'`);
      whereConditions.push(`DATE(tc.fecha) < DATE_TRUNC('month', CURRENT_DATE)`);
    }
    // Para "all" no agregamos filtro de fecha

    // Construir WHERE clause
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : 'WHERE tc.caja_id = $1';

    // Query para contar total
    const countQuery = `
      SELECT COUNT(*) as total_count 
      FROM transacciones_caja tc
      ${whereClause}
    `;

    // Query para obtener transacciones con paginación
    const transactionsQuery = `
      SELECT 
        tc.id, 
        tc.caja_id, 
        tc.tipo, 
        tc.descripcion, 
        tc.monto, 
        tc.fecha, 
        tc.usuario_id,
        CONCAT(p.nombres, ' ', p.apellidos) as empleado_nombre
      FROM transacciones_caja tc
      JOIN usuarios u ON tc.usuario_id = u.id
      JOIN empleados e ON u.empleado_id = e.id
      JOIN personas p ON e.persona_id = p.id
      ${whereClause}
      ORDER BY tc.fecha DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    // Parámetros para paginación
    params.push(pageSize, offset);

    console.log("🔄 Ejecutando consultas para transacciones...");
    console.log("Query transacciones:", transactionsQuery.substring(0, 200) + "...");
    console.log("Params:", params);

    // Ejecutar consultas
    const [countResult, transactionsResult] = await Promise.all([
      query(countQuery, params.slice(0, params.length - 2)),
      query(transactionsQuery, params)
    ]);

    const totalCount = parseInt(countResult.rows[0]?.total_count || 0);
    console.log(`✅ Transacciones encontradas: ${transactionsResult.rows.length} de ${totalCount} totales`);

    return {
      transactions: transactionsResult.rows,
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    };
  } catch (error) {
    console.error("❌ Error en getTransactionsByCashBox service:", error);
    throw error;
  }
};

exports.getLactobarTransactionsByBranch = async (branchId) => {
  const result = await query(
    `SELECT 
      tc.id, 
      tc.caja_id, 
      tc.tipo, 
      tc.descripcion, 
      tc.monto, 
      tc.fecha, 
      tc.usuario_id,
      CONCAT(p.nombres, ' ', p.apellidos) as empleado_nombre
     FROM transacciones_caja tc
     JOIN cajas c ON tc.caja_id = c.id
     JOIN usuarios u ON tc.usuario_id = u.id
     JOIN empleados e ON u.empleado_id = e.id
     JOIN personas p ON e.persona_id = p.id
     WHERE c.sucursal_id = $1 AND c.nombre ILIKE '%lactobar%'
     ORDER BY tc.fecha DESC`,
    [branchId]
  );
  return result.rows;
};