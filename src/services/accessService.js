const { query } = require("../../db");

// ============================================
// HELPER: DÍA DE LA SEMANA EN BD (1=Lunes, 7=Domingo)
// ============================================
const getDiaSemanaBD = (date) => {
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
};

// ============================================
// CONFIG: ROLES QUE NO REQUIEREN HORARIO
// ============================================
const ROLES_SIN_HORARIO = new Set(["admin"]);

const rolRequiereHorario = (rol) => !ROLES_SIN_HORARIO.has(rol);

const NOMBRES_DIAS = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
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
// HELPER: FORMATEAR FECHA
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
// GET CLIENT SUBSCRIPTIONS
// ============================================
exports.getClientSubscriptions = async (personId, branchId = null) => {
  try {
    const params = [personId];

    // ✅ FIX: usar ::text en columnas DATE para que viajen como string
    // "YYYY-MM-DD" puro, sin que el driver de pg las convierta a Date UTC
    // y el frontend las desfase un día.
    let sql = `
      SELECT 
        i.id AS id,
        i.servicio_id,
        i.sucursal_id,
        s.nombre AS service_name,
        i.fecha_inicio::text AS fecha_inicio,
        i.fecha_vencimiento::text AS fecha_vencimiento,
        i.ingresos_disponibles,
        i.estado,
        i.estado_inscripcion,
        s.precio,
        s.numero_ingresos,
        s.multisucursal,
        COALESCE(ts.nombre, 'general') AS tipo_servicio,
        CASE 
          WHEN i.estado_inscripcion = 'inactivo' 
               AND i.fecha_inicio > TIMEZONE('America/La_Paz', NOW())::date 
               THEN 'pending'
          WHEN i.estado_inscripcion = 'activo'
               THEN 'active'
          ELSE 'expired'
        END AS computed_status
      FROM inscripciones i
      INNER JOIN servicios s ON i.servicio_id = s.id
      LEFT JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
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

    const statusPriority = { active: 0, pending: 1, expired: 2 };

    const targetBranchId =
      branchId !== null &&
      branchId !== undefined &&
      !Number.isNaN(Number(branchId))
        ? Number(branchId)
        : null;

    const groupedMap = new Map();

    result.rows.forEach((row) => {
      const key = targetBranchId
        ? `${row.tipo_servicio}`
        : `${row.tipo_servicio}-${row.sucursal_id}`;

      if (!groupedMap.has(key)) {
        groupedMap.set(key, row);
        return;
      }

      const existing = groupedMap.get(key);

      if (targetBranchId) {
        const existingIsLocal = existing.sucursal_id === targetBranchId;
        const newIsLocal = row.sucursal_id === targetBranchId;

        if (newIsLocal && !existingIsLocal) {
          groupedMap.set(key, row);
          return;
        }
        if (!newIsLocal && existingIsLocal) {
          return;
        }
      }

      const existingPriority = statusPriority[existing.computed_status] ?? 3;
      const newPriority = statusPriority[row.computed_status] ?? 3;

      if (newPriority < existingPriority) {
        groupedMap.set(key, row);
        return;
      }

      if (newPriority === existingPriority) {
        const cmpFecha = (row.fecha_vencimiento || "").localeCompare(
          existing.fecha_vencimiento || ""
        );
        if (cmpFecha > 0) {
          groupedMap.set(key, row);
          return;
        }
        if (cmpFecha === 0 && row.id > existing.id) {
          groupedMap.set(key, row);
        }
      }
    });

    const uniqueSubscriptions = Array.from(groupedMap.values());

    uniqueSubscriptions.sort((a, b) => {
      const aOrder = statusPriority[a.computed_status] ?? 3;
      const bOrder = statusPriority[b.computed_status] ?? 3;
      if (aOrder !== bOrder) return aOrder - bOrder;

      return (a.tipo_servicio || "").localeCompare(b.tipo_servicio || "");
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
      ra.inscripcion_id,
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

  // ============================================
  // CLIENTES
  // ============================================
  if (typeFilter === "all" || typeFilter === "cliente") {
    const clientParams = [searchParam];
    let branchFilterIn = "";

    if (filtrarPorSucursal) {
      clientParams.push(Number(branchId));
      branchFilterIn = `AND (i.sucursal_id = $2 OR s.multisucursal = TRUE)`;
    }

    // ✅ FIX: fecha_inicio y fecha_vencimiento con ::text para no desfasar
    let clientSql = `
      WITH inscripciones_calculadas AS (
        SELECT 
          i.id as idinscripcion,
          i.persona_id,
          i.servicio_id,
          i.ingresos_disponibles,
          i.fecha_inicio::text as fecha_inicio,
          i.fecha_vencimiento::text as fecha_vencimiento,
          i.estado,
          i.estado_inscripcion,
          i.sucursal_id,
          s.nombre as nombre_servicio,
          s.multisucursal,
          s.numero_ingresos as servicio_ingresos_ilimitados,
          COALESCE(ts.nombre, 'general') as tipo_servicio,
          CASE WHEN i.estado_inscripcion = 'activo' THEN true ELSE false END as es_activa
        FROM inscripciones i
        INNER JOIN servicios s ON i.servicio_id = s.id
        LEFT JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
        WHERE i.estado = 1
        ${branchFilterIn}
      ),
      candidatas AS (
        SELECT 
          ic.*,
          ROW_NUMBER() OVER (
            PARTITION BY ic.persona_id, ic.tipo_servicio
            ORDER BY 
              CASE WHEN ic.es_activa THEN 0 ELSE 1 END,
              ic.fecha_vencimiento DESC,
              ic.idinscripcion DESC
          ) as rn_por_tipo
        FROM inscripciones_calculadas ic
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
              'idinscripcion', c.idinscripcion,
              'idservicio', c.servicio_id,
              'nombre_servicio', c.nombre_servicio,
              'ingresos_disponibles', c.ingresos_disponibles,
              'fecha_inicio', c.fecha_inicio,
              'fecha_vencimiento', c.fecha_vencimiento,
              'estado', c.estado,
              'estado_inscripcion', c.estado_inscripcion,
              'sucursal_id', c.sucursal_id,
              'multisucursal', c.multisucursal,
              'tipo_servicio', c.tipo_servicio,
              'servicio_ingresos_ilimitados', (c.servicio_ingresos_ilimitados IS NULL)
            ) ORDER BY 
              CASE WHEN c.es_activa THEN 0 ELSE 1 END,
              c.tipo_servicio ASC,
              c.fecha_vencimiento DESC
          ) FILTER (WHERE c.idinscripcion IS NOT NULL AND c.rn_por_tipo = 1),
          '[]'
        ) as servicios
      FROM personas p
      LEFT JOIN candidatas c ON p.id = c.persona_id AND c.rn_por_tipo = 1
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

  // ============================================
  // EMPLEADOS
  // ============================================
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
          'trabaja_hoy', CASE
            WHEN e.rol = 'admin' THEN true
            ELSE EXISTS (
              SELECT 1 FROM horarios_empleado he
              WHERE he.empleado_id = e.id
                AND he.dia_semana = EXTRACT(ISODOW FROM TIMEZONE('America/La_Paz', NOW()))::int
            )
          END,
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
// CHECK: YA INGRESÓ HOY (por inscripción)
// ============================================
const checkYaIngresóHoy = async (inscripcionId) => {
  const result = await query(
    `
    SELECT 
      ra.id,
      ra.sucursal_id,
      s.nombre AS sucursal_nombre,
      TO_CHAR(ra.fecha, 'HH24:MI') AS hora_ingreso
    FROM registros_acceso ra
    INNER JOIN sucursales s ON ra.sucursal_id = s.id
    WHERE ra.inscripcion_id = $1
      AND ra.tipo_persona = 'cliente'
      AND ra.estado = 'exitoso'
      AND ra.fecha::date = TIMEZONE('America/La_Paz', NOW())::date
    ORDER BY ra.fecha DESC
    LIMIT 1
    `,
    [inscripcionId]
  );

  if (result.rows.length === 0) return null;
  return result.rows[0];
};

