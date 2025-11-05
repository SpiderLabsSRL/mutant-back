const { query, pool } = require("../../db");

exports.getServicesByBranch = async (sucursalId) => {
  const result = await query(`
    SELECT s.id, s.nombre, s.precio, s.numero_ingresos, s.estado, s.multisucursal,
           s.tipo_duracion, s.cantidad_duracion
    FROM servicios s
    INNER JOIN servicio_sucursal ss ON s.id = ss.servicio_id
    WHERE ss.sucursal_id = $1 AND s.estado = 1 AND ss.disponible = true
    ORDER BY s.nombre
  `, [sucursalId]);
  
  return result.rows;
};

exports.searchPeople = async (searchTerm) => {
  const result = await query(`
    SELECT id, nombres, apellidos, ci, telefono, fecha_nacimiento
    FROM personas
    WHERE (nombres ILIKE $1 OR apellidos ILIKE $1 OR ci ILIKE $1)
    AND estado = 0  -- SOLO personas con estado = 0
    ORDER BY apellidos, nombres
    LIMIT 10
  `, [`%${searchTerm}%`]);
  
  return result.rows;
};

exports.getActiveSubscriptions = async (personaId, sucursalId) => {
  const result = await query(`
    SELECT i.id, i.servicio_id, i.sucursal_id, i.fecha_inicio, i.fecha_vencimiento, 
           i.ingresos_disponibles, i.estado, s.multisucursal
    FROM inscripciones i
    INNER JOIN servicios s ON i.servicio_id = s.id
    WHERE i.persona_id = $1 
    AND i.estado = 1 
    AND i.fecha_vencimiento > CURRENT_DATE 
    AND (i.sucursal_id = $2 OR s.multisucursal = true)
  `, [personaId, sucursalId]);
  
  return result.rows;
};

exports.getCashRegisterStatus = async (cajaId) => {
  const result = await query(`
    SELECT ec.id as estado_caja_id, c.id as caja_id, ec.estado, 
           ec.monto_inicial, ec.monto_final, ec.usuario_id
    FROM cajas c
    INNER JOIN estado_caja ec ON c.id = ec.caja_id
    WHERE c.id = $1
    ORDER BY ec.id DESC
    LIMIT 1
  `, [cajaId]);
  
  return result.rows[0] || { estado: 'cerrada' };
};

const checkExistingPerson = async (client, ci) => {
  const existingPerson = await client.query(`
    SELECT id, nombres, apellidos, ci, telefono, fecha_nacimiento
    FROM personas 
    WHERE ci = $1 AND estado = 0  -- SOLO personas con estado = 0
  `, [ci]);
  
  return existingPerson.rows[0] || null;
};

