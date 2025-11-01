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

// Buscar miembros (clientes y empleados)
exports.searchMembers = async (searchTerm, typeFilter = "all", branchId) => {
  const searchParam = `%${searchTerm}%`;
  const results = [];

  // Clientes
  if (typeFilter === "all" || typeFilter === "cliente") {
    const clientParams = [searchParam];
    let clientSql = `
      WITH ultimas_inscripciones AS (
        SELECT DISTINCT ON (i.persona_id, i.servicio_id)
          i.persona_id,
          i.servicio_id,
          i.id as idinscripcion,
          i.ingresos_disponibles,
          i.fecha_inicio,
          i.fecha_vencimiento,
          i.estado,
          i.sucursal_id,
          s.nombre as nombre_servicio,
          s.multisucursal,
          CASE 
            WHEN i.fecha_vencimiento::date < TIMEZONE('America/La_Paz', NOW())::date THEN 'vencido'
            ELSE 'activo'
          END as estado_servicio
        FROM inscripciones i
        INNER JOIN servicios s ON i.servicio_id = s.id
        WHERE i.estado = 1
        ORDER BY i.servicio_id, i.persona_id, i.fecha_inicio DESC
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
              'idinscripcion', ui.idinscripcion,
              'idservicio', ui.servicio_id,
              'nombre_servicio', ui.nombre_servicio,
              'ingresos_disponibles', ui.ingresos_disponibles,
              'fecha_inicio', ui.fecha_inicio,
              'fecha_vencimiento', ui.fecha_vencimiento,
              'estado', ui.estado,
              'sucursal_id', ui.sucursal_id,
              'multisucursal', ui.multisucursal,
              'estado_servicio', ui.estado_servicio
            ) ORDER BY ui.fecha_vencimiento DESC
          ) FILTER (WHERE ui.idinscripcion IS NOT NULL),
          '[]'
        ) as servicios
      FROM personas p
      LEFT JOIN ultimas_inscripciones ui ON p.id = ui.persona_id
      WHERE (p.nombres ILIKE $1 OR p.apellidos ILIKE $1 OR p.ci ILIKE $1)
    `;

    if (branchId) {
      clientSql += ` AND (ui.sucursal_id = $2 OR ui.multisucursal = TRUE)`;
      clientParams.push(branchId);
    }

    clientSql += ` GROUP BY p.id HAVING COUNT(ui.idinscripcion) > 0`;

    const clientResult = await query(clientSql, clientParams);
    results.push(...clientResult.rows);
  }

  // Empleados
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
          ),
          'ultimo_registro_salida', (
            SELECT MAX(ra.fecha) 
            FROM registros_acceso ra 
            WHERE ra.persona_id = p.id 
            AND ra.tipo_persona = 'empleado' 
            AND ra.detalle LIKE '%Salida%'
          ),
          'estado_actual', CASE 
            WHEN EXISTS (
              SELECT 1 FROM registros_acceso ra 
              WHERE ra.persona_id = p.id 
              AND ra.tipo_persona = 'empleado' 
              AND ra.detalle LIKE '%Entrada%'
              AND ra.fecha > COALESCE((
                SELECT MAX(ra2.fecha) 
                FROM registros_acceso ra2 
                WHERE ra2.persona_id = p.id 
                AND ra2.tipo_persona = 'empleado' 
                AND ra2.detalle LIKE '%Salida%'
              ), '1900-01-01')
            ) THEN 'in' 
            ELSE 'out' 
          END
        ) as empleado_info
      FROM personas p
      INNER JOIN empleados e ON p.id = e.persona_id
      WHERE (p.nombres ILIKE $1 OR p.apellidos ILIKE $1 OR p.ci ILIKE $1)
      AND e.estado = 1
    `;

    if (branchId) {
      employeeSql += ` AND e.sucursal_id = $2`;
      employeeParams.push(branchId);
    }

    const employeeResult = await query(employeeSql, employeeParams);
    results.push(...employeeResult.rows);
  }

  return results;
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
    WHERE i.persona_id = $1 AND i.id = $2
    AND (i.sucursal_id = $3 OR s.multisucursal = TRUE)
  `,
    [personId, serviceId, branchId]
  );

  if (client.rows.length === 0) {
    throw new Error("Inscripción no encontrada o no válida para esta sucursal");
  }

  const inscription = client.rows[0];

  const checkExpiration = await query(
    `
    SELECT 
      CASE 
        WHEN fecha_vencimiento::date < TIMEZONE('America/La_Paz', NOW())::date THEN true
        ELSE false
      END as esta_vencido
    FROM inscripciones 
    WHERE id = $1
  `,
    [serviceId]
  );

  const isExpired = checkExpiration.rows[0]?.esta_vencido || false;

  if (isExpired) {
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

  // VERIFICAR SI ES UN SERVICIO ILIMITADO
  const isUnlimitedService = inscription.servicio_ingresos_ilimitados === null;

  // Solo verificar ingresos si NO es un servicio ilimitado
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
        `Acceso denegado - Sin visitas disponibles para ${inscription.servicio_nombre}`,
        "denegado",
        branchId,
        userId,
      ]
    );

    return {
      success: false,
      message: `Sin visitas disponibles para ${inscription.servicio_nombre}`,
    };
  }

  // SOLO DESCONTAR INGRESO SI NO ES UN SERVICIO ILIMITADO
  if (!isUnlimitedService) {
    await query(
      `
      UPDATE inscripciones 
      SET ingresos_disponibles = ingresos_disponibles - 1 
      WHERE id = $1
    `,
      [serviceId]
    );
  }

  const updatedInscription = await query(
    `
    SELECT ingresos_disponibles FROM inscripciones WHERE id = $1
  `,
    [serviceId]
  );

  const remainingVisits = updatedInscription.rows[0]?.ingresos_disponibles || 0;

  // Mensaje diferente para servicios ilimitados
  const detailMessage = isUnlimitedService 
    ? `Servicio: ${inscription.servicio_nombre} - Ingresos ilimitados`
    : `Servicio: ${inscription.servicio_nombre} - Visitas restantes: ${remainingVisits}`;

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

  return {
    success: true,
    message: `Acceso registrado para ${inscription.servicio_nombre}`,
    remainingVisits: isUnlimitedService ? null : remainingVisits,
  };
};

