const { query, pool } = require("../../db");

exports.getServicesByBranch = async (sucursalId) => {
  const result = await query(`
    SELECT s.id, s.nombre, s.precio, s.numero_ingresos, s.estado
    FROM servicios s
    INNER JOIN servicio_sucursal ss ON s.id = ss.servicio_id
    WHERE ss.sucursal_id = $1 AND s.estado = 1
    ORDER BY s.nombre
  `, [sucursalId]);
  
  return result.rows;
};

exports.searchPeople = async (searchTerm) => {
  const result = await query(`
    SELECT id, nombres, apellidos, ci, telefono, fecha_nacimiento
    FROM personas
    WHERE (nombres ILIKE $1 OR apellidos ILIKE $1 OR ci ILIKE $1)
    ORDER BY apellidos, nombres
    LIMIT 10
  `, [`%${searchTerm}%`]);
  
  return result.rows;
};

exports.getActiveSubscriptions = async (personaId) => {
  const result = await query(`
    SELECT i.id, i.servicio_id, i.fecha_inicio, i.fecha_vencimiento, i.estado
    FROM inscripciones i
    WHERE i.persona_id = $1 
    AND i.estado = 1 
    AND i.fecha_vencimiento >= CURRENT_DATE
  `, [personaId]);
  
  return result.rows;
};

exports.getCashRegisterStatus = async (cajaId) => {
  const result = await query(`
    SELECT c.id, ec.estado, ec.monto_inicial, ec.monto_final
    FROM cajas c
    INNER JOIN estado_caja ec ON c.id = ec.caja_id
    WHERE c.id = $1
    ORDER BY ec.id DESC
    LIMIT 1
  `, [cajaId]);
  
  return result.rows[0] || { estado: 'cerrada' };
};

exports.registerMember = async (registrationData) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    let personaId = registrationData.personaId;
    
    // Si no es un miembro existente, crear nueva persona
    if (!personaId) {
      const personaResult = await client.query(`
        INSERT INTO personas (nombres, apellidos, ci, telefono, fecha_nacimiento)
        VALUES ($1, $2, $3, $4, $5)
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
    
    // Crear inscripciones para cada servicio
    const inscripcionesIds = [];
    for (const servicio of registrationData.servicios) {
      // Verificar si ya existe una inscripción activa para este servicio
      const existingSubscription = await client.query(`
        SELECT id FROM inscripciones 
        WHERE persona_id = $1 AND servicio_id = $2 
        AND estado = 1 AND fecha_vencimiento >= CURRENT_DATE
      `, [personaId, servicio.servicioId]);
      
      if (existingSubscription.rows.length > 0) {
        // Actualizar inscripción existente
        const updateResult = await client.query(`
          UPDATE inscripciones 
          SET fecha_inicio = $1, fecha_vencimiento = $2, ingresos_disponibles = $3
          WHERE id = $4
          RETURNING id
        `, [
          servicio.fechaInicio,
          servicio.fechaVencimiento,
          (await client.query('SELECT numero_ingresos FROM servicios WHERE id = $1', [servicio.servicioId])).rows[0].numero_ingresos,
          existingSubscription.rows[0].id
        ]);
        
        inscripcionesIds.push(updateResult.rows[0].id);
      } else {
        // Crear nueva inscripción
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
          (await client.query('SELECT numero_ingresos FROM servicios WHERE id = $1', [servicio.servicioId])).rows[0].numero_ingresos
        ]);
        
        inscripcionesIds.push(inscripcionResult.rows[0].id);
      }
    }
    
    // Registrar venta de servicios
    const ventaResult = await client.query(`
      INSERT INTO ventas_servicios (
        persona_id, empleado_id, subtotal, descuento, descripcion_descuento, 
        total, forma_pago, detalle_pago, sucursal_id, caja_id, fecha
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING id
    `, [
      personaId,
      registrationData.empleadoId,
      registrationData.servicios.reduce((sum, s) => sum + s.precio, 0),
      registrationData.descuento,
      registrationData.descripcionDescuento,
      registrationData.total,
      registrationData.formaPago,
      registrationData.formaPago === 'mixto' 
        ? `Efectivo: ${registrationData.montoEfectivo}, QR: ${registrationData.montoQr}`
        : null,
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
    
    // Solo procesar transacciones de caja y estado de caja para pagos en efectivo o la parte efectivo del pago mixto
    if (registrationData.formaPago === 'efectivo' || registrationData.formaPago === 'mixto') {
      const montoEfectivo = registrationData.formaPago === 'efectivo' 
        ? registrationData.total 
        : registrationData.montoEfectivo;
      
      // Obtener el último estado de caja para el monto inicial
      const lastCashStatus = await client.query(`
        SELECT monto_final 
        FROM estado_caja 
        WHERE caja_id = $1 
        ORDER BY id DESC 
        LIMIT 1
      `, [registrationData.cajaId]);
      
      const montoInicial = lastCashStatus.rows.length > 0 ? lastCashStatus.rows[0].monto_final : 0;
      
      // Registrar transacción de caja (solo para efectivo)
      await client.query(`
        INSERT INTO transacciones_caja (caja_id, tipo, descripcion, monto, fecha, usuario_id)
        VALUES ($1, 'ingreso', 'Venta de servicio', $2, NOW(), $3)
      `, [registrationData.cajaId, montoEfectivo, registrationData.empleadoId]);
      
      // Actualizar estado_caja (solo para efectivo)
      const montoFinal = parseFloat(montoInicial) + parseFloat(montoEfectivo);
      
      await client.query(`
        INSERT INTO estado_caja (caja_id, estado, monto_inicial, monto_final, usuario_id)
        VALUES ($1, 'abierta', $2, $3, $4)
      `, [registrationData.cajaId, montoInicial, montoFinal, registrationData.empleadoId]);
    }
    
    // Los pagos QR (tanto puros como la parte QR del pago mixto) NO se registran en transacciones_caja ni estado_caja
    
    await client.query('COMMIT');
    
    return {
      success: true,
      ventaId: ventaId,
      message: "Inscripción registrada correctamente"
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error in registerMember service:", error);
    throw new Error(error.message || "Error al registrar la inscripción");
  } finally {
    client.release();
  }
};