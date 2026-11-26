const { query } = require("../../db");

// ============================================
// SUCURSALES
// ============================================
exports.getBranches = async () => {
  const result = await query(
    "SELECT id, nombre, estado FROM sucursales WHERE estado = 1 ORDER BY nombre"
  );
  return result.rows;
};

// ============================================
// CAJAS POR SUCURSAL
// ============================================
exports.getCashBoxesByBranch = async (branchId) => {
  const result = await query(
    `SELECT 
      id, 
      nombre, 
      sucursal_id, 
      estado,
      estado_caja,
      COALESCE(total, 0) as total,
      COALESCE(total_qr, 0) as total_qr
     FROM cajas 
     WHERE sucursal_id = $1 AND estado = 1 
     ORDER BY nombre`,
    [branchId]
  );
  return result.rows;
};

// ============================================
// ESTADO DE CAJA
// ============================================
exports.getCashBoxStatus = async (cashBoxId) => {
  try {
    const result = await query(
      `SELECT 
        COALESCE(total, 0) as monto_final,
        COALESCE(total_qr, 0) as monto_qr,
        estado_caja
       FROM cajas 
       WHERE id = $1`,
      [cashBoxId]
    );

    if (result.rows.length === 0) {
      return {
        monto_final: "0",
        monto_qr: "0",
        estado_caja: "cerrada",
      };
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error al consultar estado de caja:", error);

    return {
      monto_final: "0",
      monto_qr: "0",
      estado_caja: "cerrada",
    };
  }
};

// ============================================
// HELPER: construye WHERE para filtros de movimientos
// ============================================
function buildMovimientosWhere(cashBoxId, filters = {}) {
  const conditions = ["mc.caja_id = $1"];
  const params = [cashBoxId];
  let paramCount = 2;

  // ============================================
  // FILTRO POR FECHA
  // ============================================
  // La base de datos almacena la hora boliviana
  // representada como UTC (+00).
  //
  // Se utiliza UTC para conservar la fecha y hora
  // registrada, sin aplicar un segundo desfase.
  //
  // Inicio inclusivo y final exclusivo.
  // ============================================

  if (
    filters.dateFilterType === "specific" &&
    filters.specificDate
  ) {
    conditions.push(`
      mc.fecha >= (
        $${paramCount}::date::timestamp AT TIME ZONE 'UTC'
      )
      AND mc.fecha < (
        ($${paramCount}::date + 1)::timestamp AT TIME ZONE 'UTC'
      )
    `);

    params.push(filters.specificDate);
    paramCount++;
  } else if (
    filters.dateFilterType === "range" &&
    filters.startDate &&
    filters.endDate
  ) {
    conditions.push(`
      mc.fecha >= (
        $${paramCount}::date::timestamp AT TIME ZONE 'UTC'
      )
      AND mc.fecha < (
        ($${paramCount + 1}::date + 1)::timestamp AT TIME ZONE 'UTC'
      )
    `);

    params.push(filters.startDate, filters.endDate);
    paramCount += 2;
  }

  // --- Filtro por tipo ---
  if (filters.type && filters.type !== "all") {
    conditions.push(`mc.tipo = $${paramCount}`);
    params.push(filters.type);
    paramCount++;
  }

  // --- Filtro por método (efectivo | qr) ---
  if (
    filters.metodo &&
    ["efectivo", "qr"].includes(filters.metodo)
  ) {
    conditions.push(`mc.metodo = $${paramCount}`);
    params.push(filters.metodo);
    paramCount++;
  }

  // --- Filtro por empleado (nombre completo) ---
  if (
    filters.empleado &&
    filters.empleado !== "all"
  ) {
    conditions.push(
      `CONCAT(p.nombres, ' ', p.apellidos) = $${paramCount}`
    );

    params.push(filters.empleado);
    paramCount++;
  }

  return {
    whereClause: `WHERE ${conditions.join(" AND ")}`,
    params,
    paramCount,
  };
}

// ============================================
// MOVIMIENTOS POR CAJA (con filtros + paginación)
// ============================================
exports.getTransactionsByCashBox = async (
  cashBoxId,
  filters = {},
  page = 1,
  pageSize = 20
) => {
  try {
    console.log(
      "🔍 Filtros recibidos en getTransactionsByCashBox:",
      filters
    );

    console.log("📄 Paginación:", {
      page,
      pageSize,
    });

    const offset = (page - 1) * pageSize;

    const sortOrder =
      filters.sortOrder === "asc" ? "ASC" : "DESC";

    const { whereClause, params, paramCount } =
      buildMovimientosWhere(cashBoxId, filters);

    // Query para contar total
    const countQuery = `
      SELECT COUNT(*) as total_count 
      FROM movimientos_caja mc
      JOIN usuarios u ON mc.usuario_id = u.id
      JOIN empleados e ON u.empleado_id = e.id
      JOIN personas p ON e.persona_id = p.id
      ${whereClause}
    `;

    // Query para obtener movimientos con paginación.
    // La fecha conserva la hora registrada en Supabase.
    const transactionsQuery = `
      SELECT 
        mc.id, 
        mc.caja_id, 
        mc.tipo, 
        mc.metodo,
        mc.descripcion, 
        mc.monto,
        TO_CHAR(
          mc.fecha AT TIME ZONE 'UTC',
          'DD/MM/YYYY, HH24:MI:SS'
        ) as fecha,
        mc.usuario_id,
        mc.monto_anterior,
        mc.monto_actual,
        mc.venta_servicio_id,
        mc.venta_producto_id,
        CONCAT(
          p.nombres,
          ' ',
          p.apellidos
        ) as empleado_nombre
      FROM movimientos_caja mc
      JOIN usuarios u ON mc.usuario_id = u.id
      JOIN empleados e ON u.empleado_id = e.id
      JOIN personas p ON e.persona_id = p.id
      ${whereClause}
      ORDER BY mc.fecha ${sortOrder}, mc.id ${sortOrder}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    const transactionsParams = [
      ...params,
      pageSize,
      offset,
    ];

    console.log(
      "🔄 Ejecutando consultas para movimientos..."
    );

    console.log("Where clause:", whereClause);
    console.log("Params:", transactionsParams);

    const [countResult, transactionsResult] =
      await Promise.all([
        query(countQuery, params),
        query(transactionsQuery, transactionsParams),
      ]);

    const totalCount = parseInt(
      countResult.rows[0]?.total_count || 0
    );

    console.log(
      `✅ Movimientos encontrados: ${transactionsResult.rows.length} de ${totalCount} totales`
    );

    return {
      transactions: transactionsResult.rows,
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages:
          Math.ceil(totalCount / pageSize) || 1,
      },
    };
  } catch (error) {
    console.error(
      "❌ Error en getTransactionsByCashBox service:",
      error
    );

    throw error;
  }
};

// ============================================
// TOTALES DE MOVIMIENTOS (con los mismos filtros)
// ============================================
exports.getTransactionTotals = async (
  cashBoxId,
  filters = {}
) => {
  try {
    console.log(
      "📊 Calculando totales de movimientos con filtros:",
      filters
    );

    const { whereClause, params } =
      buildMovimientosWhere(cashBoxId, filters);

    const ingresosQuery = `
      SELECT
        COALESCE(SUM(mc.monto), 0) as total_ingresos
      FROM movimientos_caja mc
      JOIN usuarios u ON mc.usuario_id = u.id
      JOIN empleados e ON u.empleado_id = e.id
      JOIN personas p ON e.persona_id = p.id
      ${whereClause}
      AND mc.tipo IN ('ingreso', 'apertura')
    `;

    const egresosQuery = `
      SELECT
        COALESCE(SUM(mc.monto), 0) as total_egresos
      FROM movimientos_caja mc
      JOIN usuarios u ON mc.usuario_id = u.id
      JOIN empleados e ON u.empleado_id = e.id
      JOIN personas p ON e.persona_id = p.id
      ${whereClause}
      AND mc.tipo IN ('egreso', 'cierre')
    `;

    const [ingresosResult, egresosResult] =
      await Promise.all([
        query(ingresosQuery, params),
        query(egresosQuery, params),
      ]);

    const totalIngresos = parseFloat(
      ingresosResult.rows[0]?.total_ingresos || 0
    );

    const totalEgresos = parseFloat(
      egresosResult.rows[0]?.total_egresos || 0
    );

    console.log(
      "📊 Resultados de totales:",
      {
        totalIngresos,
        totalEgresos,
      }
    );

    return {
      totalIngresos,
      totalEgresos,
      totalCaja: 0,
    };
  } catch (error) {
    console.error(
      "❌ Error en getTransactionTotals service:",
      error
    );

    throw error;
  }
};

// ============================================
// MOVIMIENTOS DE LACTOBAR POR SUCURSAL
// ============================================
exports.getLactobarTransactionsByBranch = async (
  branchId
) => {
  const result = await query(
    `SELECT 
      mc.id, 
      mc.caja_id, 
      mc.tipo, 
      mc.metodo,
      mc.descripcion, 
      mc.monto,
      TO_CHAR(
        mc.fecha AT TIME ZONE 'UTC',
        'DD/MM/YYYY, HH24:MI:SS'
      ) as fecha,
      mc.usuario_id,
      CONCAT(
        p.nombres,
        ' ',
        p.apellidos
      ) as empleado_nombre
     FROM movimientos_caja mc
     JOIN cajas c ON mc.caja_id = c.id
     JOIN usuarios u ON mc.usuario_id = u.id
     JOIN empleados e ON u.empleado_id = e.id
     JOIN personas p ON e.persona_id = p.id
     WHERE c.sucursal_id = $1
     AND c.nombre ILIKE '%lactobar%'
     ORDER BY mc.fecha DESC`,
    [branchId]
  );

  return result.rows;
};

// ============================================
// NOTA: los movimientos de caja (ingresos/egresos
// en efectivo o QR) se registran con
// src/utils/cajaMovimientos.js, y la apertura/cierre
// con newtransactionService (abre y cierra efectivo
// + QR a la vez).
//
// Los helpers antiguos registrarMovimiento/abrirCaja/
// cerrarCaja no se usaban en ninguna ruta y no
// contemplaban QR, por eso se quitaron.
// ============================================