exports.registerMember = async (registrationData) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    let personaId = registrationData.personaId;
    
    // Si no es un miembro existente, verificar si ya existe una persona con el mismo CI
    if (!personaId) {
      const { ci } = registrationData;
      
      const existingPerson = await checkExistingPerson(client, ci);
      if (existingPerson) {
        const error = new Error("La persona ya existe");
        error.existingPerson = existingPerson;
        throw error;
      }
      
      const personaResult = await client.query(`
        INSERT INTO personas (nombres, apellidos, ci, telefono, fecha_nacimiento, estado)
        VALUES ($1, $2, $3, $4, $5, 0)
        RETURNING id
      `, [
        registrationData.nombres,
        registrationData.apellidos,
        registrationData.ci,
        registrationData.telefono,
        registrationData.fechaNacimiento
      ]);
      
      personaId = personaResult.rows[0].id;
    }
    
    // Obtener información de los servicios seleccionados
    const serviciosInfo = [];
    for (const servicio of registrationData.servicios) {
      const servicioResult = await client.query(`
        SELECT s.id, s.nombre, s.precio, s.numero_ingresos, s.multisucursal,
               s.tipo_duracion, s.cantidad_duracion,
               ss.sucursal_id, ss.disponible
        FROM servicios s
        INNER JOIN servicio_sucursal ss ON s.id = ss.servicio_id
        WHERE s.id = $1 AND ss.sucursal_id = $2
      `, [servicio.servicioId, registrationData.sucursalId]);
      
      if (servicioResult.rows.length === 0) {
        throw new Error(`Servicio no disponible en esta sucursal: ${servicio.servicioId}`);
      }
      
      serviciosInfo.push({
        ...servicio,
        ...servicioResult.rows[0]
      });
    }
    
    // Obtener fecha actual desde el servidor con zona horaria de Bolivia
    const fechaActualResult = await client.query(`
      SELECT TIMEZONE('America/La_Paz', NOW()) as fecha_actual
    `);
    const fechaActual = fechaActualResult.rows[0].fecha_actual;
    
    // Crear inscripciones para cada servicio
    const inscripcionesIds = [];
    for (const servicio of serviciosInfo) {
      // Verificar si ya existe una inscripción activa para este servicio
      const existingSubscription = await client.query(`
        SELECT id, ingresos_disponibles, fecha_vencimiento 
        FROM inscripciones 
        WHERE persona_id = $1 AND servicio_id = $2 
        AND estado = 1 AND fecha_vencimiento > CURRENT_DATE
        AND (sucursal_id = $3 OR (SELECT multisucursal FROM servicios WHERE id = $2) = true)
      `, [personaId, servicio.servicioId, registrationData.sucursalId]);
      
      let inscripcionId;
      
      // SIEMPRE crear nueva inscripción - NO HACER UPDATE
      if (existingSubscription.rows.length > 0) {
        // Si ya existe una suscripción activa con ingresos disponibles, no permitir renovación
        const existingSub = existingSubscription.rows[0];
        if (existingSub.ingresos_disponibles > 0) {
          throw new Error(`El cliente ya tiene una suscripción activa para este servicio con ingresos disponibles`);
        }
      }
      
      // Crear NUEVA inscripción para la sucursal principal
      const inscripcionResult = await client.query(`
        INSERT INTO inscripciones (persona_id, servicio_id, sucursal_id, fecha_inicio, fecha_vencimiento, ingresos_disponibles, estado)
        VALUES ($1, $2, $3, $4, $5, $6, 1)
        RETURNING id
      `, [
        personaId,
        servicio.servicioId,
        registrationData.sucursalId,
        servicio.fechaInicio,
        servicio.fechaVencimiento,
        servicio.numero_ingresos
      ]);
      
      inscripcionId = inscripcionResult.rows[0].id;
      
      // Si el servicio es multisucursal, crear inscripciones en todas las sucursales disponibles CON LOS MISMOS INGRESOS DISPONIBLES
      if (servicio.multisucursal) {
        const otrasSucursales = await client.query(`
          SELECT sucursal_id 
          FROM servicio_sucursal 
          WHERE servicio_id = $1 AND sucursal_id != $2 AND disponible = true
        `, [servicio.servicioId, registrationData.sucursalId]);
        
        for (const otraSucursal of otrasSucursales.rows) {
          await client.query(`
            INSERT INTO inscripciones (persona_id, servicio_id, sucursal_id, fecha_inicio, fecha_vencimiento, ingresos_disponibles, estado)
            VALUES ($1, $2, $3, $4, $5, $6, 1)
          `, [
            personaId,
            servicio.servicioId,
            otraSucursal.sucursal_id,
            servicio.fechaInicio,
            servicio.fechaVencimiento,
            servicio.numero_ingresos  // Mismo número de ingresos para todas las sucursales
          ]);
        }
      }
      
      inscripcionesIds.push(inscripcionId);
    }
    
    // Determinar el detalle del pago según la forma de pago
    let detallePago = null;
    if (registrationData.formaPago === 'efectivo') {
      detallePago = 'Pago completo en efectivo';
    } else if (registrationData.formaPago === 'qr') {
      detallePago = 'Pago completo con QR';
    } else if (registrationData.formaPago === 'mixto') {
      detallePago = `Efectivo: ${registrationData.montoEfectivo}, QR: ${registrationData.montoQr}`;
    }
    
    // Si es pago en plazos, agregar información al detalle
    if (registrationData.pagoPlazos) {
      detallePago += ` | Pago en plazos - Entregado: ${registrationData.montoEntregado}, Pendiente: ${registrationData.montoPendiente}`;
    }
    
    // Registrar venta de servicios usando la fecha del servidor
    const ventaResult = await client.query(`
      INSERT INTO ventas_servicios (
        persona_id, empleado_id, subtotal, descuento, descripcion_descuento, 
        total, forma_pago, detalle_pago, sucursal_id, caja_id, fecha
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TIMEZONE('America/La_Paz', NOW()))
      RETURNING id
    `, [
      personaId,
      registrationData.empleadoId,
      registrationData.servicios.reduce((sum, s) => sum + s.precio, 0),
      registrationData.descuento,
      registrationData.descripcionDescuento,
      registrationData.total,
      registrationData.formaPago,
      detallePago,
      registrationData.sucursalId,
      registrationData.cajaId
    ]);
    
    const ventaId = ventaResult.rows[0].id;
    
    // Registrar detalles de venta
    for (let i = 0; i < registrationData.servicios.length; i++) {
      await client.query(`
        INSERT INTO detalle_venta_servicios (venta_servicio_id, inscripcion_id, precio)
        VALUES ($1, $2, $3)
      `, [ventaId, inscripcionesIds[i], registrationData.servicios[i].precio]);
    }
    
    // Registrar pago pendiente si es pago en plazos
    let pagoPendienteId = null;
    if (registrationData.pagoPlazos && registrationData.montoPendiente > 0) {
      const pagoPendienteResult = await client.query(`
        INSERT INTO pagos_pendientes (
          persona_id, venta_servicio_id, monto_total, monto_pagado, monto_pendiente,
          fecha_inscripcion, fecha_ultima_actualizacion, estado
        )
        VALUES ($1, $2, $3, $4, $5, $6, $6, 'pendiente')
        RETURNING id
      `, [
        personaId,
        ventaId,
        registrationData.servicios.reduce((sum, s) => sum + s.precio, 0) - registrationData.descuento,
        registrationData.montoEntregado,
        registrationData.montoPendiente,
        fechaActual
      ]);
      
      pagoPendienteId = pagoPendienteResult.rows[0].id;
    }
    
    // Solo procesar transacciones de caja y estado de caja para pagos en efectivo o la parte efectivo del pago mixto
    if (registrationData.formaPago === 'efectivo' || registrationData.formaPago === 'mixto') {
      const montoEfectivo = registrationData.formaPago === 'efectivo' 
        ? registrationData.total 
        : registrationData.montoEfectivo;
      
      // Obtener el último estado de caja para el monto inicial
      const lastCashStatus = await client.query(`
        SELECT id as estado_caja_id, monto_final 
        FROM estado_caja 
        WHERE caja_id = $1 
        ORDER BY id DESC 
        LIMIT 1
      `, [registrationData.cajaId]);
      
      const montoInicial = lastCashStatus.rows.length > 0 ? lastCashStatus.rows[0].monto_final : 0;
      
      // Crear NUEVO estado_caja con el monto_inicial = último monto_final
      const montoFinal = parseFloat(montoInicial) + parseFloat(montoEfectivo);
      
      const estadoCajaResult = await client.query(`
        INSERT INTO estado_caja (caja_id, estado, monto_inicial, monto_final, usuario_id)
        VALUES ($1, 'abierta', $2, $3, $4)
        RETURNING id
      `, [registrationData.cajaId, montoInicial, montoFinal, registrationData.empleadoId]);
      
      const nuevoEstadoCajaId = estadoCajaResult.rows[0].id;
      
      // Registrar transacción de caja (solo para efectivo) con referencia al NUEVO estado_caja
      await client.query(`
        INSERT INTO transacciones_caja (caja_id, estado_caja_id, tipo, descripcion, monto, fecha, usuario_id)
        VALUES ($1, $2, 'ingreso', 'Venta de servicio', $3, TIMEZONE('America/La_Paz', NOW()), $4)
      `, [registrationData.cajaId, nuevoEstadoCajaId, montoEfectivo, registrationData.empleadoId]);
    }
    
    await client.query('COMMIT');
    
    return {
      success: true,
      ventaId: ventaId,
      pagoPendienteId: pagoPendienteId,
      message: registrationData.pagoPlazos ? 
        "Inscripción registrada correctamente con pago en plazos" : 
        "Inscripción registrada correctamente"
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error in registerMember service:", error);
    throw error;
  } finally {
    client.release();
  }
};

