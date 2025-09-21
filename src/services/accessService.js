const { query } = require("../../db");

exports.getAccessLogs = async (searchTerm, typeFilter, limit = 100, branchId) => {
  let sql = `
    SELECT 
      ra.id, 
      TO_CHAR(ra.fecha AT TIME ZONE 'America/La_Paz', 'YYYY-MM-DD HH24:MI') as fecha, 
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
  `;

  const params = [];
  const whereClauses = [];

  if (branchId) {
    whereClauses.push(`ra.sucursal_id = $${params.length + 1}`);
    params.push(branchId);
  }

  // Registros del día de hoy en Bolivia
  whereClauses.push(`ra.fecha::date = TIMEZONE('America/La_Paz', NOW())::date`);

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
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  // ✅ aquí ya no usamos placeholder para LIMIT
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
          s.multisucursal
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
              'multisucursal', ui.multisucursal
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
          'hora_ingreso', e.hora_ingreso,
          'hora_salida', e.hora_salida,
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
      s.multisucursal
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

  if (inscription.ingresos_disponibles <= 0) {
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

  await query(
    `
    UPDATE inscripciones 
    SET ingresos_disponibles = ingresos_disponibles - 1 
    WHERE id = $1
  `,
    [serviceId]
  );

  const updatedInscription = await query(
    `
    SELECT ingresos_disponibles FROM inscripciones WHERE id = $1
  `,
    [serviceId]
  );

  const remainingVisits = updatedInscription.rows[0]?.ingresos_disponibles || 0;

  await query(
    `
    INSERT INTO registros_acceso 
    (persona_id, servicio_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
    VALUES ($1, $2, $3, $4, $5, $6, TIMEZONE('America/La_Paz', NOW()), 'cliente')
  `,
    [
      personId,
      inscription.servicio_real_id,
      `Servicio: ${inscription.servicio_nombre} - Visitas restantes: ${remainingVisits}`,
      "exitoso",
      branchId,
      userId,
    ]
  );

  return {
    success: true,
    message: `Acceso registrado para ${inscription.servicio_nombre}`,
    remainingVisits,
  };
};

// Registrar entrada de empleado
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

  const currentTimeResult = await query(
    `SELECT EXTRACT(HOUR FROM TIMEZONE('America/La_Paz', NOW())) as hora_actual, 
            EXTRACT(MINUTE FROM TIMEZONE('America/La_Paz', NOW())) as minuto_actual`
  );

  const horaActual = currentTimeResult.rows[0].hora_actual;
  const minutoActual = currentTimeResult.rows[0].minuto_actual;
  const currentTotalMinutes = horaActual * 60 + minutoActual;

  const [shiftHours, shiftMinutes] = emp.hora_ingreso.split(':').map(Number);
  const shiftTotalMinutes = shiftHours * 60 + shiftMinutes;

  const diffMinutes = currentTotalMinutes - shiftTotalMinutes;
  const isLate = diffMinutes > 0;

  let detail = `Entrada: A tiempo`;
  if (isLate) {
    detail = `Entrada: ${diffMinutes} minutos tarde`;
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
    minutes: Math.abs(diffMinutes),
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

  const currentTimeResult = await query(
    `SELECT EXTRACT(HOUR FROM TIMEZONE('America/La_Paz', NOW())) as hora_actual, 
            EXTRACT(MINUTE FROM TIMEZONE('America/La_Paz', NOW())) as minuto_actual`
  );

  const horaActual = currentTimeResult.rows[0].hora_actual;
  const minutoActual = currentTimeResult.rows[0].minuto_actual;
  const currentTotalMinutes = horaActual * 60 + minutoActual;

  const [shiftHours, shiftMinutes] = emp.hora_salida.split(':').map(Number);
  const shiftTotalMinutes = shiftHours * 60 + shiftMinutes;

  const diffMinutes = currentTotalMinutes - shiftTotalMinutes;
  const isEarly = diffMinutes < 0;

  let detail = `Salida: A tiempo`;
  if (isEarly) {
    detail = `Salida: ${Math.abs(diffMinutes)} minutos antes`;
  } else if (diffMinutes > 0) {
    detail = `Salida: ${diffMinutes} minutos después`;
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
    minutes: Math.abs(diffMinutes),
  };
};