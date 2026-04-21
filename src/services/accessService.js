const { query } = require("../../db");

exports.getAccessLogs = async (searchTerm, typeFilter, limit = 100, branchId) => {
  let sql = `
    SELECT 
      ra.id, 
      TO_CHAR(ra.fecha, 'YYYY-MM-DD HH24:MI') as fecha, 
      ra.persona_id, 
      ra.servicio_id,
      ra.detalle, 
      ra.estado, 
      ra.sucursal_id, 
      ra.usuario_registro_id, 
      ra.tipo_persona,
      p.nombres as persona_nombres,
      p.apellidos as persona_apellidos,
      p.ci as persona_ci,
      s.nombre as servicio_nombre
    FROM registros_acceso ra
    INNER JOIN personas p ON ra.persona_id = p.id
    LEFT JOIN servicios s ON ra.servicio_id = s.id
    WHERE ra.fecha::date = TIMEZONE('America/La_Paz', NOW())::date
    AND p.estado = 0
    AND (s.id IS NULL OR s.estado = 1)
  `;

  const params = [];
  const whereClauses = [];

  if (branchId) {
    whereClauses.push(`ra.sucursal_id = $${params.length + 1}`);
    params.push(branchId);
  }

  if (searchTerm) {
    whereClauses.push(
      `(p.nombres ILIKE $${params.length + 1} 
        OR p.apellidos ILIKE $${params.length + 1} 
        OR p.ci ILIKE $${params.length + 1})`
    );
    params.push(`%${searchTerm}%`);
  }

  if (typeFilter && typeFilter !== 'all') {
    whereClauses.push(`ra.tipo_persona = $${params.length + 1}`);
    params.push(typeFilter);
  }

  if (whereClauses.length > 0) {
    sql += ` AND ${whereClauses.join(' AND ')}`;
  }

  const safeLimit = Number.isNaN(Number(limit)) ? 100 : Number(limit);
  sql += ` ORDER BY ra.fecha DESC LIMIT ${safeLimit}`;

  const result = await query(sql, params);
  return result.rows;
};

// Función para formatear fecha de manera legible
const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.toLocaleString('es-ES', { month: 'short' });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