// Obtener pagos pendientes de una persona
exports.getPagosPendientes = async (personaId) => {
  const result = await client.query(`
    SELECT 
      pp.id,
      pp.persona_id as "personaId",
      pp.venta_servicio_id as "ventaServicioId",
      pp.monto_total as "montoTotal",
      pp.monto_pagado as "montoPagado",
      pp.monto_pendiente as "montoPendiente",
      pp.fecha_inscripcion as "fechaInscripcion",
      pp.fecha_ultima_actualizacion as "fechaUltimaActualizacion",
      pp.estado
    FROM pagos_pendientes pp
    WHERE pp.persona_id = $1 AND pp.estado = 'pendiente'
    ORDER BY pp.fecha_inscripcion DESC
  `, [personaId]);
  
  return result.rows;
};

// Actualizar pago pendiente
exports.updatePagoPendiente = async (pagoId, montoPagado) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Obtener el pago pendiente actual
    const pagoActual = await client.query(`
      SELECT monto_pagado, monto_pendiente, monto_total
      FROM pagos_pendientes
      WHERE id = $1 AND estado = 'pendiente'
    `, [pagoId]);
    
    if (pagoActual.rows.length === 0) {
      throw new Error("Pago pendiente no encontrado");
    }
    
    const { monto_pagado, monto_pendiente, monto_total } = pagoActual.rows[0];
    
    const nuevoMontoPagado = parseFloat(monto_pagado) + parseFloat(montoPagado);
    const nuevoMontoPendiente = parseFloat(monto_pendiente) - parseFloat(montoPagado);
    
    if (nuevoMontoPendiente < 0) {
      throw new Error("El monto pagado no puede ser mayor al monto pendiente");
    }
    
    // Obtener fecha actual
    const fechaActualResult = await client.query(`
      SELECT TIMEZONE('America/La_Paz', NOW()) as fecha_actual
    `);
    const fechaActual = fechaActualResult.rows[0].fecha_actual;
    
    // Actualizar el pago pendiente
    await client.query(`
      UPDATE pagos_pendientes 
      SET 
        monto_pagado = $1,
        monto_pendiente = $2,
        fecha_ultima_actualizacion = $3,
        estado = CASE WHEN $2 = 0 THEN 'completado' ELSE 'pendiente' END
      WHERE id = $4
    `, [nuevoMontoPagado, nuevoMontoPendiente, fechaActual, pagoId]);
    
    await client.query('COMMIT');
    
    return {
      success: true,
      message: nuevoMontoPendiente === 0 ? 
        "Pago completado exitosamente" : 
        "Pago actualizado exitosamente"
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error updating pending payment:", error);
    throw error;
  } finally {
    client.release();
  }
};