// OBTENER HORARIO DEL EMPLEADO PARA EL DÍA ACTUAL
const getEmployeeScheduleForToday = async (employeeId) => {
  // Obtener el día de la semana actual (1=Lunes, 7=Domingo)
  const dayResult = await query(
    `SELECT EXTRACT(DOW FROM TIMEZONE('America/La_Paz', NOW())) + 1 as dia_semana`
  );
  const diaSemanaActual = dayResult.rows[0].dia_semana;

  // Buscar horario específico para hoy
  const horarioResult = await query(
    `SELECT hora_ingreso, hora_salida 
     FROM horarios_empleado 
     WHERE empleado_id = $1 AND dia_semana = $2`,
    [employeeId, diaSemanaActual]
  );

  if (horarioResult.rows.length > 0) {
    return horarioResult.rows[0];
  }

  // Si no tiene horario específico para hoy, usar horario de Lunes a Viernes (dia_semana = 1)
  const horarioLVResult = await query(
    `SELECT hora_ingreso, hora_salida 
     FROM horarios_empleado 
     WHERE empleado_id = $1 AND dia_semana = 1`,
    [employeeId]
  );

  if (horarioLVResult.rows.length > 0) {
    return horarioLVResult.rows[0];
  }

  // Si no tiene ningún horario, usar el primero disponible
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

exports.registerEmployeeCheckIn = async (employeeId, branchId, userId) => {
  const employee = await query(
    `
    SELECT e.*, p.nombres, p.apellidos, p.ci
    FROM empleados e
    INNER JOIN personas p ON e.persona_id = p.id
    WHERE e.id = $1
  `,
    [employeeId]
  );

  if (employee.rows.length === 0) {
    throw new Error("Empleado no encontrado");
  }

  const emp = employee.rows[0];

  // Obtener horario del empleado para hoy
  const horario = await getEmployeeScheduleForToday(employeeId);

  // Obtener la fecha y hora actual en Bolivia
  const currentTimeResult = await query(
    `SELECT TIMEZONE('America/La_Paz', NOW()) as hora_actual_bolivia`
  );

  const horaActualBolivia = currentTimeResult.rows[0].hora_actual_bolivia;

  // Parsear la hora de ingreso del empleado
  const [shiftHours, shiftMinutes, shiftSeconds] = horario.hora_ingreso.split(':').map(Number);
  
  // Crear objeto Date para la hora de ingreso de hoy
  const hoy = new Date(horaActualBolivia);
  const horaIngresoHoy = new Date(hoy);
  horaIngresoHoy.setHours(shiftHours, shiftMinutes, shiftSeconds || 0, 0);

  // Calcular diferencia en milisegundos
  const diffMs = horaActualBolivia - horaIngresoHoy;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  let detail = `Entrada: A tiempo`;
  let isLate = false;
  
  // Solo mostrar minutos si está tarde (después de la hora de ingreso)
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
  `,
    [employeeId]
  );

  if (employee.rows.length === 0) {
    throw new Error("Empleado no encontrado");
  }

  const emp = employee.rows[0];

  // Obtener horario del empleado para hoy
  const horario = await getEmployeeScheduleForToday(employeeId);

  // Obtener la fecha y hora actual en Bolivia
  const currentTimeResult = await query(
    `SELECT TIMEZONE('America/La_Paz', NOW()) as hora_actual_bolivia`
  );

  const horaActualBolivia = currentTimeResult.rows[0].hora_actual_bolivia;

  // Parsear la hora de salida del empleado
  const [shiftHours, shiftMinutes, shiftSeconds] = horario.hora_salida.split(':').map(Number);
  
  // Crear objeto Date para la hora de salida de hoy
  const hoy = new Date(horaActualBolivia);
  const horaSalidaHoy = new Date(hoy);
  horaSalidaHoy.setHours(shiftHours, shiftMinutes, shiftSeconds || 0, 0);

  // Calcular diferencia en milisegundos
  const diffMs = horaSalidaHoy - horaActualBolivia;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  let detail = `Salida: A tiempo`;
  let isEarly = false;
  
  // Solo mostrar minutos si está saliendo temprano (antes de la hora de salida)
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