// Buscar miembros (clientes y empleados) - CORREGIDO para no duplicar
exports.searchMembers = async (searchTerm, typeFilter = "all", branchId) => {
  const searchParam = `%${searchTerm}%`;
  const results = [];

  // Clientes - excluir personas que también son empleados cuando se busca "all"
  if (typeFilter === "all" || typeFilter === "cliente") {
    const clientParams = [searchParam];
    let clientSql = `
      WITH todas_las_inscripciones AS (
        SELECT 
          i.id as idinscripcion,
          i.persona_id,
          i.servicio_id,
          i.ingresos_disponibles,
          i.fecha_inicio,
          i.fecha_vencimiento,
          i.estado,
          i.sucursal_id,
          s.nombre as nombre_servicio,
          s.multisucursal,
          s.numero_ingresos as servicio_ingresos_ilimitados,
          ROW_NUMBER() OVER (PARTITION BY i.servicio_id, i.persona_id ORDER BY i.fecha_inicio DESC, i.id DESC) as rn,
          CASE 
            WHEN i.fecha_vencimiento::date < TIMEZONE('America/La_Paz', NOW())::date THEN 'vencido'
            ELSE 'activo'
          END as estado_servicio,
          CASE
            WHEN s.numero_ingresos IS NULL THEN true
            WHEN i.ingresos_disponibles IS NULL THEN true
            WHEN i.ingresos_disponibles <= 0 THEN false
            ELSE true
          END as tiene_visitas_disponibles
        FROM inscripciones i
        INNER JOIN servicios s ON i.servicio_id = s.id
        WHERE i.estado = 1
        AND s.estado = 1
        AND (i.sucursal_id = $2 OR s.multisucursal = TRUE)
      )
      SELECT 
        p.id as idpersona,
        p.nombres,
        p.apellidos,
        p.ci,
        p.telefono,
        p.fecha_nacimiento,
        'cliente' as tipo,
        COALESCE(
          json_agg(
            json_build_object(
              'idinscripcion', ti.idinscripcion,
              'idservicio', ti.servicio_id,
              'nombre_servicio', ti.nombre_servicio,
              'ingresos_disponibles', ti.ingresos_disponibles,
              'fecha_inicio', ti.fecha_inicio,
              'fecha_vencimiento', ti.fecha_vencimiento,
              'estado', ti.estado,
              'sucursal_id', ti.sucursal_id,
              'multisucursal', ti.multisucursal,
              'estado_servicio', ti.estado_servicio,
              'servicio_ingresos_ilimitados', (ti.servicio_ingresos_ilimitados IS NULL),
              'tiene_visitas_disponibles', ti.tiene_visitas_disponibles
            ) ORDER BY 
              CASE WHEN ti.estado_servicio = 'activo' THEN 0 ELSE 1 END,
              ti.fecha_vencimiento DESC
          ) FILTER (WHERE ti.idinscripcion IS NOT NULL AND ti.rn = 1),
          '[]'
        ) as servicios
      FROM personas p
      LEFT JOIN todas_las_inscripciones ti ON p.id = ti.persona_id
      WHERE (p.nombres ILIKE $1 OR p.apellidos ILIKE $1 OR p.ci ILIKE $1)
      AND p.estado = 0
    `;

    // Cuando se busca "all", excluir personas que son empleados para que no se dupliquen
    if (typeFilter === "all") {
      clientSql += ` AND NOT EXISTS (SELECT 1 FROM empleados e WHERE e.persona_id = p.id AND e.estado = 1)`;
    }

    clientParams.push(branchId);
    clientSql += ` GROUP BY p.id`;

    const clientResult = await query(clientSql, clientParams);
    results.push(...clientResult.rows);
  }

  // Empleados - Solo de la sucursal actual
  if (typeFilter === "all" || typeFilter === "empleado") {
    const employeeParams = [searchParam];
    let employeeSql = `
      SELECT 
        p.id as idpersona,
        p.nombres,
        p.apellidos,
        p.ci,
        p.telefono,
        p.fecha_nacimiento,
        'empleado' as tipo,
        json_build_object(
          'idempleado', e.id,
          'rol', e.rol,
          'sucursal_id', e.sucursal_id,
          'estado', e.estado,
          'ultimo_registro_entrada', (
            SELECT MAX(ra.fecha) 
            FROM registros_acceso ra 
            WHERE ra.persona_id = p.id 
            AND ra.tipo_persona = 'empleado' 
            AND ra.detalle LIKE '%Entrada%'
            AND ra.sucursal_id = $2
          ),
          'ultimo_registro_salida', (
            SELECT MAX(ra.fecha) 
            FROM registros_acceso ra 
            WHERE ra.persona_id = p.id 
            AND ra.tipo_persona = 'empleado' 
            AND ra.detalle LIKE '%Salida%'
            AND ra.sucursal_id = $2
          ),
          'estado_actual', CASE 
            WHEN EXISTS (
              SELECT 1 FROM registros_acceso ra 
              WHERE ra.persona_id = p.id 
              AND ra.tipo_persona = 'empleado' 
              AND ra.detalle LIKE '%Entrada%'
              AND ra.sucursal_id = $2
              AND ra.fecha > COALESCE((
                SELECT MAX(ra2.fecha) 
                FROM registros_acceso ra2 
                WHERE ra2.persona_id = p.id 
                AND ra2.tipo_persona = 'empleado' 
                AND ra2.detalle LIKE '%Salida%'
                AND ra2.sucursal_id = $2
              ), '1900-01-01')
            ) THEN 'in' 
            ELSE 'out' 
          END
        ) as empleado_info
      FROM personas p
      INNER JOIN empleados e ON p.id = e.persona_id
      WHERE (p.nombres ILIKE $1 OR p.apellidos ILIKE $1 OR p.ci ILIKE $1)
      AND e.estado = 1
      AND p.estado = 0
      AND e.sucursal_id = $2
    `;

    employeeParams.push(branchId);
    const employeeResult = await query(employeeSql, employeeParams);
    results.push(...employeeResult.rows);
  }

  return results;
};

