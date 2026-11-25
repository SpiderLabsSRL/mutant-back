// src/services/newtransactionService.js
const { query, pool } = require("../../db");
const {
  lockCaja,
  registrarMovimientoCaja,
  round2,
} = require("../utils/cajaMovimientos");

// Columnas comunes de un movimiento de caja
const MOVIMIENTO_SELECT = `
  mc.id as idtransaccion,
  mc.tipo,
  mc.metodo,
  mc.descripcion,
  mc.monto,
  mc.fecha,
  mc.caja_id,
  mc.usuario_id,
  mc.monto_anterior,
  mc.monto_actual,
  c.nombre as nombre_caja,
  CONCAT(p.nombres, ' ', p.apellidos) as nombre_usuario
`;

const MOVIMIENTO_JOINS = `
  FROM movimientos_caja mc
  INNER JOIN cajas c ON mc.caja_id = c.id
  INNER JOIN usuarios u ON mc.usuario_id = u.id
  INNER JOIN empleados e ON u.empleado_id = e.id
  INNER JOIN personas p ON e.persona_id = p.id
`;

// ============================================
// GET ALL TRANSACTIONS (movimientos_caja)
// ============================================
exports.getTransactions = async () => {
  const result = await query(`
    SELECT ${MOVIMIENTO_SELECT}
    ${MOVIMIENTO_JOINS}
    ORDER BY mc.fecha DESC, mc.id DESC
  `);
  return result.rows;
};

// ============================================
// GET TRANSACTIONS BY CASH REGISTER AND USER (hoy)
// Devuelve movimientos de efectivo y QR (campo `metodo`)
// ============================================
exports.getTransactionsByCashRegisterAndUser = async (idCaja, idUsuario) => {
  const result = await query(
    `
    SELECT ${MOVIMIENTO_SELECT}
    ${MOVIMIENTO_JOINS}
    WHERE mc.caja_id = $1
      AND mc.usuario_id = $2
      AND mc.fecha::date = (NOW() AT TIME ZONE 'America/La_Paz')::date
    ORDER BY mc.fecha DESC, mc.id DESC
  `,
    [idCaja, idUsuario]
  );
  return result.rows;
};

