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
// CAJAS POR SUCURSAL (con nuevo campo estado_caja y total)
// ============================================
exports.getCashBoxesByBranch = async (branchId) => {
  const result = await query(
    `SELECT 
      id, 
      nombre, 
      sucursal_id, 
      estado,
      estado_caja,
      COALESCE(total, 0) as total
     FROM cajas 
     WHERE sucursal_id = $1 AND estado = 1 
     ORDER BY nombre`,
    [branchId]
  );
  return result.rows;
};

// ============================================
// ESTADO DE CAJA (monto final)
// ============================================
exports.getCashBoxStatus = async (cashBoxId) => {
  try {
    const result = await query(
      `SELECT COALESCE(total, 0) as monto_final, estado_caja
       FROM cajas 
       WHERE id = $1`,
      [cashBoxId]
    );

    if (result.rows.length === 0) {
      return { monto_final: "0", estado_caja: "cerrada" };
    }

    return result.rows[0];
  } catch (error) {
    console.error("Error al consultar estado de caja:", error);
    return { monto_final: "0", estado_caja: "cerrada" };
  }
};

// ============================================
// MOVIMIENTOS POR CAJA (usa movimientos_caja)
// ============================================
exports.getTransactionsByCashBox = async (
  cashBoxId,
  filters = {},
  page = 1,
  pageSize = 20
) => {
  try {
    console.log("🔍 Filtros recibidos en getTransactionsByCashBox:", filters);
    console.log("📄 Paginación:", { page, pageSize });

    const offset = (page - 1) * pageSize;

    // Preparar condiciones WHERE
    let whereConditions = ["mc.caja_id = $1"];
    let params = [cashBoxId];
    let paramCount = 2;

    // Filtro por fecha
    if (filters.dateFilterType === "specific" && filters.specificDate) {
      whereConditions.push(`DATE(mc.fecha) = $${paramCount}`);
      params.push(filters.specificDate);
      paramCount++;
    } else if (
      filters.dateFilterType === "range" &&
      filters.startDate &&
      filters.endDate
    ) {
      whereConditions.push(
        `DATE(mc.fecha) BETWEEN $${paramCount} AND $${paramCount + 1}`
      );
      params.push(filters.startDate, filters.endDate);
      paramCount += 2;
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "WHERE mc.caja_id = $1";

    // Query para contar total
    const countQuery = `
      SELECT COUNT(*) as total_count 
      FROM movimientos_caja mc
      ${whereClause}
    `;

    // Query para obtener movimientos con paginación
    const transactionsQuery = `
      SELECT 
        mc.id, 
        mc.caja_id, 
        mc.tipo, 
        mc.descripcion, 
        mc.monto, 
        TO_CHAR(mc.fecha, 'DD/MM/YYYY, HH24:MI:SS') as fecha,
        mc.usuario_id,
        mc.monto_anterior,
        mc.monto_actual,
        mc.venta_servicio_id,
        mc.venta_producto_id,
        CONCAT(p.nombres, ' ', p.apellidos) as empleado_nombre
      FROM movimientos_caja mc
      JOIN usuarios u ON mc.usuario_id = u.id
      JOIN empleados e ON u.empleado_id = e.id
      JOIN personas p ON e.persona_id = p.id
      ${whereClause}
      ORDER BY mc.fecha DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    // Parámetros para paginación
    params.push(pageSize, offset);

    console.log("🔄 Ejecutando consultas para movimientos...");
    console.log("Where clause:", whereClause);
    console.log("Params:", params);

    const [countResult, transactionsResult] = await Promise.all([
      query(countQuery, params.slice(0, params.length - 2)),
      query(transactionsQuery, params),
    ]);

    const totalCount = parseInt(countResult.rows[0]?.total_count || 0);
    console.log(
      `✅ Movimientos encontrados: ${transactionsResult.rows.length} de ${totalCount} totales`
    );

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

// ============================================
// TOTALES DE MOVIMIENTOS
// ============================================
exports.getTransactionTotals = async (cashBoxId, filters = {}) => {
  try {
    console.log("📊 Calculando totales de movimientos con filtros:", filters);

    let whereConditions = ["mc.caja_id = $1"];
    let params = [cashBoxId];
    let paramCount = 2;

    // Filtro por fecha
    if (filters.dateFilterType === "specific" && filters.specificDate) {
      whereConditions.push(`DATE(mc.fecha) = $${paramCount}`);
      params.push(filters.specificDate);
      paramCount++;
    } else if (
      filters.dateFilterType === "range" &&
      filters.startDate &&
      filters.endDate
    ) {
      whereConditions.push(
        `DATE(mc.fecha) BETWEEN $${paramCount} AND $${paramCount + 1}`
      );
      params.push(filters.startDate, filters.endDate);
      paramCount += 2;
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "WHERE mc.caja_id = $1";

    // Query para totales de ingresos (ingreso + apertura)
    const ingresosQuery = `
      SELECT COALESCE(SUM(mc.monto), 0) as total_ingresos
      FROM movimientos_caja mc
      ${whereClause} AND mc.tipo IN ('ingreso', 'apertura')
    `;

    // Query para totales de egresos (egreso + cierre)
    const egresosQuery = `
      SELECT COALESCE(SUM(mc.monto), 0) as total_egresos
      FROM movimientos_caja mc
      ${whereClause} AND mc.tipo IN ('egreso', 'cierre')
    `;

    console.log("🔄 Ejecutando consultas para totales...");

    const [ingresosResult, egresosResult] = await Promise.all([
      query(ingresosQuery, params),
      query(egresosQuery, params),
    ]);

    const totalIngresos = parseFloat(
      ingresosResult.rows[0]?.total_ingresos || 0
    );
    const totalEgresos = parseFloat(egresosResult.rows[0]?.total_egresos || 0);

    console.log("📊 Resultados de totales:", {
      totalIngresos,
      totalEgresos,
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

// ============================================
// MOVIMIENTOS DE LACTOBAR POR SUCURSAL
// ============================================
exports.getLactobarTransactionsByBranch = async (branchId) => {
  const result = await query(
    `SELECT 
      mc.id, 
      mc.caja_id, 
      mc.tipo, 
      mc.descripcion, 
      mc.monto, 
      TO_CHAR(mc.fecha, 'DD/MM/YYYY, HH24:MI:SS') as fecha,
      mc.usuario_id,
      CONCAT(p.nombres, ' ', p.apellidos) as empleado_nombre
     FROM movimientos_caja mc
     JOIN cajas c ON mc.caja_id = c.id
     JOIN usuarios u ON mc.usuario_id = u.id
     JOIN empleados e ON u.empleado_id = e.id
     JOIN personas p ON e.persona_id = p.id
     WHERE c.sucursal_id = $1 AND c.nombre ILIKE '%lactobar%'
     ORDER BY mc.fecha DESC`,
    [branchId]
  );
  return result.rows;
};

// ============================================
// HELPERS ADICIONALES (para crear movimientos desde ventas)
// ============================================

/**
 * Registra un movimiento de caja
 * Se puede llamar desde otros servicios (ventas, apertura, cierre)
 */
exports.registrarMovimiento = async ({
  cajaId,
  usuarioId,
  monto,
  tipo,
  descripcion,
  ventaServicioId = null,
  ventaProductoId = null,
}) => {
  const client = await require("../../db").pool.connect();

  try {
    await client.query("BEGIN");

    // Obtener monto actual
    const cajaResult = await client.query(
      `SELECT COALESCE(total, 0) as total_actual FROM cajas WHERE id = $1 FOR UPDATE`,
      [cajaId]
    );

    if (cajaResult.rows.length === 0) {
      throw new Error("Caja no encontrada");
    }

    const montoAnterior = parseFloat(cajaResult.rows[0].total_actual);

    // Calcular nuevo monto
    let montoActual = montoAnterior;
    if (tipo === "ingreso" || tipo === "apertura") {
      montoActual = montoAnterior + parseFloat(monto);
    } else if (tipo === "egreso" || tipo === "cierre") {
      montoActual = montoAnterior - parseFloat(monto);
    }

    // Insertar movimiento
    const insertResult = await client.query(
      `INSERT INTO movimientos_caja 
        (caja_id, usuario_id, monto, tipo, descripcion, monto_anterior, monto_actual, 
         venta_servicio_id, venta_producto_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        cajaId,
        usuarioId,
        monto,
        tipo,
        descripcion,
        montoAnterior,
        montoActual,
        ventaServicioId,
        ventaProductoId,
      ]
    );

    // Actualizar total de la caja
    await client.query(`UPDATE cajas SET total = $1 WHERE id = $2`, [
      montoActual,
      cajaId,
    ]);

    await client.query("COMMIT");

    return insertResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Abre una caja
 */
exports.abrirCaja = async ({ cajaId, usuarioId, montoInicial }) => {
  const client = await require("../../db").pool.connect();

  try {
    await client.query("BEGIN");

    // Verificar que no esté abierta
    const cajaResult = await client.query(
      `SELECT estado_caja FROM cajas WHERE id = $1 FOR UPDATE`,
      [cajaId]
    );

    if (cajaResult.rows.length === 0) {
      throw new Error("Caja no encontrada");
    }

    if (cajaResult.rows[0].estado_caja === "abierta") {
      throw new Error("La caja ya está abierta");
    }

    // Actualizar estado y total
    await client.query(
      `UPDATE cajas SET estado_caja = 'abierta', total = $1 WHERE id = $2`,
      [montoInicial, cajaId]
    );

    // Registrar movimiento de apertura
    await client.query(
      `INSERT INTO movimientos_caja 
        (caja_id, usuario_id, monto, tipo, descripcion, monto_anterior, monto_actual)
       VALUES ($1, $2, $3, 'apertura', $4, 0, $3)`,
      [cajaId, usuarioId, montoInicial, "Apertura de caja"]
    );

    await client.query("COMMIT");

    return { success: true, montoInicial };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Cierra una caja
 */
exports.cerrarCaja = async ({ cajaId, usuarioId, montoFinal }) => {
  const client = await require("../../db").pool.connect();

  try {
    await client.query("BEGIN");

    const cajaResult = await client.query(
      `SELECT estado_caja, COALESCE(total, 0) as total_actual FROM cajas WHERE id = $1 FOR UPDATE`,
      [cajaId]
    );

    if (cajaResult.rows.length === 0) {
      throw new Error("Caja no encontrada");
    }

    if (cajaResult.rows[0].estado_caja !== "abierta") {
      throw new Error("La caja no está abierta");
    }

    const montoAnterior = parseFloat(cajaResult.rows[0].total_actual);

    // Actualizar estado y total
    await client.query(
      `UPDATE cajas SET estado_caja = 'cerrada', total = $1 WHERE id = $2`,
      [montoFinal, cajaId]
    );

    // Registrar movimiento de cierre
    await client.query(
      `INSERT INTO movimientos_caja 
        (caja_id, usuario_id, monto, tipo, descripcion, monto_anterior, monto_actual)
       VALUES ($1, $2, $3, 'cierre', $4, $5, $3)`,
      [
        cajaId,
        usuarioId,
        montoFinal,
        "Cierre de caja",
        montoAnterior,
      ]
    );

    await client.query("COMMIT");

    return { success: true, montoFinal };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};