// Obtener las inscripciones multisucursales MÁS RECIENTES de cada sucursal
const getLatestMultisucursalInscriptions = async (personId, serviceId, fechaInicio, fechaVencimiento) => {
  const result = await query(
    `
    WITH ranked_inscriptions AS (
      SELECT 
        i.id, 
        i.sucursal_id, 
        i.ingresos_disponibles,
        ROW_NUMBER() OVER (PARTITION BY i.sucursal_id ORDER BY i.fecha_inicio DESC, i.id DESC) as rn
      FROM inscripciones i
      INNER JOIN servicios s ON i.servicio_id = s.id
      WHERE i.persona_id = $1 
      AND i.servicio_id = $2
      AND i.fecha_inicio = $3
      AND i.fecha_vencimiento = $4
      AND i.estado = 1
      AND s.multisucursal = true
    )
    SELECT id, sucursal_id, ingresos_disponibles
    FROM ranked_inscriptions
    WHERE rn = 1
    ORDER BY id DESC
    `,
    [personId, serviceId, fechaInicio, fechaVencimiento]
  );
  
  return result.rows;
};

// Función checkPagosPendientes
const checkPagosPendientes = async (personId) => {
  try {
    const result = await query(
      `
      SELECT 
        pp.monto_pendiente,
        pp.monto_total,
        s.nombre as servicio_nombre
      FROM pagos_pendientes pp
      INNER JOIN ventas_servicios vs ON pp.venta_servicio_id = vs.id
      INNER JOIN detalle_venta_servicios dvs ON vs.id = dvs.venta_servicio_id
      INNER JOIN inscripciones i ON dvs.inscripcion_id = i.id
      INNER JOIN servicios s ON i.servicio_id = s.id
      WHERE pp.persona_id = $1 
      AND pp.estado = 'pendiente'
      AND pp.monto_pendiente > 0
      ORDER BY pp.fecha_inscripcion DESC
      LIMIT 1
      `,
      [personId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }

    const pago = result.rows[0];
    
    return {
      monto_pendiente: parseFloat(pago.monto_pendiente),
      monto_total: parseFloat(pago.monto_total),
      servicio_nombre: pago.servicio_nombre
    };
  } catch (error) {
    console.error('Error en checkPagosPendientes:', error);
    return null;
  }
};

// Registrar acceso de cliente
exports.registerClientAccess = async (
  personId,
  serviceId,
  branchId,
  userId
) => {
  const client = await query(
    `
    SELECT 
      i.*, 
      s.id as servicio_real_id,
      s.nombre as servicio_nombre, 
      s.multisucursal,
      s.numero_ingresos as servicio_ingresos_ilimitados
    FROM inscripciones i
    INNER JOIN servicios s ON i.servicio_id = s.id
    INNER JOIN personas p ON i.persona_id = p.id
    WHERE i.persona_id = $1 AND i.id = $2
    AND (i.sucursal_id = $3 OR s.multisucursal = TRUE)
    AND p.estado = 0
    AND s.estado = 1
  `,
    [personId, serviceId, branchId]
  );

  if (client.rows.length === 0) {
    throw new Error("Inscripción no encontrada, no válida para esta sucursal, servicio eliminado o cliente eliminado");
  }

  const inscription = client.rows[0];

  const checkExpiration = await query(
    `
    SELECT 
      CASE 
        WHEN fecha_vencimiento::date < TIMEZONE('America/La_Paz', NOW())::date THEN true
        ELSE false
      END as esta_vencido,
      fecha_vencimiento
    FROM inscripciones 
    WHERE id = $1
  `,
    [serviceId]
  );

  const isExpired = checkExpiration.rows[0]?.esta_vencido || false;

  if (isExpired) {
    const fechaVencimiento = checkExpiration.rows[0]?.fecha_vencimiento;
    const fechaFormateada = formatDate(fechaVencimiento);
    
    await query(
      `
      INSERT INTO registros_acceso 
      (persona_id, servicio_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
      VALUES ($1, $2, $3, $4, $5, $6, TIMEZONE('America/La_Paz', NOW()), 'cliente')
    `,
      [
        personId,
        inscription.servicio_real_id,
        `Acceso denegado - Servicio ${inscription.servicio_nombre} vencido`,
        "denegado",
        branchId,
        userId,
      ]
    );

    return {
      success: false,
      message: `Servicio ${inscription.servicio_nombre} vencido`,
    };
  }

  const isUnlimitedService = inscription.servicio_ingresos_ilimitados === null;

  if (!isUnlimitedService && inscription.ingresos_disponibles <= 0) {
    await query(
      `
      INSERT INTO registros_acceso 
      (persona_id, servicio_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
      VALUES ($1, $2, $3, $4, $5, $6, TIMEZONE('America/La_Paz', NOW()), 'cliente')
    `,
      [
        personId,
        inscription.servicio_real_id,
        `Acceso denegado - Sin ingresos disponibles para ${inscription.servicio_nombre}`,
        "denegado",
        branchId,
        userId,
      ]
    );

    return {
      success: false,
      message: `Sin ingresos disponibles para ${inscription.servicio_nombre}`,
    };
  }

  let remainingVisits = 0;
  let latestMultisucursalInscriptions = [];
  
  if (!isUnlimitedService) {
    if (inscription.multisucursal) {
      latestMultisucursalInscriptions = await getLatestMultisucursalInscriptions(
        personId, 
        inscription.servicio_real_id, 
        inscription.fecha_inicio, 
        inscription.fecha_vencimiento
      );
      
      for (const multiInscription of latestMultisucursalInscriptions) {
        await query(
          `
          UPDATE inscripciones 
          SET ingresos_disponibles = ingresos_disponibles - 1 
          WHERE id = $1
          `,
          [multiInscription.id]
        );
      }
      
      const updatedInscription = await query(
        `SELECT ingresos_disponibles FROM inscripciones WHERE id = $1`,
        [serviceId]
      );
      
      remainingVisits = updatedInscription.rows[0]?.ingresos_disponibles || 0;
    } else {
      await query(
        `
        UPDATE inscripciones 
        SET ingresos_disponibles = ingresos_disponibles - 1 
        WHERE id = $1
        `,
        [serviceId]
      );

      const updatedInscription = await query(
        `SELECT ingresos_disponibles FROM inscripciones WHERE id = $1`,
        [serviceId]
      );
      
      remainingVisits = updatedInscription.rows[0]?.ingresos_disponibles || 0;
    }
  }

  const detailMessage = isUnlimitedService 
    ? `Acceso exitoso - ${inscription.servicio_nombre} (Ingresos ilimitados)`
    : `Acceso exitoso - ${inscription.servicio_nombre} (Visitas restantes: ${remainingVisits})`;

  await query(
    `
    INSERT INTO registros_acceso 
    (persona_id, servicio_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
    VALUES ($1, $2, $3, $4, $5, $6, TIMEZONE('America/La_Paz', NOW()), 'cliente')
  `,
    [
      personId,
      inscription.servicio_real_id,
      detailMessage,
      "exitoso",
      branchId,
      userId,
    ]
  );

  const pagoPendiente = await checkPagosPendientes(personId);

  return {
    success: true,
    message: `Acceso registrado para ${inscription.servicio_nombre}`,
    remainingVisits: isUnlimitedService ? null : remainingVisits,
    isMultisucursal: inscription.multisucursal,
    updatedInscriptionsCount: inscription.multisucursal ? latestMultisucursalInscriptions.length : 1,
    tieneDeuda: pagoPendiente !== null,
    deudaInfo: pagoPendiente ? {
      montoPendiente: pagoPendiente.monto_pendiente,
      montoTotal: pagoPendiente.monto_total,
      servicioNombre: pagoPendiente.servicio_nombre
    } : null
  };
};

// Obtener horario del empleado para el día actual
const getEmployeeScheduleForToday = async (employeeId) => {
  const dayResult = await query(
    `SELECT EXTRACT(DOW FROM TIMEZONE('America/La_Paz', NOW())) + 1 as dia_semana`
  );
  const diaSemanaActual = dayResult.rows[0].dia_semana;

  const horarioResult = await query(
    `SELECT hora_ingreso, hora_salida 
     FROM horarios_empleado 
     WHERE empleado_id = $1 AND dia_semana = $2`,
    [employeeId, diaSemanaActual]
  );

  if (horarioResult.rows.length > 0) {
    return horarioResult.rows[0];
  }

  const horarioLVResult = await query(
    `SELECT hora_ingreso, hora_salida 
     FROM horarios_empleado 
     WHERE empleado_id = $1 AND dia_semana = 1`,
    [employeeId]
  );

  if (horarioLVResult.rows.length > 0) {
    return horarioLVResult.rows[0];
  }

  const anyScheduleResult = await query(
    `SELECT hora_ingreso, hora_salida 
     FROM horarios_empleado 
     WHERE empleado_id = $1 
     ORDER BY dia_semana 
     LIMIT 1`,
    [employeeId]
  );

  if (anyScheduleResult.rows.length > 0) {
    return anyScheduleResult.rows[0];
  }

  throw new Error("El empleado no tiene horarios definidos");
};

// Registrar entrada de empleado
exports.registerEmployeeCheckIn = async (employeeId, branchId, userId) => {
  const employee = await query(
    `
    SELECT e.*, p.nombres, p.apellidos, p.ci
    FROM empleados e
    INNER JOIN personas p ON e.persona_id = p.id
    WHERE e.id = $1
    AND p.estado = 0
  `,
    [employeeId]
  );

  if (employee.rows.length === 0) {
    throw new Error("Empleado no encontrado o eliminado");
  }

  const emp = employee.rows[0];

  const horario = await getEmployeeScheduleForToday(employeeId);

  const currentTimeResult = await query(
    `SELECT TIMEZONE('America/La_Paz', NOW()) as hora_actual_bolivia`
  );

  const horaActualBolivia = currentTimeResult.rows[0].hora_actual_bolivia;

  const [shiftHours, shiftMinutes, shiftSeconds] = horario.hora_ingreso.split(':').map(Number);
  
  const hoy = new Date(horaActualBolivia);
  const horaIngresoHoy = new Date(hoy);
  horaIngresoHoy.setHours(shiftHours, shiftMinutes, shiftSeconds || 0, 0);

  const diffMs = horaActualBolivia - horaIngresoHoy;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  let detail = `Entrada: A tiempo`;
  let isLate = false;
  
  if (diffMinutes > 0) {
    isLate = true;
    detail = `Entrada: ${diffMinutes} minuto${diffMinutes !== 1 ? 's' : ''} tarde`;
  }

  await query(
    `
    INSERT INTO registros_acceso 
    (persona_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
    VALUES ($1, $2, $3, $4, $5, TIMEZONE('America/La_Paz', NOW()), 'empleado')
  `,
    [emp.persona_id, detail, "exitoso", branchId, userId]
  );

  return {
    success: true,
    message: detail,
    isLate,
    minutes: isLate ? diffMinutes : 0,
  };
};

// Registrar salida de empleado
exports.registerEmployeeCheckOut = async (employeeId, branchId, userId) => {
  const employee = await query(
    `
    SELECT e.*, p.nombres, p.apellidos, p.ci
    FROM empleados e
    INNER JOIN personas p ON e.persona_id = p.id
    WHERE e.id = $1
    AND p.estado = 0
  `,
    [employeeId]
  );

  if (employee.rows.length === 0) {
    throw new Error("Empleado no encontrado o eliminado");
  }

  const emp = employee.rows[0];

  const horario = await getEmployeeScheduleForToday(employeeId);

  const currentTimeResult = await query(
    `SELECT TIMEZONE('America/La_Paz', NOW()) as hora_actual_bolivia`
  );

  const horaActualBolivia = currentTimeResult.rows[0].hora_actual_bolivia;

  const [shiftHours, shiftMinutes, shiftSeconds] = horario.hora_salida.split(':').map(Number);
  
  const hoy = new Date(horaActualBolivia);
  const horaSalidaHoy = new Date(hoy);
  horaSalidaHoy.setHours(shiftHours, shiftMinutes, shiftSeconds || 0, 0);

  const diffMs = horaSalidaHoy - horaActualBolivia;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  let detail = `Salida: A tiempo`;
  let isEarly = false;
  
  if (diffMinutes > 0) {
    isEarly = true;
    detail = `Salida: ${diffMinutes} minuto${diffMinutes !== 1 ? 's' : ''} antes`;
  }

  await query(
    `
    INSERT INTO registros_acceso 
    (persona_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
    VALUES ($1, $2, $3, $4, $5, TIMEZONE('America/La_Paz', NOW()), 'empleado')
  `,
    [emp.persona_id, detail, "exitoso", branchId, userId]
  );

  return {
    success: true,
    message: detail,
    isEarly,
    minutes: isEarly ? diffMinutes : 0,
  };
};