// ============================================
// REGISTER CLIENT ACCESS
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
      s.numero_ingresos as servicio_ingresos_ilimitados,
      p.nombres AS persona_nombres,
      p.apellidos AS persona_apellidos,
      p.ci AS persona_ci
    FROM inscripciones i
    INNER JOIN servicios s ON i.servicio_id = s.id
    INNER JOIN personas p ON i.persona_id = p.id
    WHERE i.persona_id = $1 AND i.id = $2
    AND (i.sucursal_id = $3 OR s.multisucursal = TRUE)
    AND p.estado = 0
  `,
    [personId, serviceId, branchId]
  );

  const insertLogAndReturn = async ({
    inscripcionId,
    servicioId,
    detalle,
    estado,
  }) => {
    const logInsert = await query(
      `
      INSERT INTO registros_acceso 
      (persona_id, servicio_id, inscripcion_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
      VALUES ($1, $2, $3, $4, $5, $6, $7, TIMEZONE('America/La_Paz', NOW()), 'cliente')
      RETURNING id, TO_CHAR(fecha, 'YYYY-MM-DD HH24:MI') as fecha
      `,
      [
        personId,
        servicioId,
        inscripcionId,
        detalle,
        estado,
        branchId,
        userId,
      ]
    );

    return {
      id: logInsert.rows[0].id.toString(),
      timestamp: logInsert.rows[0].fecha,
      memberName: "",
      memberType: "client",
      detail: detalle,
      status: estado === "exitoso" ? "success" : "denied",
      ci: undefined,
    };
  };

  if (client.rows.length === 0) {
    const servicioInfo = await query(
      `SELECT s.nombre 
       FROM servicios s
       INNER JOIN inscripciones i ON i.servicio_id = s.id
       WHERE i.id = $1`,
      [serviceId]
    );
    const nombreServicio = servicioInfo.rows[0]?.nombre || "Desconocido";
    const detalle = `Acceso denegado - Inscripción no válida para esta sucursal (${nombreServicio})`;

    const log = await insertLogAndReturn({
      inscripcionId: serviceId,
      servicioId: servicioInfo.rows[0] ? serviceId : null,
      detalle,
      estado: "denegado",
    });

    return {
      success: false,
      message: "Inscripción no encontrada o no válida para esta sucursal",
      log,
    };
  }

  const inscription = client.rows[0];
  const inscripcionId = inscription.id;

  const memberName = `${inscription.persona_nombres} ${inscription.persona_apellidos}`;
  const memberCi = inscription.persona_ci;

  const isUnlimitedService = inscription.servicio_ingresos_ilimitados === null;

  // ✅ VALIDACIÓN 1: estado activo
  // ✅ FIX: comparar fechas como strings YMD usando la fecha de Bolivia
  if (inscription.estado_inscripcion !== "activo") {
    const motivo =
      inscription.fecha_vencimiento &&
      inscription.fecha_vencimiento.toISOString().slice(0, 10) <
        new Date().toISOString().slice(0, 10)
        ? `Servicio ${inscription.servicio_nombre} vencido`
        : `Servicio ${inscription.servicio_nombre} sin ingresos disponibles o inactivo`;

    const detalle = `Acceso denegado - ${motivo}`;
    const log = await insertLogAndReturn({
      inscripcionId,
      servicioId: inscription.servicio_real_id,
      detalle,
      estado: "denegado",
    });
    log.memberName = memberName;
    log.ci = memberCi;

    return {
      success: false,
      message: motivo,
      log,
    };
  }

  // ✅ VALIDACIÓN 2: ya ingresó hoy (solo limitados)
  if (!isUnlimitedService) {
    const ingresoPrevio = await checkYaIngresóHoy(inscripcionId);

    if (ingresoPrevio) {
      const motivo = `Ya se ingresó una vez hoy a ${ingresoPrevio.sucursal_nombre} con esta inscripción`;
      const detalle = `Acceso denegado - ${motivo}`;

      const log = await insertLogAndReturn({
        inscripcionId,
        servicioId: inscription.servicio_real_id,
        detalle,
        estado: "denegado",
      });
      log.memberName = memberName;
      log.ci = memberCi;

      return {
        success: false,
        message: motivo,
        log,
      };
    }
  }

  // ✅ VALIDACIÓN 3: horario del servicio
  const fechaActualResult = await query(
    `SELECT TIMEZONE('America/La_Paz', NOW()) as ahora`
  );
  const ahora = new Date(fechaActualResult.rows[0].ahora);

  const validacionHorario = await validarHorarioServicio(
    inscription.servicio_real_id,
    ahora
  );

  if (!validacionHorario.valid) {
    const detalle = `Acceso denegado - ${validacionHorario.reason} (Servicio: ${inscription.servicio_nombre})`;

    const log = await insertLogAndReturn({
      inscripcionId,
      servicioId: inscription.servicio_real_id,
      detalle,
      estado: "denegado",
    });
    log.memberName = memberName;
    log.ci = memberCi;

    return {
      success: false,
      message: validacionHorario.reason,
      log,
    };
  }

  // ============================================
  // DECREMENTAR INGRESOS (solo si es limitado)
  // ============================================
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

    if (remainingVisits <= 0) {
      await query(
        `UPDATE inscripciones SET estado_inscripcion = 'inactivo' WHERE id = $1`,
        [serviceId]
      );
    }
  }

  const detailMessage = isUnlimitedService
    ? `Acceso exitoso - ${inscription.servicio_nombre} (Ingresos ilimitados)`
    : `Acceso exitoso - ${inscription.servicio_nombre} (Visitas restantes: ${remainingVisits})`;

  const log = await insertLogAndReturn({
    inscripcionId,
    servicioId: inscription.servicio_real_id,
    detalle: detailMessage,
    estado: "exitoso",
  });
  log.memberName = memberName;
  log.ci = memberCi;

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
    log,
  };
};

// ============================================
// HELPER: EMPLOYEE SCHEDULE (según rol y día)
// ============================================
const getEmployeeScheduleForToday = async (employeeId) => {
  const employeeResult = await query(
    `SELECT rol FROM empleados WHERE id = $1 AND estado = 1`,
    [employeeId]
  );

  if (employeeResult.rows.length === 0) {
    throw new Error("Empleado no encontrado o inactivo");
  }

  const rol = employeeResult.rows[0].rol;

  if (!rolRequiereHorario(rol)) {
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

  return {
    noTrabajaHoy: true,
    diaSemanaActual,
    rol,
  };
};

// ============================================
// HELPER: ESTADO ACTUAL DEL EMPLEADO (por persona)
// ============================================
const getEmployeeEstadoHoy = async (personaId) => {
  const result = await query(
    `
    SELECT 
      ra.detalle,
      ra.fecha
    FROM registros_acceso ra
    WHERE ra.persona_id = $1
      AND ra.tipo_persona = 'empleado'
      AND ra.estado = 'exitoso'
      AND ra.fecha::date = TIMEZONE('America/La_Paz', NOW())::date
      AND (ra.detalle LIKE 'Entrada%' OR ra.detalle LIKE 'Salida%')
    ORDER BY ra.fecha DESC
    LIMIT 1
    `,
    [personaId]
  );

  if (result.rows.length === 0) {
    return { estado: "out", ultimoDetalle: null };
  }

  const ultimo = result.rows[0];
  const esEntrada = ultimo.detalle.startsWith("Entrada");

  return {
    estado: esEntrada ? "in" : "out",
    ultimoDetalle: ultimo.detalle,
  };
};

// ============================================
// HELPER: registra log de acceso denegado de empleado
// ============================================
const registrarAccesoDenegadoEmpleado = async ({
  personaId,
  branchId,
  userId,
  motivo,
  rol,
}) => {
  const detalle = `Acceso denegado - ${motivo} (rol: ${rol})`;

  await query(
    `
    INSERT INTO registros_acceso
    (persona_id, detalle, estado, sucursal_id, usuario_registro_id, fecha, tipo_persona)
    VALUES ($1, $2, $3, $4, $5, TIMEZONE('America/La_Paz', NOW()), 'empleado')
    `,
    [personaId, detalle, "denegado", branchId, userId]
  );

  return detalle;
};

// ============================================
// REGISTER EMPLOYEE CHECK-IN
// ============================================
exports.registerEmployeeCheckIn = async (employeeId, branchId, userId) => {
  const employee = await query(
    `
    SELECT e.*, p.nombres, p.apellidos, p.ci, p.estado AS persona_estado
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

  if (emp.persona_estado !== 0) {
    throw new Error("Empleado eliminado o inactivo");
  }

  if (emp.estado !== 1) {
    throw new Error("El empleado está inactivo en el sistema");
  }

  const { estado } = await getEmployeeEstadoHoy(emp.persona_id);

  if (estado === "in") {
    throw new Error(
      "El empleado ya tiene una entrada registrada hoy sin salida. Debe registrar su salida antes de volver a ingresar."
    );
  }

  const rol = emp.rol;
  const requiereHorario = rolRequiereHorario(rol);

  if (!requiereHorario) {
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
      rol,
    };
  }

  const horario = await getEmployeeScheduleForToday(employeeId);

  if (horario && horario.noTrabajaHoy) {
    const motivo = `Hoy no trabaja (${NOMBRES_DIAS[horario.diaSemanaActual]})`;

    const detalle = await registrarAccesoDenegadoEmpleado({
      personaId: emp.persona_id,
      branchId,
      userId,
      motivo,
      rol,
    });

    return {
      success: false,
      message: motivo,
      isLate: false,
      minutes: 0,
      rol,
      denied: true,
      log: {
        id: null,
        timestamp: new Date().toISOString(),
        memberName: `${emp.nombres} ${emp.apellidos}`.trim(),
        memberType: "employee",
        detail: detalle,
        status: "denied",
        ci: emp.ci,
      },
    };
  }

  const currentTimeResult = await query(
    `SELECT TIMEZONE('America/La_Paz', NOW()) as hora_actual_bolivia`
  );
  const horaActualBolivia = new Date(
    currentTimeResult.rows[0].hora_actual_bolivia
  );

  const [shiftHours, shiftMinutes, shiftSeconds] = horario.hora_ingreso
    .split(":")
    .map(Number);

  const horaIngresoHoy = new Date(horaActualBolivia);
  horaIngresoHoy.setHours(shiftHours, shiftMinutes, shiftSeconds || 0, 0);

  const diffMs = horaActualBolivia - horaIngresoHoy;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  let detail;
  let isLate = false;
  let minutes = 0;

  if (diffMinutes > 0) {
    isLate = true;
    minutes = diffMinutes;
    detail = `Entrada: ${diffMinutes} minuto${diffMinutes !== 1 ? "s" : ""} tarde (rol: ${rol})`;
  } else {
    detail = `Entrada: A tiempo (rol: ${rol})`;
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
    rol,
  };
};

