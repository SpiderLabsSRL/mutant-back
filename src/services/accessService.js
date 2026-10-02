const { query } = require("../../db");

// ============================================
// HELPER: DÍA DE LA SEMANA EN BD (1=Lunes, 7=Domingo)
// ============================================
const getDiaSemanaBD = (date) => {
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
};

// ============================================
// VALIDAR HORARIO DEL SERVICIO
// ============================================
const validarHorarioServicio = async (servicioId, fechaActual) => {
  try {
    const horariosResult = await query(
      `SELECT 
         dia_semana, 
         TO_CHAR(hora_inicio, 'HH24:MI:SS') as hora_inicio,
         TO_CHAR(hora_fin, 'HH24:MI:SS') as hora_fin
       FROM horarios_servicio
       WHERE servicio_id = $1`,
      [servicioId]
    );

    if (horariosResult.rows.length === 0) {
      return { valid: true, reason: null };
    }

    const diaActual = getDiaSemanaBD(fechaActual);
    const horaActual = fechaActual.toTimeString().split(" ")[0];

    console.log(`🕐 Validando horario servicio ${servicioId}:`, {
      diaActual,
      horaActual,
      totalHorarios: horariosResult.rows.length,
    });

    const horariosDelDia = horariosResult.rows.filter(
      (h) => h.dia_semana === diaActual
    );

    if (horariosDelDia.length === 0) {
      const diasDisponibles = [
        ...new Set(horariosResult.rows.map((h) => h.dia_semana)),
      ].sort();
      const nombresDias = {
        1: "Lunes",
        2: "Martes",
        3: "Miércoles",
        4: "Jueves",
        5: "Viernes",
        6: "Sábado",
        7: "Domingo",
      };
      const listaDias = diasDisponibles.map((d) => nombresDias[d]).join(", ");

      return {
        valid: false,
        reason: `El servicio no está disponible hoy. Días disponibles: ${listaDias}`,
      };
    }

    const horaDentroRango = horariosDelDia.some((h) => {
      return horaActual >= h.hora_inicio && horaActual <= h.hora_fin;
    });

    if (!horaDentroRango) {
      const rangos = horariosDelDia
        .map((h) => `${h.hora_inicio.slice(0, 5)} - ${h.hora_fin.slice(0, 5)}`)
        .join(", ");
      return {
        valid: false,
        reason: `El servicio no está disponible a esta hora. Horarios: ${rangos}`,
      };
    }

    return { valid: true, reason: null };
  } catch (error) {
    console.error("Error en validarHorarioServicio:", error);
    return { valid: true, reason: null };
  }
};