// ============================================
// CREATE TRANSACTION (ingreso/egreso en efectivo o QR)
// ============================================
exports.createTransaction = async ({
  tipo,
  descripcion,
  monto,
  idCaja,
  idUsuario,
  metodo = "efectivo",
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const movimiento = await registrarMovimientoCaja(client, {
      cajaId: idCaja,
      usuarioId: idUsuario,
      metodo,
      tipo,
      monto,
      descripcion,
      mensajeCajaCerrada: "La caja no está abierta para realizar transacciones",
    });

    const transactionResult = await client.query(
      `SELECT ${MOVIMIENTO_SELECT} ${MOVIMIENTO_JOINS} WHERE mc.id = $1`,
      [movimiento.id]
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
// monto_final = saldo efectivo, monto_qr = saldo QR
// ============================================
exports.getCashRegisterStatus = async (idCaja) => {
  const result = await query(
    `
    SELECT
      c.id as caja_id,
      COALESCE(c.estado_caja, 'cerrada') as estado,
      COALESCE(c.total, 0) as monto_final,
      c.total as monto_inicial,
      COALESCE(c.total_qr, 0) as monto_qr,
      c.nombre as nombre_caja,
      (SELECT usuario_id FROM movimientos_caja
       WHERE caja_id = c.id
       ORDER BY fecha DESC, id DESC LIMIT 1) as usuario_id
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
            SELECT mc.usuario_id
            FROM movimientos_caja mc
            WHERE mc.caja_id = c.id
              AND mc.tipo IN ('apertura', 'cierre')
            ORDER BY mc.fecha DESC, mc.id DESC
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
// HELPER: confirmación del saldo QR (apertura y cierre)
// El saldo QR pasa de un turno a otro igual que el efectivo. En la apertura
// y en el cierre recepción indica el monto QR que ve en su app/banco; ese
// monto confirmado queda como saldo QR y se anota la diferencia si la hay.
// ============================================
function resolverQrConfirmado(qrSistema, monto_qr) {
  const sistema = round2(qrSistema);
  const confirmado =
    monto_qr === undefined || monto_qr === null || isNaN(monto_qr)
      ? sistema
      : round2(monto_qr);
  if (confirmado < 0) {
    throw new Error("El monto QR no puede ser negativo");
  }
  const diferencia = round2(confirmado - sistema);
  return { sistema, confirmado, diferencia };
}

function descripcionQr(accion, { sistema, confirmado, diferencia }) {
  let texto = `${accion} de caja QR: sistema Bs. ${sistema.toFixed(
    2
  )}, confirmado Bs. ${confirmado.toFixed(2)}`;
  if (diferencia !== 0) {
    texto += ` (diferencia Bs. ${diferencia > 0 ? "+" : ""}${diferencia.toFixed(
      2
    )})`;
  }
  return texto;
}

// ============================================
// OPEN CASH REGISTER (abre efectivo y QR a la vez)
// - Efectivo: arranca con monto_inicial (lo que quedó en el último cierre)
// - QR: arranca con el saldo QR del último cierre, confirmado por recepción
//   (monto_qr = lo que ve en su app/banco)
// ============================================
exports.openCashRegister = async (
  caja_id,
  monto_inicial,
  usuario_id,
  descripcion,
  monto_qr
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const caja = await lockCaja(client, caja_id);

    if (caja.estado_caja === "abierta") {
      throw new Error("La caja ya está abierta");
    }

    const montoInicial = round2(monto_inicial);
    const qr = resolverQrConfirmado(caja.total_qr, monto_qr);

    await client.query(
      `UPDATE cajas SET estado_caja = 'abierta', total = $1, total_qr = $2 WHERE id = $3`,
      [montoInicial, qr.confirmado, caja_id]
    );

    // Efectivo primero y QR después (mismo instante; el id define el orden)
    await client.query(
      `INSERT INTO movimientos_caja
        (caja_id, usuario_id, monto, tipo, metodo, descripcion, monto_anterior, monto_actual, fecha)
       VALUES ($1, $2, $3, 'apertura', 'efectivo', $4, $5, $3, TIMEZONE('America/La_Paz', NOW()))`,
      [
        caja_id,
        usuario_id,
        montoInicial,
        descripcion || `Apertura de caja con Bs. ${montoInicial.toFixed(2)}`,
        caja.total,
      ]
    );

    await client.query(
      `INSERT INTO movimientos_caja
        (caja_id, usuario_id, monto, tipo, metodo, descripcion, monto_anterior, monto_actual, fecha)
       VALUES ($1, $2, $3, 'apertura', 'qr', $4, $5, $3, TIMEZONE('America/La_Paz', NOW()))`,
      [
        caja_id,
        usuario_id,
        qr.confirmado,
        descripcionQr("Apertura", qr),
        qr.sistema,
      ]
    );

    await client.query("COMMIT");
    return {
      success: true,
      message: "Caja abierta correctamente",
      qr_sistema: qr.sistema,
      qr_confirmado: qr.confirmado,
      diferencia_qr: qr.diferencia,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in openCashRegister service:", error);
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// CLOSE CASH REGISTER (cierra efectivo y QR a la vez)
// - Efectivo: monto_final = efectivo que se deja en caja
// - QR: monto_qr = monto que recepción ve en su app/banco (confirmación).
//   No se retira dinero del QR: el monto confirmado queda como saldo QR
//   para el siguiente turno y se anota la diferencia si la hay.
// ============================================
exports.closeCashRegister = async (
  caja_id,
  monto_final,
  usuario_id,
  descripcion,
  monto_qr
) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const caja = await lockCaja(client, caja_id);

    if (caja.estado_caja !== "abierta") {
      throw new Error("La caja no está abierta");
    }

    const montoFinal = round2(monto_final);
    const qr = resolverQrConfirmado(caja.total_qr, monto_qr);

    await client.query(
      `UPDATE cajas SET estado_caja = 'cerrada', total = $1, total_qr = $2 WHERE id = $3`,
      [montoFinal, qr.confirmado, caja_id]
    );

    await client.query(
      `INSERT INTO movimientos_caja
        (caja_id, usuario_id, monto, tipo, metodo, descripcion, monto_anterior, monto_actual, fecha)
       VALUES ($1, $2, $3, 'cierre', 'efectivo', $4, $5, $3, TIMEZONE('America/La_Paz', NOW()))`,
      [
        caja_id,
        usuario_id,
        montoFinal,
        descripcion || `Cierre de caja con Bs. ${montoFinal.toFixed(2)}`,
        caja.total,
      ]
    );

    await client.query(
      `INSERT INTO movimientos_caja
        (caja_id, usuario_id, monto, tipo, metodo, descripcion, monto_anterior, monto_actual, fecha)
       VALUES ($1, $2, $3, 'cierre', 'qr', $4, $5, $3, TIMEZONE('America/La_Paz', NOW()))`,
      [caja_id, usuario_id, qr.confirmado, descripcionQr("Cierre", qr), qr.sistema]
    );

    await client.query("COMMIT");
    return {
      success: true,
      message: "Caja cerrada correctamente",
      qr_sistema: qr.sistema,
      qr_confirmado: qr.confirmado,
      diferencia_qr: qr.diferencia,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in closeCashRegister service:", error);
    throw error;
  } finally {
    client.release();
  }
};
