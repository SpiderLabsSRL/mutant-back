// src/services/newtransactionService.js
const { query, pool } = require("../../db");

// ============================================
// GET ALL TRANSACTIONS (movimientos_caja)
// ============================================
exports.getTransactions = async () => {
  const result = await query(`
    SELECT 
      mc.id as idtransaccion,
      mc.tipo,
      mc.descripcion,
      mc.monto,
      mc.fecha,
      mc.caja_id,
      mc.usuario_id,
      mc.monto_anterior,
      mc.monto_actual,
      c.nombre as nombre_caja,
      CONCAT(p.nombres, ' ', p.apellidos) as nombre_usuario
    FROM movimientos_caja mc
    INNER JOIN cajas c ON mc.caja_id = c.id
    INNER JOIN usuarios u ON mc.usuario_id = u.id
    INNER JOIN empleados e ON u.empleado_id = e.id
    INNER JOIN personas p ON e.persona_id = p.id
    ORDER BY mc.fecha DESC
  `);
  return result.rows;
};

// ============================================
// GET TRANSACTIONS BY CASH REGISTER AND USER (hoy)
// ============================================
exports.getTransactionsByCashRegisterAndUser = async (idCaja, idUsuario) => {
  const result = await query(
    `
    SELECT 
      mc.id as idtransaccion,
      mc.tipo,
      mc.descripcion,
      mc.monto,
      mc.fecha,
      mc.caja_id,
      mc.usuario_id,
      mc.monto_anterior,
      mc.monto_actual,
      c.nombre as nombre_caja,
      CONCAT(p.nombres, ' ', p.apellidos) as nombre_usuario
    FROM movimientos_caja mc
    INNER JOIN cajas c ON mc.caja_id = c.id
    INNER JOIN usuarios u ON mc.usuario_id = u.id
    INNER JOIN empleados e ON u.empleado_id = e.id
    INNER JOIN personas p ON e.persona_id = p.id
    WHERE mc.caja_id = $1 
      AND mc.usuario_id = $2
      AND mc.fecha::date = (NOW() AT TIME ZONE 'America/La_Paz')::date
    ORDER BY mc.fecha DESC
  `,
    [idCaja, idUsuario]
  );
  return result.rows;
};