// ============================================
// GET CLIENT SUBSCRIPTIONS
// ============================================
exports.getClientSubscriptions = async (personId, branchId = null) => {
  try {
    const params = [personId];

    let sql = `
      SELECT 
        i.id AS id,
        i.servicio_id,
        i.sucursal_id,
        s.nombre AS service_name,
        TO_CHAR(i.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
        TO_CHAR(i.fecha_vencimiento, 'YYYY-MM-DD') AS fecha_vencimiento,
        i.ingresos_disponibles,
        i.estado,
        s.precio,
        s.numero_ingresos,
        s.multisucursal,
        CASE 
          WHEN i.fecha_vencimiento >= TIMEZONE('America/La_Paz', NOW())::date 
               AND (i.ingresos_disponibles > 0 OR i.ingresos_disponibles IS NULL)
               THEN 'active'
          WHEN i.fecha_inicio > TIMEZONE('America/La_Paz', NOW())::date 
               THEN 'pending'
          ELSE 'expired'
        END AS computed_status
      FROM inscripciones i
      INNER JOIN servicios s ON i.servicio_id = s.id
      WHERE i.persona_id = $1
        AND i.estado = 1
    `;

    if (
      branchId !== null &&
      branchId !== undefined &&
      !Number.isNaN(Number(branchId))
    ) {
      params.push(Number(branchId));
      sql += ` AND (i.sucursal_id = $2 OR s.multisucursal = TRUE)`;
    }

    sql += ` ORDER BY 
      s.nombre,
      i.sucursal_id,
      i.fecha_inicio DESC,
      i.id DESC
    `;

    const result = await query(sql, params);

    const groupedMap = new Map();

    result.rows.forEach((row) => {
      const key = `${row.service_name.toLowerCase().trim()}-${row.sucursal_id}`;

      if (!groupedMap.has(key)) {
        groupedMap.set(key, row);
      }
    });

    const uniqueSubscriptions = Array.from(groupedMap.values());

    uniqueSubscriptions.sort((a, b) => {
      const order = { active: 0, pending: 1, expired: 2 };
      const aOrder = order[a.computed_status] ?? 3;
      const bOrder = order[b.computed_status] ?? 3;
      if (aOrder !== bOrder) return aOrder - bOrder;

      return b.fecha_vencimiento.localeCompare(a.fecha_vencimiento);
    });

    return uniqueSubscriptions.map((row) => ({
      id: row.id,
      serviceName: row.service_name,
      startDate: row.fecha_inicio,
      endDate: row.fecha_vencimiento,
      visitsLeft:
        row.numero_ingresos === null ? null : row.ingresos_disponibles,
      status: row.computed_status,
      price: parseFloat(row.precio) || 0,
      isMultisucursal: row.multisucursal,
    }));
  } catch (error) {
    console.error("❌ Error en getClientSubscriptions service:", error);
    throw error;
  }
};

