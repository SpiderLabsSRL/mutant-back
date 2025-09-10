const { query } = require("../../db");
const bcrypt = require("bcrypt");

// Función para formatear fecha y hora en zona horaria de Bolivia (UTC-4)
const formatBoliviaDateTime = (date) => {
  if (!date) return null;
  // Ajustar a zona horaria de Bolivia (UTC-4)
  const boliviaOffset = -4 * 60; // UTC-4 en minutos
  const localDate = new Date(date);
  const utc = localDate.getTime() + localDate.getTimezoneOffset() * 60000;
  const boliviaTime = new Date(utc + 60000 * boliviaOffset);

  return boliviaTime
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");
};

// Obtener registros de acceso
exports.getAccessLogs = async (
  searchTerm,
  typeFilter,
  limit = 100,
  startDate,
  endDate,
  branchId
) => {
  let sql = `
    SELECT 
      ra.id, 
      ra.fecha, 
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
  let whereClauses = [];

  // Filtrar por sucursal
  if (branchId) {
    whereClauses.push(`ra.sucursal_id = $${params.length + 1}`);
    params.push(branchId);
  }

  // Filtrar por fecha (por defecto solo día actual)
  if (startDate) {
    whereClauses.push(`ra.fecha::date >= $${params.length + 1}`);
    params.push(startDate);
  }

  if (endDate) {
    whereClauses.push(`ra.fecha::date <= $${params.length + 1}`);
    params.push(endDate);
  }

  if (searchTerm) {
    whereClauses.push(
      `(p.nombres ILIKE $${params.length + 1} OR p.apellidos ILIKE $${
        params.length + 1
      } OR p.ci ILIKE $${params.length + 1})`
    );
    params.push(`%${searchTerm}%`);
  }

  if (typeFilter && typeFilter !== "all") {
    whereClauses.push(`ra.tipo_persona = $${params.length + 1}`);
    params.push(typeFilter);
  }

  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(" AND ")}`;
  }

  sql += ` ORDER BY ra.fecha DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await query(sql, params);

  // Formatear fechas en zona horaria de Bolivia
  const formattedResults = result.rows.map((row) => ({
    ...row,
    fecha: formatBoliviaDateTime(row.fecha),
  }));

  return formattedResults;
};

// Buscar miembros (clientes y empleados)
exports.searchMembers = async (searchTerm, typeFilter = "all", branchId) => {
  const searchParam = `%${searchTerm}%`;
  const results = [];

  // Buscar clientes si el filtro es 'all' o 'cliente'
  if (typeFilter === "all" || typeFilter === "cliente") {
    const clientParams = [searchParam, branchId];
    const clientSql = `
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
              'idinscripcion', i.id,
              'idservicio', s.id,
              'nombre_servicio', s.nombre,
              'ingresos_disponibles', i.ingresos_disponibles,
              'fecha_inicio', i.fecha_inicio,
              'fecha_vencimiento', i.fecha_vencimiento,
              'estado', i.estado,
              'sucursal_id', i.sucursal_id,
              'multisucursal', s.multisucursal
            ) ORDER BY i.fecha_vencimiento DESC
          ) FILTER (WHERE i.id IS NOT NULL),
          '[]'
        ) as servicios
      FROM personas p
      LEFT JOIN inscripciones i ON p.id = i.persona_id
      LEFT JOIN servicios s ON i.servicio_id = s.id
      WHERE (p.nombres ILIKE $1 OR p.apellidos ILIKE $1 OR p.ci ILIKE $1)
      AND i.estado = 1
      AND i.fecha_vencimiento >= CURRENT_DATE
      AND i.ingresos_disponibles > 0
      AND (i.sucursal_id = $2 OR s.multisucursal = TRUE)
      GROUP BY p.id
      HAVING COUNT(i.id) > 0
    `;

    try {
      const clientResult = await query(clientSql, clientParams);

      // Formatear fechas de últimos registros
      const formattedClientResults = clientResult.rows.map((row) => {
        if (row.servicios && row.servicios.length > 0) {
          // Filtrar solo servicios activos y ordenar por fecha de vencimiento
          const serviciosActivos = row.servicios
            .filter((servicio) => servicio.estado === 1)
            .sort(
              (a, b) =>
                new Date(b.fecha_vencimiento) - new Date(a.fecha_vencimiento)
            );

          // Tomar solo el servicio más reciente
          const servicioMasReciente =
            serviciosActivos.length > 0 ? [serviciosActivos[0]] : [];

          const servicios = servicioMasReciente.map((servicio) => ({
            ...servicio,
            fecha_inicio: formatBoliviaDateTime(servicio.fecha_inicio),
            fecha_vencimiento: formatBoliviaDateTime(
              servicio.fecha_vencimiento
            ),
          }));
          return { ...row, servicios };
        }
        return row;
      });

      results.push(...formattedClientResults);
    } catch (error) {
      console.error("Error searching clients:", error);
      throw error;
    }
  }

  // Buscar empleados si el filtro es 'all' o 'empleado'
  if (typeFilter === "all" || typeFilter === "empleado") {
    const employeeParams = [searchParam, branchId];
    const employeeSql = `
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
      AND e.sucursal_id = $2
    `;

    try {
      const employeeResult = await query(employeeSql, employeeParams);

      // Formatear fechas de últimos registros
      const formattedEmployeeResults = employeeResult.rows.map((row) => {
        if (row.empleado_info) {
          const empleadoInfo = {
            ...row.empleado_info,
            ultimo_registro_entrada: row.empleado_info.ultimo_registro_entrada
              ? formatBoliviaDateTime(row.empleado_info.ultimo_registro_entrada)
              : null,
            ultimo_registro_salida: row.empleado_info.ultimo_registro_salida
              ? formatBoliviaDateTime(row.empleado_info.ultimo_registro_salida)
              : null,
          };
          return { ...row, empleado_info: empleadoInfo };
        }
        return row;
      });

      results.push(...formattedEmployeeResults);
    } catch (error) {
      console.error("Error searching employees:", error);
      throw error;
    }
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
  // Primero obtenemos la información completa de la inscripción
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
  const today = new Date();
  const expirationDate = new Date(inscription.fecha_vencimiento);

  // Verificar si la inscripción está vencida
  if (expirationDate < today) {
    // Registrar acceso denegado
    await query(
      `
      INSERT INTO registros_acceso 
      (persona_id, servicio_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'cliente')
    `,
      [
        personId,
        inscription.servicio_real_id, // Usar el ID real del servicio
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

  // Verificar si hay ingresos disponibles
  if (inscription.ingresos_disponibles <= 0) {
    // Registrar acceso denegado
    await query(
      `
      INSERT INTO registros_acceso 
      (persona_id, servicio_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'cliente')
    `,
      [
        personId,
        inscription.servicio_real_id, // Usar el ID real del servicio
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

  // Reducir el número de ingresos disponibles
  await query(
    `
    UPDATE inscripciones 
    SET ingresos_disponibles = ingresos_disponibles - 1 
    WHERE id = $1
  `,
    [serviceId]
  );

  // Obtener el nuevo número de visitas disponibles
  const updatedInscription = await query(
    `
    SELECT ingresos_disponibles FROM inscripciones WHERE id = $1
  `,
    [serviceId]
  );

  const remainingVisits = updatedInscription.rows[0]?.ingresos_disponibles || 0;

  // Registrar acceso exitoso
  await query(
    `
    INSERT INTO registros_acceso 
    (persona_id, servicio_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'cliente')
  `,
    [
      personId,
      inscription.servicio_real_id, // Usar el ID real del servicio
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
  const currentTime = new Date();
  const shiftStartTime = new Date(`2024-01-01 ${emp.hora_ingreso}`);

  // Calcular diferencia de tiempo
  const currentHours = currentTime.getHours();
  const currentMinutes = currentTime.getMinutes();
  const shiftHours = shiftStartTime.getHours();
  const shiftMinutes = shiftStartTime.getMinutes();

  const currentTotalMinutes = currentHours * 60 + currentMinutes;
  const shiftTotalMinutes = shiftHours * 60 + shiftMinutes;

  const diffMinutes = currentTotalMinutes - shiftTotalMinutes;
  const isLate = diffMinutes > 0;

  let detail = `Entrada: A tiempo`;
  if (isLate) {
    detail = `Entrada: ${diffMinutes} minutos tarde`;
  }

  // Registrar entrada
  await query(
    `
    INSERT INTO registros_acceso 
    (persona_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
    VALUES ($1, $2, $3, $4, $5, NOW(), 'empleado')
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
  const currentTime = new Date();
  const shiftEndTime = new Date(`2024-01-01 ${emp.hora_salida}`);

  // Calcular diferencia de tiempo
  const currentHours = currentTime.getHours();
  const currentMinutes = currentTime.getMinutes();
  const shiftHours = shiftEndTime.getHours();
  const shiftMinutes = shiftEndTime.getMinutes();

  const currentTotalMinutes = currentHours * 60 + currentMinutes;
  const shiftTotalMinutes = shiftHours * 60 + shiftMinutes;

  const diffMinutes = currentTotalMinutes - shiftTotalMinutes;
  const isEarly = diffMinutes < 0;

  let detail = `Salida: A tiempo`;
  if (isEarly) {
    detail = `Salida: ${Math.abs(diffMinutes)} minutos antes`;
  } else if (diffMinutes > 0) {
    detail = `Salida: ${diffMinutes} minutos después`;
  }

  // Registrar salida
  await query(
    `
    INSERT INTO registros_acceso 
    (persona_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
    VALUES ($1, $2, $3, $4, $5, NOW(), 'empleado')
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
