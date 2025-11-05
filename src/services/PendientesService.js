// services/PendientesService.js
const { query, pool } = require("../../db");

// Obtener todos los pagos pendientes
exports.getPagosPendientes = async () => {
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
    WHERE pp.estado = 'pendiente'
    ORDER BY pp.fecha_inscripcion DESC
  `);
  
  // Convertir los montos de string a número
  return result.rows.map(row => ({
    ...row,
    montoTotal: parseFloat(row.montoTotal),
    montoPagado: parseFloat(row.montoPagado),
    montoPendiente: parseFloat(row.montoPendiente)
  }));
};

// Registrar un pago
exports.registrarPago = async (pagoId, pagoData) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Obtener el pago pendiente actual
    const pagoActual = await client.query(`
      SELECT 
        pp.monto_pagado, 
        pp.monto_pendiente, 
        pp.monto_total,
        pp.persona_id,
        pp.venta_servicio_id
      FROM pagos_pendientes pp
      WHERE pp.id = $1 AND pp.estado = 'pendiente'
    `, [pagoId]);
    
    if (pagoActual.rows.length === 0) {
      throw new Error("Pago pendiente no encontrado");
    }
    
    const { monto_pagado, monto_pendiente, monto_total, persona_id, venta_servicio_id } = pagoActual.rows[0];
    
    // Convertir a números
    const montoPagadoActual = parseFloat(monto_pagado);
    const montoPendienteActual = parseFloat(monto_pendiente);
    const montoTotalActual = parseFloat(monto_total);
    
    const nuevoMontoPagado = montoPagadoActual + parseFloat(pagoData.montoPagado);
    const nuevoMontoPendiente = montoPendienteActual - parseFloat(pagoData.montoPagado);
    
    if (nuevoMontoPendiente < 0) {
      throw new Error("El monto pagado no puede ser mayor al monto pendiente");
    }
    
    // Obtener fecha actual
    const fechaActualResult = await client.query(`
      SELECT TIMEZONE('America/La_Paz', NOW()) as fecha_actual
    `);
    const fechaActual = fechaActualResult.rows[0].fecha_actual;
    
    // Determinar el nuevo estado
    const nuevoEstado = nuevoMontoPendiente === 0 ? 'completado' : 'pendiente';
    
    // Actualizar el pago pendiente
    await client.query(`
      UPDATE pagos_pendientes 
      SET 
        monto_pagado = $1,
        monto_pendiente = $2,
        fecha_ultima_actualizacion = $3,
        estado = $4
      WHERE id = $5
    `, [nuevoMontoPagado, nuevoMontoPendiente, fechaActual, nuevoEstado, pagoId]);
    
    // Registrar transacción de caja para la parte en efectivo
    if (pagoData.formaPago === 'efectivo' || pagoData.formaPago === 'mixto') {
      const montoEfectivo = pagoData.formaPago === 'efectivo' 
        ? pagoData.montoPagado 
        : pagoData.montoEfectivo;
      
      if (montoEfectivo > 0) {
        // Obtener el último estado de caja para el monto inicial
        const lastCashStatus = await client.query(`
          SELECT id as estado_caja_id, monto_final 
          FROM estado_caja 
          WHERE caja_id = $1 
          ORDER BY id DESC 
          LIMIT 1
        `, [pagoData.cajaId]);
        
        const montoInicial = lastCashStatus.rows.length > 0 ? parseFloat(lastCashStatus.rows[0].monto_final) : 0;
        
        // Crear NUEVO estado_caja con el monto_inicial = último monto_final
        const montoFinal = montoInicial + parseFloat(montoEfectivo);
        
        const estadoCajaResult = await client.query(`
          INSERT INTO estado_caja (caja_id, estado, monto_inicial, monto_final, usuario_id)
          VALUES ($1, 'abierta', $2, $3, $4)
          RETURNING id
        `, [pagoData.cajaId, montoInicial, montoFinal, pagoData.empleadoId]);
        
        const nuevoEstadoCajaId = estadoCajaResult.rows[0].id;
        
        // Registrar transacción de caja
        await client.query(`
          INSERT INTO transacciones_caja (caja_id, estado_caja_id, tipo, descripcion, monto, fecha, usuario_id)
          VALUES ($1, $2, 'ingreso', 'Pago pendiente de servicio', $3, TIMEZONE('America/La_Paz', NOW()), $4)
        `, [pagoData.cajaId, nuevoEstadoCajaId, montoEfectivo, pagoData.empleadoId]);
      }
    }
    
    // Registrar la venta del pago
    const detallePago = pagoData.formaPago === 'efectivo' 
      ? 'Pago en efectivo de pendiente' 
      : pagoData.formaPago === 'qr' 
        ? 'Pago con QR de pendiente'
        : `Pago mixto de pendiente - Efectivo: ${pagoData.montoEfectivo}, QR: ${pagoData.montoQr}`;
    
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
      pagoData.montoPagado, // subtotal
      0, // descuento
      'Pago de deuda pendiente', // descripción descuento
      pagoData.montoPagado, // total
      pagoData.formaPago, // forma_pago
      detallePago, // detalle_pago
      pagoData.sucursalId, // sucursal_id
      pagoData.cajaId // caja_id
    ]);
    
    const nuevaVentaId = ventaResult.rows[0].id;
    
    // Obtener la inscripción original para el detalle de venta
    const inscripcionResult = await client.query(`
      SELECT dvs.inscripcion_id
      FROM detalle_venta_servicios dvs
      WHERE dvs.venta_servicio_id = $1
      LIMIT 1
    `, [venta_servicio_id]);
    
    if (inscripcionResult.rows.length > 0) {
      const inscripcionId = inscripcionResult.rows[0].inscripcion_id;
      
      // Registrar detalle de venta
      await client.query(`
        INSERT INTO detalle_venta_servicios (venta_servicio_id, inscripcion_id, precio)
        VALUES ($1, $2, $3)
      `, [nuevaVentaId, inscripcionId, pagoData.montoPagado]);
    }
    
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

// Cancelar pago pendiente
exports.cancelarPagoPendiente = async (pagoId) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Verificar que el pago existe y está pendiente
    const pagoExistente = await client.query(`
      SELECT id FROM pagos_pendientes 
      WHERE id = $1 AND estado = 'pendiente'
    `, [pagoId]);
    
    if (pagoExistente.rows.length === 0) {
      throw new Error("Pago pendiente no encontrado o ya no está pendiente");
    }
    
    // Obtener fecha actual
    const fechaActualResult = await client.query(`
      SELECT TIMEZONE('America/La_Paz', NOW()) as fecha_actual
    `);
    const fechaActual = fechaActualResult.rows[0].fecha_actual;
    
    // Actualizar estado a cancelado
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