// ============================================
// GET ACCESS LOGS
// ============================================
exports.getAccessLogs = async (
  searchTerm,
  typeFilter,
  limit = 100,
  branchId
) => {
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
  `;

  const params = [];
  const whereClauses = [];

  if (branchId && !Number.isNaN(Number(branchId))) {
    whereClauses.push(`ra.sucursal_id = $${params.length + 1}`);
    params.push(Number(branchId));
  }

  if (searchTerm && searchTerm.trim() !== "") {
    const normalizedSearch = searchTerm.trim().replace(/\s+/g, " ");
    const paramIndex = params.length + 1;

    whereClauses.push(`
      (
        unaccent(LOWER(REGEXP_REPLACE(TRIM(p.nombres), '\\s+', ' ', 'g'))) 
          ILIKE unaccent(LOWER($${paramIndex}))
        OR unaccent(LOWER(REGEXP_REPLACE(TRIM(p.apellidos), '\\s+', ' ', 'g'))) 
          ILIKE unaccent(LOWER($${paramIndex}))
        OR TRIM(p.ci) ILIKE $${paramIndex}
        OR unaccent(LOWER(
          REGEXP_REPLACE(
            TRIM(CONCAT(
              REGEXP_REPLACE(TRIM(p.nombres), '\\s+', ' ', 'g'),
              ' ',
              REGEXP_REPLACE(TRIM(p.apellidos), '\\s+', ' ', 'g')
            )),
            '\\s+', ' ', 'g'
          )
        )) ILIKE unaccent(LOWER($${paramIndex}))
        OR unaccent(LOWER(
          REGEXP_REPLACE(
            TRIM(CONCAT(
              REGEXP_REPLACE(TRIM(p.apellidos), '\\s+', ' ', 'g'),
              ' ',
              REGEXP_REPLACE(TRIM(p.nombres), '\\s+', ' ', 'g')
            )),
            '\\s+', ' ', 'g'
          )
        )) ILIKE unaccent(LOWER($${paramIndex}))
      )
    `);
    params.push(`%${normalizedSearch}%`);
  }

  if (typeFilter && typeFilter !== "all") {
    whereClauses.push(`ra.tipo_persona = $${params.length + 1}`);
    params.push(typeFilter);
  }

  if (whereClauses.length > 0) {
    sql += ` AND ${whereClauses.join(" AND ")}`;
  }

  const safeLimit = Number.isNaN(Number(limit)) ? 100 : Number(limit);
  sql += ` ORDER BY ra.fecha DESC LIMIT ${safeLimit}`;

  const result = await query(sql, params);
  return result.rows;
};

// ============================================
// FORMAT DATE
// ============================================
const formatDate = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.toLocaleString("es-ES", { month: "short" });
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

// ============================================
// SEARCH MEMBERS
// ============================================
exports.searchMembers = async (searchTerm, typeFilter = "all", branchId) => {
  const normalizedSearch = (searchTerm || "").trim().replace(/\s+/g, " ");
  const searchParam = `%${normalizedSearch}%`;

  const results = [];

  const filtrarPorSucursal =
    branchId !== null &&
    branchId !== undefined &&
    !Number.isNaN(Number(branchId));

  const buildPersonSearchWhere = (alias = "p", paramIndex = 1) => `
    (
      unaccent(LOWER(REGEXP_REPLACE(TRIM(${alias}.nombres), '\\s+', ' ', 'g'))) 
        ILIKE unaccent(LOWER($${paramIndex}))
      OR unaccent(LOWER(REGEXP_REPLACE(TRIM(${alias}.apellidos), '\\s+', ' ', 'g'))) 
        ILIKE unaccent(LOWER($${paramIndex}))
      OR TRIM(${alias}.ci) ILIKE $${paramIndex}
      OR unaccent(LOWER(
        REGEXP_REPLACE(
          TRIM(CONCAT(
            REGEXP_REPLACE(TRIM(${alias}.nombres), '\\s+', ' ', 'g'),
            ' ',
            REGEXP_REPLACE(TRIM(${alias}.apellidos), '\\s+', ' ', 'g')
          )),
          '\\s+', ' ', 'g'
        )
      )) ILIKE unaccent(LOWER($${paramIndex}))
      OR unaccent(LOWER(
        REGEXP_REPLACE(
          TRIM(CONCAT(
            REGEXP_REPLACE(TRIM(${alias}.apellidos), '\\s+', ' ', 'g'),
            ' ',
            REGEXP_REPLACE(TRIM(${alias}.nombres), '\\s+', ' ', 'g')
          )),
          '\\s+', ' ', 'g'
        )
      )) ILIKE unaccent(LOWER($${paramIndex}))
    )
  `;

  // CLIENTES
  if (typeFilter === "all" || typeFilter === "cliente") {
    const clientParams = [searchParam];
    let branchFilterIn = "";

    if (filtrarPorSucursal) {
      clientParams.push(Number(branchId));
      branchFilterIn = `AND (i.sucursal_id = $2 OR s.multisucursal = TRUE)`;
    }

    const orderByBranch = filtrarPorSucursal
      ? "CASE WHEN i.sucursal_id = $2 THEN 0 ELSE 1 END,"
      : "";

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
          ROW_NUMBER() OVER (
            PARTITION BY i.servicio_id, i.persona_id
            ORDER BY 
              ${orderByBranch}
              i.fecha_inicio DESC, 
              i.id DESC
          ) as rn,
          CASE 
            WHEN i.fecha_vencimiento::date < TIMEZONE('America/La_Paz', NOW())::date THEN 'vencido'
            ELSE 'activo'
          END as estado_servicio,
          CASE
            WHEN s.numero_ingresos IS NULL THEN true
            WHEN i.ingresos_disponibles IS NULL THEN true
            WHEN i.ingresos_disponibles <= 0 THEN false
            ELSE true
          END as tiene_visitas_disponibles,
          CASE 
            WHEN i.fecha_inicio::date <= TIMEZONE('America/La_Paz', NOW())::date 
              AND i.fecha_vencimiento::date >= TIMEZONE('America/La_Paz', NOW())::date 
            THEN true 
            ELSE false 
          END as esta_en_rango_fechas
        FROM inscripciones i
        INNER JOIN servicios s ON i.servicio_id = s.id
        WHERE i.estado = 1
        ${branchFilterIn}
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
              'tiene_visitas_disponibles', ti.tiene_visitas_disponibles,
              'esta_en_rango_fechas', ti.esta_en_rango_fechas
            ) ORDER BY 
              ti.sucursal_id,
              CASE WHEN ti.estado_servicio = 'activo' THEN 0 ELSE 1 END,
              ti.fecha_vencimiento DESC
          ) FILTER (WHERE ti.idinscripcion IS NOT NULL AND ti.rn = 1),
          '[]'
        ) as servicios
      FROM personas p
      LEFT JOIN todas_las_inscripciones ti ON p.id = ti.persona_id
      WHERE ${buildPersonSearchWhere("p", 1)}
      AND p.estado = 0
    `;

    if (typeFilter === "all") {
      clientSql += ` AND NOT EXISTS (SELECT 1 FROM empleados e WHERE e.persona_id = p.id AND e.estado = 1)`;
    }

    clientSql += ` GROUP BY p.id`;

    const clientResult = await query(clientSql, clientParams);
    results.push(...clientResult.rows);
  }

  // EMPLEADOS
  if (typeFilter === "all" || typeFilter === "empleado") {
    const employeeParams = [searchParam];
    let branchCond = "";

    if (filtrarPorSucursal) {
      employeeParams.push(Number(branchId));
      branchCond = `AND (e.sucursal_id = $2 OR e.rol = 'limpieza')`;
    }

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
            ${filtrarPorSucursal ? "AND ra.sucursal_id = $2" : ""}
          ),
          'ultimo_registro_salida', (
            SELECT MAX(ra.fecha) 
            FROM registros_acceso ra 
            WHERE ra.persona_id = p.id 
            AND ra.tipo_persona = 'empleado' 
            AND ra.detalle LIKE '%Salida%'
            ${filtrarPorSucursal ? "AND ra.sucursal_id = $2" : ""}
          ),
          'estado_actual', CASE 
            WHEN EXISTS (
              SELECT 1 FROM registros_acceso ra 
              WHERE ra.persona_id = p.id 
              AND ra.tipo_persona = 'empleado' 
              AND ra.detalle LIKE '%Entrada%'
              ${filtrarPorSucursal ? "AND ra.sucursal_id = $2" : ""}
              AND ra.fecha > COALESCE((
                SELECT MAX(ra2.fecha) 
                FROM registros_acceso ra2 
                WHERE ra2.persona_id = p.id 
                AND ra2.tipo_persona = 'empleado' 
                AND ra2.detalle LIKE '%Salida%'
                ${filtrarPorSucursal ? "AND ra2.sucursal_id = $2" : ""}
              ), '1900-01-01')
            ) THEN 'in' 
            ELSE 'out' 
          END
        ) as empleado_info
      FROM personas p
      INNER JOIN empleados e ON p.id = e.persona_id
      WHERE ${buildPersonSearchWhere("p", 1)}
      AND e.estado = 1
      AND p.estado = 0
      ${branchCond}
    `;

    const employeeResult = await query(employeeSql, employeeParams);
    results.push(...employeeResult.rows);
  }

  return results;
};

// ============================================
// VALIDATE CLIENT ACCESS
// ============================================
exports.validateClientAccess = async (personId, serviceId, branchId) => {
  const inscriptionResult = await query(
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
    `,
    [personId, serviceId, branchId]
  );

  if (inscriptionResult.rows.length === 0) {
    return {
      valid: false,
      reason: "Inscripción no encontrada o no válida para esta sucursal",
    };
  }

  const inscription = inscriptionResult.rows[0];

  const fechaActualResult = await query(
    `SELECT TIMEZONE('America/La_Paz', NOW()) as ahora`
  );
  const ahora = new Date(fechaActualResult.rows[0].ahora);

  const fechaInicio = new Date(inscription.fecha_inicio);
  const fechaVencimiento = new Date(inscription.fecha_vencimiento);

  if (fechaVencimiento < ahora) {
    return {
      valid: false,
      reason: `Servicio vencido (venció el ${formatDate(fechaVencimiento)})`,
    };
  }

  if (fechaInicio > ahora) {
    return {
      valid: false,
      reason: `El servicio aún no comienza (inicia el ${formatDate(fechaInicio)})`,
    };
  }

  const isUnlimitedService = inscription.servicio_ingresos_ilimitados === null;

  if (!isUnlimitedService && inscription.ingresos_disponibles <= 0) {
    return {
      valid: false,
      reason: `Sin ingresos disponibles para ${inscription.servicio_nombre}`,
    };
  }

  const validacionHorario = await validarHorarioServicio(
    inscription.servicio_real_id,
    ahora
  );

  if (!validacionHorario.valid) {
    return {
      valid: false,
      reason: validacionHorario.reason,
      servicioNombre: inscription.servicio_nombre,
    };
  }

  return {
    valid: true,
    reason: null,
    servicioNombre: inscription.servicio_nombre,
    ingresosDisponibles: isUnlimitedService
      ? null
      : inscription.ingresos_disponibles,
    isMultisucursal: inscription.multisucursal,
  };
};

