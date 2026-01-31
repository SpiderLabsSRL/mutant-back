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

    // Filtro por fecha - SIMPLIFICADO
    if (filters.dateFilterType === "specific" && filters.specificDate) {
      whereConditions.push(`DATE(tc.fecha) = $${paramCount}`);
      params.push(filters.specificDate);
      paramCount++;
    } else if (filters.dateFilterType === "range" && filters.startDate && filters.endDate) {
      whereConditions.push(`DATE(tc.fecha) BETWEEN $${paramCount} AND $${paramCount + 1}`);
      params.push(filters.startDate, filters.endDate);
      paramCount += 2;
    }
    // Para "today", "yesterday", etc. el frontend ya los convierte a "specific" o "range"
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
        TO_CHAR(tc.fecha, 'DD/MM/YYYY, HH24:MI:SS') as fecha,
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
    console.log("Where clause:", whereClause);
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

exports.getTransactionTotals = async (cashBoxId, filters = {}) => {
  try {
    console.log("📊 Calculando totales de transacciones con filtros:", filters);

    // Preparar condiciones WHERE
    let whereConditions = ["tc.caja_id = $1"];
    let params = [cashBoxId];
    let paramCount = 2;

    // Filtro por fecha - SIMPLIFICADO
    if (filters.dateFilterType === "specific" && filters.specificDate) {
      whereConditions.push(`DATE(tc.fecha) = $${paramCount}`);
      params.push(filters.specificDate);
      paramCount++;
    } else if (filters.dateFilterType === "range" && filters.startDate && filters.endDate) {
      whereConditions.push(`DATE(tc.fecha) BETWEEN $${paramCount} AND $${paramCount + 1}`);
      params.push(filters.startDate, filters.endDate);
      paramCount += 2;
    }
    // Para "all" no agregamos filtro de fecha

    // Construir WHERE clause
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : 'WHERE tc.caja_id = $1';

    // Query para totales de ingresos
    const ingresosQuery = `
      SELECT COALESCE(SUM(tc.monto), 0) as total_ingresos
      FROM transacciones_caja tc
      ${whereClause} AND tc.tipo IN ('ingreso', 'apertura')
    `;

    // Query para totales de egresos
    const egresosQuery = `
      SELECT COALESCE(SUM(tc.monto), 0) as total_egresos
      FROM transacciones_caja tc
      ${whereClause} AND tc.tipo IN ('egreso', 'cierre')
    `;

    console.log("🔄 Ejecutando consultas para totales...");
    console.log("Where clause:", whereClause);
    console.log("Params:", params);

    // Ejecutar consultas en paralelo
    const [ingresosResult, egresosResult] = await Promise.all([
      query(ingresosQuery, params),
      query(egresosQuery, params)
    ]);

    const totalIngresos = parseFloat(ingresosResult.rows[0]?.total_ingresos || 0);
    const totalEgresos = parseFloat(egresosResult.rows[0]?.total_egresos || 0);

    console.log("📊 Resultados de totales de transacciones:", {
      totalIngresos,
      totalEgresos
    });

    return {
      totalIngresos,
      totalEgresos,
      totalCaja: 0,
    };
  } catch (error) {
    console.error("❌ Error en getTransactionTotals service:", error);
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
      TO_CHAR(tc.fecha, 'DD/MM/YYYY, HH24:MI:SS') as fecha,
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