// ============================================
// CREATE TRANSACTION (ingreso/egreso)
// ============================================
exports.createTransaction = async ({
  tipo,
  descripcion,
  monto,
  idCaja,
  idUsuario,
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const cajaResult = await client.query(
      `SELECT estado_caja, COALESCE(total, 0) as total_actual 
       FROM cajas 
       WHERE id = $1 
       FOR UPDATE`,
      [idCaja]
    );

    if (cajaResult.rows.length === 0) {
      throw new Error("Caja no encontrada");
    }

    const cajaActual = cajaResult.rows[0];

    if (cajaActual.estado_caja !== "abierta") {
      throw new Error("La caja no está abierta para realizar transacciones");
    }

    const montoAnterior = parseFloat(cajaActual.total_actual);

    let montoActual = montoAnterior;
    if (tipo === "ingreso") {
      montoActual = montoAnterior + monto;
    } else if (tipo === "egreso") {
      montoActual = montoAnterior - monto;
    }

    const result = await client.query(
      `INSERT INTO movimientos_caja 
        (caja_id, usuario_id, monto, tipo, descripcion, monto_anterior, monto_actual, fecha)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id`,
      [
        idCaja,
        idUsuario,
        monto,
        tipo,
        descripcion,
        montoAnterior,
        montoActual,
      ]
    );

    await client.query(`UPDATE cajas SET total = $1 WHERE id = $2`, [
      montoActual,
      idCaja,
    ]);

    const transactionResult = await client.query(
      `
      SELECT 
        mc.id as idtransaccion,
        mc.tipo,
        mc.descripcion,
        mc.monto,
        mc.fecha,
        mc.caja_id,
        mc.usuario_id,
        mc.monto_anterior,
        mc.monto_actual,
        c.nombre as nombre_caja,
        CONCAT(p.nombres, ' ', p.apellidos) as nombre_usuario
      FROM movimientos_caja mc
      INNER JOIN cajas c ON mc.caja_id = c.id
      INNER JOIN usuarios u ON mc.usuario_id = u.id
      INNER JOIN empleados e ON u.empleado_id = e.id
      INNER JOIN personas p ON e.persona_id = p.id
      WHERE mc.id = $1
      `,
      [result.rows[0].id]
    );

    await client.query("COMMIT");
    return transactionResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in createTransaction service:", error);
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// GET CASH REGISTER STATUS
// ============================================
exports.getCashRegisterStatus = async (idCaja) => {
  const result = await query(
    `
    SELECT 
      c.id as caja_id,
      COALESCE(c.estado_caja, 'cerrada') as estado,
      COALESCE(c.total, 0) as monto_final,
      c.total as monto_inicial,
      c.nombre as nombre_caja,
      (SELECT usuario_id FROM movimientos_caja 
       WHERE caja_id = c.id 
       ORDER BY fecha DESC LIMIT 1) as usuario_id
    FROM cajas c
    WHERE c.id = $1
  `,
    [idCaja]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

// ============================================
// GET ASSIGNED CASH REGISTER
// --------------------------------------------
// - Si el usuario es ADMIN y viene sucursalId:
//     * Busca la caja abierta por ese admin en esa sucursal
//       (último movimiento de apertura sin cierre).
//     * Si no hay abierta, devuelve la primera caja activa
//       de esa sucursal (para que pueda abrirla).
// - Si el usuario NO es admin:
//     * Sigue usando empleado_caja (lógica original).
// ============================================
exports.getAssignedCashRegister = async (idUsuario, sucursalId) => {
  try {
    // 1. Obtener datos del usuario
    const userResult = await query(
      `SELECT u.empleado_id, e.rol, e.sucursal_id
       FROM usuarios u
       INNER JOIN empleados e ON u.empleado_id = e.id
       WHERE u.id = $1`,
      [idUsuario]
    );

    if (userResult.rows.length === 0) {
      throw new Error("Usuario no encontrado");
    }

    const { empleado_id: empleadoId, rol, sucursal_id: sucursalEmpleado } =
      userResult.rows[0];

    // ============================================
    // 🔥 ADMIN: caja por sucursal seleccionada
    // ============================================
    if (rol === "admin") {
      // Sucursal a usar: la que venga del frontend, o la del empleado, o la 1
      const sucursalFinal =
        Number(sucursalId) || Number(sucursalEmpleado) || 1;

      // 1) Buscar si el admin tiene una caja ABIERTA en esa sucursal.
      //    Se entiende "abierta por él" si el último movimiento de caja
      //    es una apertura (no cierre) hecha por este mismo usuario.
      const cajaAbiertaResult = await query(
        `
        SELECT c.id
        FROM cajas c
        WHERE c.sucursal_id = $1
          AND c.estado_caja = 'abierta'
          AND (
            SELECT mc.tipo
            FROM movimientos_caja mc
            WHERE mc.caja_id = c.id
            ORDER BY mc.fecha DESC
            LIMIT 1
          ) = 'apertura'
          AND (
            SELECT mc.usuario_id
            FROM movimientos_caja mc
            WHERE mc.caja_id = c.id
            ORDER BY mc.fecha DESC
            LIMIT 1
          ) = $2
        ORDER BY c.id ASC
        LIMIT 1
        `,
        [sucursalFinal, idUsuario]
      );

      if (cajaAbiertaResult.rows.length > 0) {
        return cajaAbiertaResult.rows[0].id;
      }

      // 2) Si no tiene caja abierta, devolver la primera caja CERRADA
      //    de esa sucursal para que pueda abrirla.
      const cajaCerradaResult = await query(
        `
        SELECT c.id
        FROM cajas c
        WHERE c.sucursal_id = $1
          AND c.estado_caja = 'cerrada'
        ORDER BY c.id ASC
        LIMIT 1
        `,
        [sucursalFinal]
      );

      if (cajaCerradaResult.rows.length > 0) {
        return cajaCerradaResult.rows[0].id;
      }

      // 3) Si esa sucursal no tiene cajas, intentar con cualquier caja
      //    activa (por si la sucursal aún no tiene cajas registradas).
      const cualquierCajaResult = await query(
        `
        SELECT c.id
        FROM cajas c
        WHERE c.sucursal_id = $1
        ORDER BY c.id ASC
        LIMIT 1
        `,
        [sucursalFinal]
      );

      if (cualquierCajaResult.rows.length > 0) {
        return cualquierCajaResult.rows[0].id;
      }

      throw new Error(
        `No hay cajas registradas para la sucursal ${sucursalFinal}`
      );
    }

    // ============================================
    // NO ADMIN: lógica original (empleado_caja)
    // ============================================
    const cashRegisterResult = await query(
      `
      SELECT caja_id 
      FROM empleado_caja 
      WHERE empleado_id = $1 AND estado = 1
      LIMIT 1
    `,
      [empleadoId]
    );

    if (cashRegisterResult.rows.length === 0) {
      throw new Error("No se encontró caja asignada para el empleado");
    }

    return cashRegisterResult.rows[0].caja_id;
  } catch (error) {
    console.error("Error in getAssignedCashRegister:", error);
    throw error;
  }
};

// ============================================
// OPEN CASH REGISTER
// ============================================
exports.openCashRegister = async (
  caja_id,
  monto_inicial,
  usuario_id,
  descripcion
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const cajaResult = await client.query(
      `SELECT estado_caja, COALESCE(total, 0) as total_actual 
       FROM cajas 
       WHERE id = $1 
       FOR UPDATE`,
      [caja_id]
    );

    if (cajaResult.rows.length === 0) {
      throw new Error("Caja no encontrada");
    }

    const cajaActual = cajaResult.rows[0];

    if (cajaActual.estado_caja === "abierta") {
      throw new Error("La caja ya está abierta");
    }

    const montoAnterior = parseFloat(cajaActual.total_actual);

    await client.query(
      `UPDATE cajas SET estado_caja = 'abierta', total = $1 WHERE id = $2`,
      [monto_inicial, caja_id]
    );

    await client.query(
      `INSERT INTO movimientos_caja 
        (caja_id, usuario_id, monto, tipo, descripcion, monto_anterior, monto_actual, fecha)
       VALUES ($1, $2, $3, 'apertura', $4, $5, $3, NOW())`,
      [
        caja_id,
        usuario_id,
        monto_inicial,
        descripcion ||
          `Apertura de caja con Bs. ${monto_inicial.toFixed(2)}`,
        montoAnterior,
      ]
    );

    await client.query("COMMIT");
    return { success: true, message: "Caja abierta correctamente" };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in openCashRegister service:", error);
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// CLOSE CASH REGISTER
// ============================================
exports.closeCashRegister = async (
  caja_id,
  monto_final,
  usuario_id,
  descripcion
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const cajaResult = await client.query(
      `SELECT estado_caja, COALESCE(total, 0) as total_actual 
       FROM cajas 
       WHERE id = $1 
       FOR UPDATE`,
      [caja_id]
    );

    if (cajaResult.rows.length === 0) {
      throw new Error("Caja no encontrada");
    }

    const cajaActual = cajaResult.rows[0];

    if (cajaActual.estado_caja !== "abierta") {
      throw new Error("La caja no está abierta");
    }

    const montoAnterior = parseFloat(cajaActual.total_actual);

    await client.query(
      `UPDATE cajas SET estado_caja = 'cerrada', total = $1 WHERE id = $2`,
      [monto_final, caja_id]
    );

    await client.query(
      `INSERT INTO movimientos_caja 
        (caja_id, usuario_id, monto, tipo, descripcion, monto_anterior, monto_actual, fecha)
       VALUES ($1, $2, $3, 'cierre', $4, $5, $3, NOW())`,
      [
        caja_id,
        usuario_id,
        monto_final,
        descripcion || `Cierre de caja con Bs. ${monto_final.toFixed(2)}`,
        montoAnterior,
      ]
    );

    await client.query("COMMIT");
    return { success: true, message: "Caja cerrada correctamente" };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in closeCashRegister service:", error);
    throw error;
  } finally {
    client.release();
  }
};