// ============================================
// MULTISUCURSAL HELPER
// ============================================
const getLatestMultisucursalInscriptions = async (
  personId,
  serviceId,
  fechaInicio,
  fechaVencimiento
) => {
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

// ============================================
// CHECK PAGOS PENDIENTES
// ============================================
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

    if (result.rows.length === 0) return null;

    const pago = result.rows[0];

    return {
      monto_pendiente: parseFloat(pago.monto_pendiente),
      monto_total: parseFloat(pago.monto_total),
      servicio_nombre: pago.servicio_nombre,
    };
  } catch (error) {
    console.error("Error en checkPagosPendientes:", error);
    return null;
  }
};

// ============================================
// REGISTER CLIENT ACCESS
// ✅ SIEMPRE registra el intento (exitoso o denegado)
// ============================================
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
  `,
    [personId, serviceId, branchId]
  );

  // ============================================
  // ✅ NUEVO: registrar intento denegado en vez de throw
  // ============================================
  if (client.rows.length === 0) {
    const servicioInfo = await query(
      `SELECT s.nombre 
       FROM servicios s
       INNER JOIN inscripciones i ON i.servicio_id = s.id
       WHERE i.id = $1`,
      [serviceId]
    );
    const nombreServicio = servicioInfo.rows[0]?.nombre || "Desconocido";

    await query(
      `
      INSERT INTO registros_acceso 
      (persona_id, servicio_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
      VALUES ($1, $2, $3, $4, $5, $6, TIMEZONE('America/La_Paz', NOW()), 'cliente')
    `,
      [
        personId,
        servicioInfo.rows[0] ? serviceId : null,
        `Acceso denegado - Inscripción no válida para esta sucursal (${nombreServicio})`,
        "denegado",
        branchId,
        userId,
      ]
    );

    return {
      success: false,
      message: "Inscripción no encontrada o no válida para esta sucursal",
    };
  }

  const inscription = client.rows[0];

  const checkExpiration = await query(
    `
    SELECT 
      CASE 
        WHEN fecha_vencimiento::date < TIMEZONE('America/La_Paz', NOW())::date THEN true
        ELSE false
      END as esta_vencido,
      fecha_vencimiento,
      fecha_inicio
    FROM inscripciones 
    WHERE id = $1
  `,
    [serviceId]
  );

  const isExpired = checkExpiration.rows[0]?.esta_vencido || false;
  const fechaInicio = checkExpiration.rows[0]?.fecha_inicio;
  const fechaVencimiento = checkExpiration.rows[0]?.fecha_vencimiento;
  const hoy = new Date();

  const dentroDeRango = fechaInicio <= hoy && fechaVencimiento >= hoy;

  if (isExpired) {
    const fechaVencimientoFormateada = formatDate(fechaVencimiento);

    await query(
      `
      INSERT INTO registros_acceso 
      (persona_id, servicio_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
      VALUES ($1, $2, $3, $4, $5, $6, TIMEZONE('America/La_Paz', NOW()), 'cliente')
    `,
      [
        personId,
        inscription.servicio_real_id,
        `Acceso denegado - Servicio ${inscription.servicio_nombre} vencido (venció el ${fechaVencimientoFormateada})`,
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

  if (!dentroDeRango) {
    await query(
      `
      INSERT INTO registros_acceso 
      (persona_id, servicio_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
      VALUES ($1, $2, $3, $4, $5, $6, TIMEZONE('America/La_Paz', NOW()), 'cliente')
    `,
      [
        personId,
        inscription.servicio_real_id,
        `Acceso denegado - Fuera del período de vigencia del servicio ${inscription.servicio_nombre}`,
        "denegado",
        branchId,
        userId,
      ]
    );

    return {
      success: false,
      message: `Fuera del período de vigencia del servicio ${inscription.servicio_nombre}`,
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

  // ✅ VALIDAR HORARIO
  const fechaActualResult = await query(
    `SELECT TIMEZONE('America/La_Paz', NOW()) as ahora`
  );
  const ahora = new Date(fechaActualResult.rows[0].ahora);

  const validacionHorario = await validarHorarioServicio(
    inscription.servicio_real_id,
    ahora
  );

  if (!validacionHorario.valid) {
    await query(
      `
      INSERT INTO registros_acceso 
      (persona_id, servicio_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
      VALUES ($1, $2, $3, $4, $5, $6, TIMEZONE('America/La_Paz', NOW()), 'cliente')
    `,
      [
        personId,
        inscription.servicio_real_id,
        `Acceso denegado - ${validacionHorario.reason} (Servicio: ${inscription.servicio_nombre})`,
        "denegado",
        branchId,
        userId,
      ]
    );

    return {
      success: false,
      message: validacionHorario.reason,
    };
  }

  let remainingVisits = 0;
  let latestMultisucursalInscriptions = [];

  if (!isUnlimitedService) {
    if (inscription.multisucursal) {
      latestMultisucursalInscriptions =
        await getLatestMultisucursalInscriptions(
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
    updatedInscriptionsCount: inscription.multisucursal
      ? latestMultisucursalInscriptions.length
      : 1,
    tieneDeuda: pagoPendiente !== null,
    deudaInfo: pagoPendiente
      ? {
          montoPendiente: pagoPendiente.monto_pendiente,
          montoTotal: pagoPendiente.monto_total,
          servicioNombre: pagoPendiente.servicio_nombre,
        }
      : null,
  };
};

// ============================================
// HELPER: EMPLOYEE SCHEDULE (día real)
// ============================================
const getEmployeeScheduleForToday = async (employeeId) => {
  const employeeResult = await query(
    `SELECT rol FROM empleados WHERE id = $1`,
    [employeeId]
  );

  if (employeeResult.rows.length === 0) {
    throw new Error("Empleado no encontrado");
  }

  const rol = employeeResult.rows[0].rol;

  if (rol === "limpieza") {
    return null;
  }

  const dayResult = await query(
    `SELECT EXTRACT(ISODOW FROM TIMEZONE('America/La_Paz', NOW()))::int as dia`
  );
  const diaSemanaActual = dayResult.rows[0].dia;

  const horarioResult = await query(
    `SELECT hora_ingreso, hora_salida 
     FROM horarios_empleado 
     WHERE empleado_id = $1 AND dia_semana = $2`,
    [employeeId, diaSemanaActual]
  );

  if (horarioResult.rows.length > 0) {
    return horarioResult.rows[0];
  }

  throw new Error(
    `El empleado no tiene horario asignado para hoy (día ${diaSemanaActual})`
  );
};

// ============================================
// REGISTER EMPLOYEE CHECK-IN
// ============================================
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

  if (emp.rol === "limpieza") {
    const currentTimeResult = await query(
      `SELECT TO_CHAR(TIMEZONE('America/La_Paz', NOW()), 'HH24:MI') as hora_actual`
    );
    const horaActual = currentTimeResult.rows[0].hora_actual;

    const detail = `Entrada: ${horaActual}`;

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
      isLate: false,
      minutes: 0,
    };
  }

  const horario = await getEmployeeScheduleForToday(employeeId);

  const currentTimeResult = await query(
    `SELECT TIMEZONE('America/La_Paz', NOW()) as hora_actual_bolivia`
  );

  const horaActualBolivia = currentTimeResult.rows[0].hora_actual_bolivia;

  const [shiftHours, shiftMinutes, shiftSeconds] = horario.hora_ingreso
    .split(":")
    .map(Number);

  const hoy = new Date(horaActualBolivia);
  const horaIngresoHoy = new Date(hoy);
  horaIngresoHoy.setHours(shiftHours, shiftMinutes, shiftSeconds || 0, 0);

  const diffMs = horaActualBolivia - horaIngresoHoy;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  let detail;
  let isLate = false;
  let minutes = 0;

  if (diffMinutes > 0) {
    isLate = true;
    minutes = diffMinutes;
    detail = `Entrada: ${diffMinutes} minuto${diffMinutes !== 1 ? "s" : ""} tarde`;
  } else {
    detail = `Entrada: A tiempo`;
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
    minutes,
  };
};

// ============================================
// REGISTER EMPLOYEE CHECK-OUT
// ============================================
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

  if (emp.rol === "limpieza") {
    const currentTimeResult = await query(
      `SELECT TO_CHAR(TIMEZONE('America/La_Paz', NOW()), 'HH24:MI') as hora_actual`
    );
    const horaActual = currentTimeResult.rows[0].hora_actual;

    const detail = `Salida: ${horaActual}`;

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
      isEarly: false,
      minutes: 0,
    };
  }

  const horario = await getEmployeeScheduleForToday(employeeId);

  const currentTimeResult = await query(
    `SELECT TIMEZONE('America/La_Paz', NOW()) as hora_actual_bolivia`
  );

  const horaActualBolivia = currentTimeResult.rows[0].hora_actual_bolivia;

  const [shiftHours, shiftMinutes, shiftSeconds] = horario.hora_salida
    .split(":")
    .map(Number);

  const hoy = new Date(horaActualBolivia);
  const horaSalidaHoy = new Date(hoy);
  horaSalidaHoy.setHours(shiftHours, shiftMinutes, shiftSeconds || 0, 0);

  const diffMs = horaSalidaHoy - horaActualBolivia;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  let detail;
  let isEarly = false;
  let minutes = 0;

  if (diffMinutes > 0) {
    isEarly = true;
    minutes = diffMinutes;
    detail = `Salida: ${diffMinutes} minuto${diffMinutes !== 1 ? "s" : ""} antes`;
  } else {
    detail = `Salida: A tiempo`;
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
    minutes,
  };
};

// ============================================
// REGISTER ACCESS DENIED
// ============================================
exports.registerAccessDeniedNoActiveSubscription = async (
  personId,
  branchId,
  userId,
  memberName
) => {
  await query(
    `
    INSERT INTO registros_acceso 
    (persona_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
    VALUES ($1, $2, $3, $4, $5, TIMEZONE('America/La_Paz', NOW()), 'cliente')
  `,
    [
      personId,
      `Acceso denegado - Sin inscripción activa`,
      "denegado",
      branchId,
      userId,
    ]
  );

  return {
    success: false,
    message: `${memberName} no tiene inscripciones activas`,
  };
};