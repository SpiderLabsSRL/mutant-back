// src/utils/cajaMovimientos.js
// ============================================
// Helpers de caja (combo efectivo + QR)
// --------------------------------------------
// Cada caja tiene dos saldos:
//   - cajas.total    → efectivo
//   - cajas.total_qr → QR (pasa de un turno a otro, como el efectivo)
// Cada movimiento en movimientos_caja indica su `metodo` ('efectivo' | 'qr')
// y su monto_anterior / monto_actual se calculan sobre el saldo de ese método.
// ============================================

const METODOS = ["efectivo", "qr"];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const columnaTotal = (metodo) => (metodo === "qr" ? "total_qr" : "total");

/**
 * Bloquea la caja (FOR UPDATE) y devuelve su estado y saldos.
 */
async function lockCaja(client, cajaId) {
  const result = await client.query(
    `SELECT id, nombre, estado_caja,
            COALESCE(total, 0)    AS total,
            COALESCE(total_qr, 0) AS total_qr
     FROM cajas
     WHERE id = $1
     FOR UPDATE`,
    [cajaId]
  );

  if (result.rows.length === 0) {
    throw new Error("Caja no encontrada");
  }

  const row = result.rows[0];
  return {
    ...row,
    total: parseFloat(row.total) || 0,
    total_qr: parseFloat(row.total_qr) || 0,
  };
}

/**
 * Registra un ingreso/egreso en la parte (efectivo o qr) de la caja
 * y actualiza el saldo correspondiente.
 *
 * @returns {Promise<{id:number, montoAnterior:number, montoActual:number}>}
 */
async function registrarMovimientoCaja(
  client,
  {
    cajaId,
    usuarioId,
    metodo = "efectivo",
    tipo,
    monto,
    descripcion,
    ventaServicioId = null,
    ventaProductoId = null,
    requiereAbierta = true,
    mensajeCajaCerrada = "La caja no está abierta",
  }
) {
  if (!METODOS.includes(metodo)) {
    throw new Error(`Método de caja inválido: ${metodo}`);
  }
  if (!["ingreso", "egreso"].includes(tipo)) {
    throw new Error(`Tipo de movimiento inválido: ${tipo}`);
  }

  const montoNum = round2(monto);
  if (!(montoNum > 0)) {
    throw new Error("El monto del movimiento debe ser mayor a 0");
  }

  const caja = await lockCaja(client, cajaId);

  if (requiereAbierta && caja.estado_caja !== "abierta") {
    throw new Error(mensajeCajaCerrada);
  }

  const montoAnterior = metodo === "qr" ? caja.total_qr : caja.total;
  const montoActual = round2(
    tipo === "ingreso" ? montoAnterior + montoNum : montoAnterior - montoNum
  );

  const insert = await client.query(
    `INSERT INTO movimientos_caja
       (caja_id, usuario_id, monto, tipo, metodo, descripcion,
        monto_anterior, monto_actual, venta_servicio_id, venta_producto_id, fecha)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TIMEZONE('America/La_Paz', NOW()))
     RETURNING id`,
    [
      cajaId,
      usuarioId,
      montoNum,
      tipo,
      metodo,
      descripcion,
      montoAnterior,
      montoActual,
      ventaServicioId,
      ventaProductoId,
    ]
  );

  await client.query(
    `UPDATE cajas SET ${columnaTotal(metodo)} = $1 WHERE id = $2`,
    [montoActual, cajaId]
  );

  return { id: insert.rows[0].id, montoAnterior, montoActual };
}

/**
 * Divide un monto cobrado entre efectivo y QR según la forma de pago.
 * - efectivo → todo efectivo
 * - qr       → todo QR
 * - mixto    → usa montoEfectivo / montoQr; si no suman exactamente el monto
 *              (p.ej. pago en plazos) se reparte proporcionalmente.
 *              Sin datos de reparto → mitad y mitad.
 * La suma de ambas partes siempre es igual al monto.
 */
function splitMontoPorMetodo(formaPago, monto, montoEfectivo, montoQr) {
  const total = round2(monto);
  if (!(total > 0)) return { efectivo: 0, qr: 0 };

  if (formaPago === "efectivo") return { efectivo: total, qr: 0 };
  if (formaPago === "qr") return { efectivo: 0, qr: total };

  if (formaPago === "mixto") {
    const ef = Math.max(0, Number(montoEfectivo) || 0);
    const qr = Math.max(0, Number(montoQr) || 0);
    const suma = ef + qr;

    let efectivo;
    if (suma <= 0) {
      efectivo = round2(total / 2);
    } else if (Math.abs(suma - total) < 0.01) {
      efectivo = round2(ef);
    } else {
      efectivo = round2((total * ef) / suma);
    }
    efectivo = Math.min(Math.max(efectivo, 0), total);
    return { efectivo, qr: round2(total - efectivo) };
  }

  // Forma de pago desconocida: se trata como efectivo (comportamiento previo)
  return { efectivo: total, qr: 0 };
}

/**
 * Registra en caja lo cobrado (parte efectivo y parte QR).
 * Solo inserta movimientos para las partes > 0.
 */
async function registrarCobroEnCaja(
  client,
  {
    cajaId,
    usuarioId,
    formaPago,
    monto,
    montoEfectivo,
    montoQr,
    descripcion,
    ventaServicioId = null,
    ventaProductoId = null,
    mensajeCajaCerrada,
  }
) {
  const partes = splitMontoPorMetodo(formaPago, monto, montoEfectivo, montoQr);

  for (const metodo of METODOS) {
    if (partes[metodo] > 0) {
      await registrarMovimientoCaja(client, {
        cajaId,
        usuarioId,
        metodo,
        tipo: "ingreso",
        monto: partes[metodo],
        descripcion: `${descripcion} (${metodo === "qr" ? "QR" : "Efectivo"})`,
        ventaServicioId,
        ventaProductoId,
        mensajeCajaCerrada,
      });
    }
  }

  return partes;
}

module.exports = {
  METODOS,
  round2,
  lockCaja,
  registrarMovimientoCaja,
  splitMontoPorMetodo,
  registrarCobroEnCaja,
};