// ============================================
// REGISTER EMPLOYEE CHECK-OUT
// ============================================
exports.registerEmployeeCheckOut = async (employeeId, branchId, userId) => {
  const employee = await query(
    `
    SELECT e.*, p.nombres, p.apellidos, p.ci, p.estado AS persona_estado
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

  if (emp.persona_estado !== 0) {
    throw new Error("Empleado eliminado o inactivo");
  }

  if (emp.estado !== 1) {
    throw new Error("El empleado está inactivo en el sistema");
  }

  const { estado } = await getEmployeeEstadoHoy(emp.persona_id);

  if (estado !== "in") {
    throw new Error(
      "El empleado no tiene una entrada registrada hoy. Debe registrar su entrada primero."
    );
  }

  const rol = emp.rol;
  const requiereHorario = rolRequiereHorario(rol);

  if (!requiereHorario) {
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
      rol,
    };
  }

  const horario = await getEmployeeScheduleForToday(employeeId);

  if (horario && horario.noTrabajaHoy) {
    const motivo = `Hoy no trabaja (${NOMBRES_DIAS[horario.diaSemanaActual]})`;

    const detalle = await registrarAccesoDenegadoEmpleado({
      personaId: emp.persona_id,
      branchId,
      userId,
      motivo,
      rol,
    });

    return {
      success: false,
      message: motivo,
      isEarly: false,
      minutes: 0,
      rol,
      denied: true,
      log: {
        id: null,
        timestamp: new Date().toISOString(),
        memberName: `${emp.nombres} ${emp.apellidos}`.trim(),
        memberType: "employee",
        detail: detalle,
        status: "denied",
        ci: emp.ci,
      },
    };
  }

  const currentTimeResult = await query(
    `SELECT TIMEZONE('America/La_Paz', NOW()) as hora_actual_bolivia`
  );
  const horaActualBolivia = new Date(
    currentTimeResult.rows[0].hora_actual_bolivia
  );

  const [shiftHours, shiftMinutes, shiftSeconds] = horario.hora_salida
    .split(":")
    .map(Number);

  const horaSalidaHoy = new Date(horaActualBolivia);
  horaSalidaHoy.setHours(shiftHours, shiftMinutes, shiftSeconds || 0, 0);

  const diffMs = horaSalidaHoy - horaActualBolivia;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  let detail;
  let isEarly = false;
  let minutes = 0;

  if (diffMinutes > 0) {
    isEarly = true;
    minutes = diffMinutes;
    detail = `Salida: ${diffMinutes} minuto${diffMinutes !== 1 ? "s" : ""} antes (rol: ${rol})`;
  } else {
    detail = `Salida: A tiempo (rol: ${rol})`;
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
    rol,
  };
};

// ============================================
// REGISTER ACCESS DENIED (cliente sin inscripción)
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