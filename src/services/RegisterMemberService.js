const { query, pool } = require("../../db");

exports.getServicesByBranch = async (sucursalId) => {
  const result = await query(`
    SELECT s.id, s.nombre, s.precio, s.numero_ingresos, s.estado, s.multisucursal
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
    ORDER BY apellidos, nombres
    LIMIT 10
  `, [`%${searchTerm}%`]);
  
  return result.rows;
};

// MODIFICADO: Ahora acepta sucursalId como parámetro
exports.getActiveSubscriptions = async (personaId, sucursalId) => {
  const result = await query(`
    SELECT i.id, i.servicio_id, i.sucursal_id, i.fecha_inicio, i.fecha_vencimiento, 
           i.ingresos_disponibles, i.estado, s.multisucursal
    FROM inscripciones i
    INNER JOIN servicios s ON i.servicio_id = s.id
    WHERE i.persona_id = $1 
    AND i.estado = 1 
    AND i.fecha_vencimiento >= CURRENT_DATE
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
    
    // Obtener información de los servicios seleccionados
    const serviciosInfo = [];
    for (const servicio of registrationData.servicios) {
      const servicioResult = await client.query(`
        SELECT s.id, s.nombre, s.precio, s.numero_ingresos, s.multisucursal,
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
    
    // Crear inscripciones para cada servicio
    const inscripcionesIds = [];
    for (const servicio of serviciosInfo) {
      // Verificar si ya existe una inscripción activa para este servicio
      const existingSubscription = await client.query(`
        SELECT id, ingresos_disponibles FROM inscripciones 
        WHERE persona_id = $1 AND servicio_id = $2 
        AND estado = 1 AND fecha_vencimiento >= CURRENT_DATE
        AND (sucursal_id = $3 OR (SELECT multisucursal FROM servicios WHERE id = $2) = true)
      `, [personaId, servicio.servicioId, registrationData.sucursalId]);
      
      let inscripcionId;
      
      if (existingSubscription.rows.length > 0) {
        const existingSub = existingSubscription.rows[0];
        
        // Si la suscripción existe pero no tiene ingresos disponibles, podemos actualizarla
        if (existingSub.ingresos_disponibles <= 0) {
          // Actualizar inscripción existente (renovación)
          const updateResult = await client.query(`
            UPDATE inscripciones 
            SET fecha_inicio = $1, fecha_vencimiento = $2, ingresos_disponibles = $3
            WHERE id = $4
            RETURNING id
          `, [
            servicio.fechaInicio,
            servicio.fechaVencimiento,
            servicio.numero_ingresos,
            existingSub.id
          ]);
          
          inscripcionId = updateResult.rows[0].id;
        } else {
          // Si todavía tiene ingresos disponibles, no permitir reinscripción
          throw new Error(`El cliente ya tiene una suscripción activa para este servicio con ingresos disponibles`);
        }
      } else {
        // Crear nueva inscripción para la sucursal principal
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
        
        // Si el servicio es multisucursal, crear inscripciones en todas las sucursales disponibles
        if (servicio.multisucursal) {
          const otrasSucursales = await client.query(`
            SELECT sucursal_id 
            FROM servicio_sucursal 
            WHERE servicio_id = $1 AND sucursal_id != $2 AND disponible = true
          `, [servicio.servicioId, registrationData.sucursalId]);
          
          for (const otraSucursal of otrasSucursales.rows) {
            await client.query(`
              INSERT INTO inscripciones (persona_id, servicio_id, sucursal_id, fecha_inicio, fecha_vencimiento, ingresos_disponibles, estado)
              VALUES ($1, $2, $3, $4, $5, 0, 1)
            `, [
              personaId,
              servicio.servicioId,
              otraSucursal.sucursal_id,
              servicio.fechaInicio,
              servicio.fechaVencimiento
            ]);
          }
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
      const estadoCajaIdExistente = lastCashStatus.rows.length > 0 ? lastCashStatus.rows[0].estado_caja_id : null;
      
      // Actualizar estado_caja (solo para efectivo)
      const montoFinal = parseFloat(montoInicial) + parseFloat(montoEfectivo);
      
      const estadoCajaResult = await client.query(`
        INSERT INTO estado_caja (caja_id, estado, monto_inicial, monto_final, usuario_id)
        VALUES ($1, 'abierta', $2, $3, $4)
        RETURNING id
      `, [registrationData.cajaId, montoInicial, montoFinal, registrationData.empleadoId]);
      
      const nuevoEstadoCajaId = estadoCajaResult.rows[0].id;
      
      // Registrar transacción de caja (solo para efectivo) con referencia al estado_caja
      await client.query(`
        INSERT INTO transacciones_caja (caja_id, estado_caja_id, tipo, descripcion, monto, fecha, usuario_id)
        VALUES ($1, $2, 'ingreso', 'Venta de servicio', $3, NOW(), $4)
      `, [registrationData.cajaId, nuevoEstadoCajaId, montoEfectivo, registrationData.empleadoId]);
      
      // Si había un estado de caja anterior, actualizarlo a cerrado
      if (estadoCajaIdExistente) {
        await client.query(`
          UPDATE estado_caja SET estado = 'cerrada' WHERE id = $1
        `, [estadoCajaIdExistente]);
      }
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