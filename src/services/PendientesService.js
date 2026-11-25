// services/PendientesService.js
const { query, pool } = require("../../db");
const { registrarCobroEnCaja, round2 } = require("../utils/cajaMovimientos");

// ============================================
// OBTENER PAGOS PENDIENTES
// ============================================
exports.getPagosPendientes = async (sucursalId) => {
  const result = await query(`
    SELECT 
      pp.id,
      pp.persona_id as "personaId",
      pp.venta_servicio_id as "ventaServicioId",
      p.nombres,
      p.apellidos,
      p.ci,
      s.nombre as "servicioNombre",
      pp.monto_total as "montoTotal",
      pp.monto_pagado as "montoPagado",
      pp.monto_pendiente as "montoPendiente",
      pp.fecha_inscripcion as "fechaInscripcion",
      pp.fecha_ultima_actualizacion as "fechaUltimaActualizacion",
      pp.estado
    FROM pagos_pendientes pp
    INNER JOIN personas p ON pp.persona_id = p.id
    INNER JOIN ventas_servicios vs ON pp.venta_servicio_id = vs.id
    INNER JOIN detalle_venta_servicios dvs ON vs.id = dvs.venta_servicio_id
    INNER JOIN inscripciones i ON dvs.inscripcion_id = i.id
    INNER JOIN servicios s ON i.servicio_id = s.id
    WHERE pp.estado = 'pendiente' AND i.sucursal_id = $1
    ORDER BY pp.fecha_inscripcion DESC
  `, [sucursalId]);
  
  return result.rows.map(row => ({
    ...row,
    montoTotal: parseFloat(row.montoTotal),
    montoPagado: parseFloat(row.montoPagado),
    montoPendiente: parseFloat(row.montoPendiente)
  }));
};

// ============================================
// REGISTRAR PAGO
// ============================================
exports.registrarPago = async (pagoId, pagoData) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Obtener datos actuales del pago pendiente
    const pagoActual = await client.query(`
      SELECT 
        pp.monto_pagado, 
        pp.monto_pendiente, 
        pp.monto_total,
        pp.persona_id,
        pp.venta_servicio_id
      FROM pagos_pendientes pp
      WHERE pp.id = $1 AND pp.estado = 'pendiente'
      FOR UPDATE
    `, [pagoId]);
    
    if (pagoActual.rows.length === 0) {
      throw new Error("Pago pendiente no encontrado");
    }
    
    const { 
      monto_pagado, 
      monto_pendiente, 
      monto_total, 
      persona_id, 
      venta_servicio_id 
    } = pagoActual.rows[0];
    
    const montoPagadoActual = parseFloat(monto_pagado);
    const montoPendienteActual = parseFloat(monto_pendiente);
    const montoTotalActual = parseFloat(monto_total);
    const montoPagadoNuevo = round2(parseFloat(pagoData.montoPagado));

    if (!(montoPagadoNuevo > 0)) {
      throw new Error("El monto pagado debe ser mayor a 0");
    }

    const nuevoMontoPagado = round2(montoPagadoActual + montoPagadoNuevo);
    const nuevoMontoPendiente = round2(montoPendienteActual - montoPagadoNuevo);

    if (nuevoMontoPendiente < 0) {
      throw new Error("El monto pagado no puede ser mayor al monto pendiente");
    }
    
    // 2. Fecha actual en zona horaria La Paz
    const fechaActualResult = await client.query(`
      SELECT TIMEZONE('America/La_Paz', NOW()) as fecha_actual
    `);
    const fechaActual = fechaActualResult.rows[0].fecha_actual;
    
    const nuevoEstado = nuevoMontoPendiente === 0 ? 'completado' : 'pendiente';
    
    // 3. Actualizar pagos_pendientes
    await client.query(`
      UPDATE pagos_pendientes 
      SET 
        monto_pagado = $1,
        monto_pendiente = $2,
        fecha_ultima_actualizacion = $3,
        estado = $4
      WHERE id = $5
    `, [nuevoMontoPagado, nuevoMontoPendiente, fechaActual, nuevoEstado, pagoId]);
    
    // 4. Obtener el usuario_id correspondiente al empleado
    const usuarioResult = await client.query(`
      SELECT id as usuario_id 
      FROM usuarios 
      WHERE empleado_id = $1
    `, [pagoData.empleadoId]);
    
    if (usuarioResult.rows.length === 0) {
      throw new Error("No se encontró un usuario asociado a este empleado");
    }
    
    const usuarioId = usuarioResult.rows[0].usuario_id;
    
    // 6. Construir detalle_pago en formato limpio y compatible con regex
    //    → efectivo: "Efectivo: 50"
    //    → qr:       "QR: 50"
    //    → mixto:    "Efectivo: 50, QR: 50"
    const detallePago =
      pagoData.formaPago === 'efectivo'
        ? `Efectivo: ${montoPagadoNuevo}`
        : pagoData.formaPago === 'qr'
          ? `QR: ${montoPagadoNuevo}`
          : `Efectivo: ${pagoData.montoEfectivo}, QR: ${pagoData.montoQr}`;
    
    // 7. Insertar la venta de servicio (registro contable del pago)
    const ventaResult = await client.query(`
      INSERT INTO ventas_servicios (
        persona_id, empleado_id, subtotal, descuento, descripcion_descuento, 
        total, forma_pago, detalle_pago, sucursal_id, caja_id, fecha
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TIMEZONE('America/La_Paz', NOW()))
      RETURNING id
    `, [
      persona_id,
      pagoData.empleadoId,
      montoPagadoNuevo,
      0,
      'Pago de deuda pendiente',
      montoPagadoNuevo,
      pagoData.formaPago,
      detallePago,
      pagoData.sucursalId,
      pagoData.cajaId
    ]);
    
    const nuevaVentaId = ventaResult.rows[0].id;
    
    // 8. Copiar el detalle de la venta original al nuevo registro
    const inscripcionResult = await client.query(`
      SELECT dvs.inscripcion_id
      FROM detalle_venta_servicios dvs
      WHERE dvs.venta_servicio_id = $1
      LIMIT 1
    `, [venta_servicio_id]);
    
    if (inscripcionResult.rows.length > 0) {
      const inscripcionId = inscripcionResult.rows[0].inscripcion_id;
      
      await client.query(`
        INSERT INTO detalle_venta_servicios (venta_servicio_id, inscripcion_id, precio)
        VALUES ($1, $2, $3)
      `, [nuevaVentaId, inscripcionId, montoPagadoNuevo]);
    }
    
    // 9. Movimientos de caja: efectivo → caja efectivo, QR → caja QR
    await registrarCobroEnCaja(client, {
      cajaId: pagoData.cajaId,
      usuarioId,
      formaPago: pagoData.formaPago,
      monto: montoPagadoNuevo,
      montoEfectivo: pagoData.montoEfectivo,
      montoQr: pagoData.montoQr,
      descripcion: `Pago de deuda pendiente (${detallePago})`,
      ventaServicioId: nuevaVentaId,
      mensajeCajaCerrada: "La caja no está abierta para registrar pagos",
    });

    await client.query('COMMIT');
    
    return {
      success: true,
      message: nuevoEstado === 'completado' 
        ? "Pago completado exitosamente" 
        : "Pago registrado exitosamente",
      nuevoEstado: nuevoEstado
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error registering payment:", error);
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// CANCELAR PAGO PENDIENTE
// ============================================
exports.cancelarPagoPendiente = async (pagoId) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const pagoExistente = await client.query(`
      SELECT id FROM pagos_pendientes 
      WHERE id = $1 AND estado = 'pendiente'
    `, [pagoId]);
    
    if (pagoExistente.rows.length === 0) {
      throw new Error("Pago pendiente no encontrado o ya no está pendiente");
    }
    
    const fechaActualResult = await client.query(`
      SELECT TIMEZONE('America/La_Paz', NOW()) as fecha_actual
    `);
    const fechaActual = fechaActualResult.rows[0].fecha_actual;
    
    await client.query(`
      UPDATE pagos_pendientes 
      SET 
        estado = 'cancelado',
        fecha_ultima_actualizacion = $1
      WHERE id = $2
    `, [fechaActual, pagoId]);
    
    await client.query('COMMIT');
    
    return {
      success: true,
      message: "Pago pendiente cancelado exitosamente"
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error canceling pending payment:", error);
    throw error;
  } finally {
    client.release();
  }
};