// backend/services/salescontrolService.js
const { query, pool } = require("../../db");

const EFECTIVO_REGEX =
  "(?:efectivo|Efectivo)\\s*[:=]?\\s*(?:Bs\\.?)?\\s*([0-9]+(?:[.,][0-9]+)?)";
const QR_REGEX =
  "(?:QR|qr|Q\\.R\\.)\\s*[:=]?\\s*(?:Bs\\.?)?\\s*([0-9]+(?:[.,][0-9]+)?)";

const LA_PAZ_DATE = (alias) => `(${alias}.fecha)::date`;

function normalizeRol(rol) {
  return (rol || "").toString().toLowerCase().trim();
}

function applyForcedSucursal(filters, userSucursalId, userRol) {
  const rolNorm = normalizeRol(userRol);
  const esAdminGlobal = rolNorm === "admin" || rolNorm === "superadmin";
  const forzado =
    !esAdminGlobal && userSucursalId ? Number(userSucursalId) : null;
  return { ...filters, sucursal: forzado ? forzado : filters.sucursal };
}

function toDateString(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return toDateString(d);
  }
  return s;
}

function escapeSqlString(s) {
  return String(s).replace(/'/g, "''");
}

function sqlDateLiteral(dateStr) {
  const s = toDateString(dateStr);
  if (!s) return null;
  return `'${escapeSqlString(s)}'::date`;
}

function sanitizeParams(params) {
  return params.map((p) => (p === undefined ? null : p));
}

const buildDateFilters = async (
  whereConditions,
  params,
  paramCount,
  tableAlias,
  filters,
  hoyLaPazStr
) => {
  let pc = paramCount;
  const col = LA_PAZ_DATE(tableAlias);

  if (filters.dateFilterType === "specific" && filters.specificDate) {
    const lit = sqlDateLiteral(filters.specificDate);
    if (lit) whereConditions.push(`${col} = ${lit}`);
  } else if (
    filters.dateFilterType === "range" &&
    filters.startDate &&
    filters.endDate
  ) {
    const litStart = sqlDateLiteral(filters.startDate);
    const litEnd = sqlDateLiteral(filters.endDate);
    if (litStart && litEnd) {
      whereConditions.push(`${col} BETWEEN ${litStart} AND ${litEnd}`);
    }
  } else if (filters.dateFilterType === "today") {
    const lit = sqlDateLiteral(hoyLaPazStr);
    if (lit) whereConditions.push(`${col} = ${lit}`);
  } else if (filters.dateFilterType === "yesterday") {
    const r = await query(
      "SELECT ($1::date - INTERVAL '1 day')::date::text as ayer",
      [hoyLaPazStr]
    );
    const lit = sqlDateLiteral(r.rows[0].ayer);
    if (lit) whereConditions.push(`${col} = ${lit}`);
  } else if (filters.dateFilterType === "thisWeek") {
    const r = await query(
      `SELECT 
        date_trunc('week', $1::date)::date::text as inicio_semana,
        (date_trunc('week', $1::date) + INTERVAL '6 days')::date::text as fin_semana`,
      [hoyLaPazStr]
    );
    const litStart = sqlDateLiteral(r.rows[0].inicio_semana);
    const litEnd = sqlDateLiteral(r.rows[0].fin_semana);
    if (litStart && litEnd) {
      whereConditions.push(`${col} BETWEEN ${litStart} AND ${litEnd}`);
    }
  } else if (filters.dateFilterType === "lastWeek") {
    const r = await query(
      `SELECT 
        (date_trunc('week', $1::date) - INTERVAL '7 days')::date::text as inicio,
        (date_trunc('week', $1::date) - INTERVAL '1 day')::date::text as fin`,
      [hoyLaPazStr]
    );
    const litStart = sqlDateLiteral(r.rows[0].inicio);
    const litEnd = sqlDateLiteral(r.rows[0].fin);
    if (litStart && litEnd) {
      whereConditions.push(`${col} BETWEEN ${litStart} AND ${litEnd}`);
    }
  } else if (filters.dateFilterType === "thisMonth") {
    const r = await query(
      `SELECT 
        date_trunc('month', $1::date)::date::text as inicio,
        (date_trunc('month', $1::date) + INTERVAL '1 month - 1 day')::date::text as fin`,
      [hoyLaPazStr]
    );
    const litStart = sqlDateLiteral(r.rows[0].inicio);
    const litEnd = sqlDateLiteral(r.rows[0].fin);
    if (litStart && litEnd) {
      whereConditions.push(`${col} BETWEEN ${litStart} AND ${litEnd}`);
    }
  } else if (filters.dateFilterType === "lastMonth") {
    const r = await query(
      `SELECT 
        date_trunc('month', $1::date - INTERVAL '1 month')::date::text as inicio,
        (date_trunc('month', $1::date) - INTERVAL '1 day')::date::text as fin`,
      [hoyLaPazStr]
    );
    const litStart = sqlDateLiteral(r.rows[0].inicio);
    const litEnd = sqlDateLiteral(r.rows[0].fin);
    if (litStart && litEnd) {
      whereConditions.push(`${col} BETWEEN ${litStart} AND ${litEnd}`);
    }
  }

  return pc;
};

async function applyEmpleadoFilter(
  whereConditions,
  params,
  paramCount,
  columnExpr,
  empleadoIdFilter,
  sucursalFilter = null
) {
  if (!empleadoIdFilter) return paramCount;

  const usuarioResult = await query(
    `SELECT u.empleado_id, e.sucursal_id, e.rol
     FROM usuarios u
     INNER JOIN empleados e ON u.empleado_id = e.id
     WHERE u.id = $1::int
     LIMIT 1`,
    [Number(empleadoIdFilter)]
  );

  if (usuarioResult.rows.length === 0) {
    whereConditions.push("1=0");
    return paramCount;
  }

  const {
    empleado_id: empleadoIdReal,
    sucursal_id: sucursalEmpleado,
    rol,
  } = usuarioResult.rows[0];

  if (!empleadoIdReal) {
    whereConditions.push("1=0");
    return paramCount;
  }

  if (normalizeRol(rol) !== "recepcionista") {
    whereConditions.push("1=0");
    return paramCount;
  }

  if (sucursalFilter) {
    if (Number(sucursalEmpleado) !== Number(sucursalFilter)) {
      whereConditions.push("1=0");
      return paramCount;
    }
  }

  whereConditions.push(`${columnExpr} = $${paramCount}::int`);
  params.push(Number(empleadoIdReal));
  return paramCount + 1;
}

async function buildWhereConditions(
  alias,
  filters,
  hoyLaPazStr,
  startParamCount
) {
  const conditions = [];
  const params = [];
  let pc = startParamCount;

  if (filters.sucursal) {
    conditions.push(`${alias}.sucursal_id = $${pc}::int`);
    params.push(Number(filters.sucursal));
    pc++;
  }

  if (filters.empleadoId) {
    pc = await applyEmpleadoFilter(
      conditions,
      params,
      pc,
      `${alias}.empleado_id`,
      filters.empleadoId,
      filters.sucursal
    );
  }

  if (filters.metodoPago) {
    conditions.push(`${alias}.forma_pago = $${pc}::text`);
    params.push(String(filters.metodoPago));
    pc++;
  }

  pc = await buildDateFilters(
    conditions,
    params,
    pc,
    alias,
    filters,
    hoyLaPazStr
  );

  return { conditions, params, endParamCount: pc };
}

// ============================================
// GET SALES (paginación POR TIPO)
// ============================================
const getSales = async (
  filters = {},
  page = 1,
  pageSize = 20,
  userSucursalId = null,
  userRol = null
) => {
  try {
    const effectiveFilters = applyForcedSucursal(
      filters,
      userSucursalId,
      userRol
    );

    const tipo =
      effectiveFilters.tipo === "servicio" ? "servicio" : "producto";

    const todayResult = await query(
      "SELECT (NOW() AT TIME ZONE 'America/La_Paz')::date::text as hoy_la_paz"
    );
    const hoyLaPazStr = todayResult.rows[0].hoy_la_paz;

    const offset = (page - 1) * pageSize;

    const alias = tipo === "producto" ? "vp" : "vs";
    const tablaVentas =
      tipo === "producto" ? "ventas_productos" : "ventas_servicios";

    const where = await buildWhereConditions(
      alias,
      effectiveFilters,
      hoyLaPazStr,
      1
    );

    const wc =
      where.conditions.length > 0
        ? `AND ${where.conditions.join(" AND ")}`
        : "";

    const countQuery = `
      SELECT COUNT(DISTINCT ${alias}.id)::int as total_count
      FROM ${tablaVentas} ${alias}
      WHERE ${alias}.subtotal > 0 ${wc}
    `;

    const limitIdx = where.params.length + 1;
    const offsetIdx = limitIdx + 1;
    const queryParams = sanitizeParams([...where.params, pageSize, offset]);

    let dataQuery;

    if (tipo === "producto") {
      dataQuery = `
        SELECT
          vp.id::int as id,
          TO_CHAR(vp.fecha, 'DD/MM/YYYY, HH24:MI:SS')::text as fecha,
          NULL::text as cliente,
          CONCAT(p_emp.nombres, ' ', p_emp.apellidos)::text as empleado,
          s.nombre::text as sucursal,
          'producto'::text as tipo,
          STRING_AGG(CONCAT(dp.cantidad, 'x ', pro.nombre), ', ')::text as detalle,
          (
            SELECT json_agg(
              json_build_object(
                'nombre', pro2.nombre,
                'cantidad', dp2.cantidad,
                'precio_unitario', dp2.precio_unitario::float,
                'subtotal', dp2.subtotal::float
              ) ORDER BY dp2.id
            )
            FROM detalle_venta_productos dp2
            INNER JOIN productos pro2 ON dp2.producto_id = pro2.id
            WHERE dp2.venta_producto_id = vp.id
          ) as items,
          vp.subtotal::text as subtotal,
          vp.descuento::text as descuento,
          vp.total::text as total,
          vp.forma_pago::text as "formaPago",
          vp.detalle_pago::text as "detalle_pago",
          (
            CASE
              WHEN vp.forma_pago = 'efectivo' THEN vp.total
              WHEN vp.forma_pago = 'qr' THEN 0::numeric
              WHEN vp.forma_pago = 'mixto' THEN
                COALESCE(
                  NULLIF(
                    REPLACE((regexp_match(COALESCE(vp.detalle_pago, ''), '${EFECTIVO_REGEX}', 'i'))[1], ',', '.')::numeric, 0::numeric
                  ),
                  vp.total / 2
                )
              ELSE 0::numeric
            END
          )::numeric as efectivo,
          (
            CASE
              WHEN vp.forma_pago = 'qr' THEN vp.total
              WHEN vp.forma_pago = 'efectivo' THEN 0::numeric
              WHEN vp.forma_pago = 'mixto' THEN
                COALESCE(
                  NULLIF(
                    REPLACE((regexp_match(COALESCE(vp.detalle_pago, ''), '${QR_REGEX}', 'i'))[1], ',', '.')::numeric, 0::numeric
                  ),
                  vp.total / 2
                )
              ELSE 0::numeric
            END
          )::numeric as qr,
          vp.descripcion_descuento::text as "descripcionDescuento",
          vp.descripcion_descuento::text as "justificacionDescuento"
        FROM ventas_productos vp
        INNER JOIN empleados e ON vp.empleado_id = e.id
        INNER JOIN personas p_emp ON e.persona_id = p_emp.id
        INNER JOIN sucursales s ON vp.sucursal_id = s.id
        INNER JOIN detalle_venta_productos dp ON vp.id = dp.venta_producto_id
        INNER JOIN productos pro ON dp.producto_id = pro.id
        WHERE vp.subtotal > 0 ${wc}
        GROUP BY vp.id, vp.fecha, p_emp.nombres, p_emp.apellidos, s.nombre,
                 vp.forma_pago, vp.detalle_pago, vp.descripcion_descuento,
                 vp.subtotal, vp.descuento, vp.total
        ORDER BY vp.fecha DESC
        LIMIT $${limitIdx}::int OFFSET $${offsetIdx}::int
      `;
    } else {
      dataQuery = `
        SELECT
          vs.id::int as id,
          TO_CHAR(vs.fecha, 'DD/MM/YYYY, HH24:MI:SS')::text as fecha,
          (
            SELECT STRING_AGG(DISTINCT CONCAT(p_cli2.nombres, ' ', p_cli2.apellidos), ', ')
            FROM detalle_venta_servicios dvs2
            INNER JOIN inscripciones ins2 ON dvs2.inscripcion_id = ins2.id
            INNER JOIN personas p_cli2 ON ins2.persona_id = p_cli2.id
            WHERE dvs2.venta_servicio_id = vs.id
          )::text as cliente,
          CONCAT(p_emp.nombres, ' ', p_emp.apellidos)::text as empleado,
          s.nombre::text as sucursal,
          'servicio'::text as tipo,
          (
            SELECT STRING_AGG(servicio_detalle, ', ')
            FROM (
              SELECT DISTINCT CONCAT(ser2.nombre, ' (', dvs2.precio::text, ' Bs.)') as servicio_detalle
              FROM detalle_venta_servicios dvs2
              INNER JOIN inscripciones ins2 ON dvs2.inscripcion_id = ins2.id
              INNER JOIN servicios ser2 ON ins2.servicio_id = ser2.id
              WHERE dvs2.venta_servicio_id = vs.id
            ) sub
          )::text as detalle,
          (
            SELECT json_agg(
              json_build_object(
                'nombre', ser2.nombre,
                'cantidad', 1,
                'precio_unitario', dvs2.precio::float,
                'subtotal', dvs2.precio::float
              ) ORDER BY dvs2.id
            )
            FROM detalle_venta_servicios dvs2
            INNER JOIN inscripciones ins2 ON dvs2.inscripcion_id = ins2.id
            INNER JOIN servicios ser2 ON ins2.servicio_id = ser2.id
            WHERE dvs2.venta_servicio_id = vs.id
          ) as items,
          vs.subtotal::text as subtotal,
          vs.descuento::text as descuento,
          vs.total::text as total,
          vs.forma_pago::text as "formaPago",
          vs.detalle_pago::text as "detalle_pago",
          (
            CASE
              WHEN vs.forma_pago = 'efectivo' THEN vs.total
              WHEN vs.forma_pago = 'qr' THEN 0::numeric
              WHEN vs.forma_pago = 'mixto' THEN
                COALESCE(
                  NULLIF(
                    REPLACE((regexp_match(COALESCE(vs.detalle_pago, ''), '${EFECTIVO_REGEX}', 'i'))[1], ',', '.')::numeric, 0::numeric
                  ),
                  vs.total / 2
                )
              ELSE 0::numeric
            END
          )::numeric as efectivo,
          (
            CASE
              WHEN vs.forma_pago = 'qr' THEN vs.total
              WHEN vs.forma_pago = 'efectivo' THEN 0::numeric
              WHEN vs.forma_pago = 'mixto' THEN
                COALESCE(
                  NULLIF(
                    REPLACE((regexp_match(COALESCE(vs.detalle_pago, ''), '${QR_REGEX}', 'i'))[1], ',', '.')::numeric, 0::numeric
                  ),
                  vs.total / 2
                )
              ELSE 0::numeric
            END
          )::numeric as qr,
          vs.descripcion_descuento::text as "descripcionDescuento",
          vs.descripcion_descuento::text as "justificacionDescuento"
        FROM ventas_servicios vs
        INNER JOIN empleados e ON vs.empleado_id = e.id
        INNER JOIN personas p_emp ON e.persona_id = p_emp.id
        INNER JOIN sucursales s ON vs.sucursal_id = s.id
        WHERE vs.subtotal > 0 ${wc}
        ORDER BY vs.fecha DESC
        LIMIT $${limitIdx}::int OFFSET $${offsetIdx}::int
      `;
    }

    const [countResult, dataResult] = await Promise.all([
      query(countQuery, sanitizeParams(where.params)),
      query(dataQuery, queryParams),
    ]);

    const totalCount = parseInt(countResult.rows[0]?.total_count || 0, 10);

    const sales = dataResult.rows.map((row) => {
      return {
        id: String(row.id),
        fecha: row.fecha || "",
        cliente: row.cliente || undefined,
        empleado: row.empleado || "",
        sucursal: row.sucursal || "",
        tipo: row.tipo,
        detalle: row.detalle || "",
        items: Array.isArray(row.items) ? row.items : [],
        subtotal: parseFloat(row.subtotal) || 0,
        descuento: parseFloat(row.descuento) || 0,
        total: parseFloat(row.total) || 0,
        formaPago: row.formaPago,
        efectivo: row.efectivo != null ? parseFloat(row.efectivo) : 0,
        qr: row.qr != null ? parseFloat(row.qr) : 0,
        descripcionDescuento: row.descripcionDescuento || undefined,
        justificacionDescuento: row.justificacionDescuento || undefined,
      };
    });

    return {
      sales,
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages: Math.ceil(totalCount / pageSize) || 0,
      },
    };
  } catch (error) {
    console.error("❌ Error in getSales service:", error);
    throw error;
  }
};

// ============================================
// GET TOTALS
// ============================================
const getTotals = async (
  filters = {},
  userSucursalId = null,
  userRol = null
) => {
  try {
    const effectiveFilters = applyForcedSucursal(
      filters,
      userSucursalId,
      userRol
    );

    const todayRes = await query(
      "SELECT (NOW() AT TIME ZONE 'America/La_Paz')::date::text as hoy_la_paz"
    );
    const hoyLaPazStr = todayRes.rows[0].hoy_la_paz;

    const prod = await buildWhereConditions(
      "vp",
      effectiveFilters,
      hoyLaPazStr,
      1
    );
    const serv = await buildWhereConditions(
      "vs",
      effectiveFilters,
      hoyLaPazStr,
      1
    );

    const wcProd =
      prod.conditions.length > 0 ? `AND ${prod.conditions.join(" AND ")}` : "";
    const wcServ =
      serv.conditions.length > 0 ? `AND ${serv.conditions.join(" AND ")}` : "";

    const totalsQueryProductos = `
      WITH raw AS (
        SELECT
          vp.total::numeric as total_num,
          vp.forma_pago::text as forma_pago,
          vp.detalle_pago::text as detalle_pago
        FROM ventas_productos vp
        WHERE vp.subtotal > 0 ${wcProd}
      ),
      calc AS (
        SELECT
          total_num,
          (
            CASE
              WHEN forma_pago = 'efectivo' THEN total_num
              WHEN forma_pago = 'qr' THEN 0::numeric
              WHEN forma_pago = 'mixto' THEN
                COALESCE(
                  NULLIF(
                    REPLACE(
                      (regexp_match(COALESCE(detalle_pago, ''), '${EFECTIVO_REGEX}', 'i'))[1],
                      ',', '.'
                    )::numeric,
                    0::numeric
                  ),
                  total_num / 2
                )
              ELSE 0::numeric
            END
          )::numeric as efectivo_num,
          (
            CASE
              WHEN forma_pago = 'qr' THEN total_num
              WHEN forma_pago = 'efectivo' THEN 0::numeric
              WHEN forma_pago = 'mixto' THEN
                COALESCE(
                  NULLIF(
                    REPLACE(
                      (regexp_match(COALESCE(detalle_pago, ''), '${QR_REGEX}', 'i'))[1],
                      ',', '.'
                    )::numeric,
                    0::numeric
                  ),
                  total_num / 2
                )
              ELSE 0::numeric
            END
          )::numeric as qr_num
        FROM raw
      )
      SELECT
        COALESCE(SUM(total_num), 0)::numeric as total_productos,
        COALESCE(SUM(efectivo_num), 0)::numeric as efectivo_productos,
        COALESCE(SUM(qr_num), 0)::numeric as qr_productos
      FROM calc
    `;

    const totalsQueryServicios = `
      WITH raw AS (
        SELECT
          vs.total::numeric as total_num,
          vs.forma_pago::text as forma_pago,
          vs.detalle_pago::text as detalle_pago
        FROM ventas_servicios vs
        WHERE vs.subtotal > 0 ${wcServ}
      ),
      calc AS (
        SELECT
          total_num,
          (
            CASE
              WHEN forma_pago = 'efectivo' THEN total_num
              WHEN forma_pago = 'qr' THEN 0::numeric
              WHEN forma_pago = 'mixto' THEN
                COALESCE(
                  NULLIF(
                    REPLACE(
                      (regexp_match(COALESCE(detalle_pago, ''), '${EFECTIVO_REGEX}', 'i'))[1],
                      ',', '.'
                    )::numeric,
                    0::numeric
                  ),
                  total_num / 2
                )
              ELSE 0::numeric
            END
          )::numeric as efectivo_num,
          (
            CASE
              WHEN forma_pago = 'qr' THEN total_num
              WHEN forma_pago = 'efectivo' THEN 0::numeric
              WHEN forma_pago = 'mixto' THEN
                COALESCE(
                  NULLIF(
                    REPLACE(
                      (regexp_match(COALESCE(detalle_pago, ''), '${QR_REGEX}', 'i'))[1],
                      ',', '.'
                    )::numeric,
                    0::numeric
                  ),
                  total_num / 2
                )
              ELSE 0::numeric
            END
          )::numeric as qr_num
        FROM raw
      )
      SELECT
        COALESCE(SUM(total_num), 0)::numeric as total_servicios,
        COALESCE(SUM(efectivo_num), 0)::numeric as efectivo_servicios,
        COALESCE(SUM(qr_num), 0)::numeric as qr_servicios
      FROM calc
    `;

    const [totalesProductosResult, totalesServiciosResult] = await Promise.all([
      query(totalsQueryProductos, sanitizeParams(prod.params)),
      query(totalsQueryServicios, sanitizeParams(serv.params)),
    ]);

    const totalProductos = parseFloat(
      totalesProductosResult.rows[0]?.total_productos || 0
    );
    const efectivoProductos = parseFloat(
      totalesProductosResult.rows[0]?.efectivo_productos || 0
    );
    const qrProductos = parseFloat(
      totalesProductosResult.rows[0]?.qr_productos || 0
    );

    const totalServicios = parseFloat(
      totalesServiciosResult.rows[0]?.total_servicios || 0
    );
    const efectivoServicios = parseFloat(
      totalesServiciosResult.rows[0]?.efectivo_servicios || 0
    );
    const qrServicios = parseFloat(
      totalesServiciosResult.rows[0]?.qr_servicios || 0
    );

    return {
      totalGeneral: totalProductos + totalServicios,
      efectivoGeneral: efectivoProductos + efectivoServicios,
      qrGeneral: qrProductos + qrServicios,
      totalProductos,
      efectivoProductos,
      qrProductos,
      totalServicios,
      efectivoServicios,
      qrServicios,
    };
  } catch (error) {
    console.error("❌ Error in getTotals service:", error);
    throw error;
  }
};

// ============================================
// GET RESUMEN
// ============================================
const getResumen = async (
  filters = {},
  userSucursalId = null,
  userRol = null
) => {
  try {
    const effectiveFilters = applyForcedSucursal(
      filters,
      userSucursalId,
      userRol
    );

    const todayRes = await query(
      "SELECT (NOW() AT TIME ZONE 'America/La_Paz')::date::text as hoy_la_paz"
    );
    const hoyLaPazStr = todayRes.rows[0].hoy_la_paz;

    const prod = await buildWhereConditions(
      "vp",
      effectiveFilters,
      hoyLaPazStr,
      1
    );
    const serv = await buildWhereConditions(
      "vs",
      effectiveFilters,
      hoyLaPazStr,
      1
    );

    const wcProd =
      prod.conditions.length > 0 ? `AND ${prod.conditions.join(" AND ")}` : "";
    const wcServ =
      serv.conditions.length > 0 ? `AND ${serv.conditions.join(" AND ")}` : "";

    const itemsProductosQuery = `
      SELECT pro.nombre, SUM(dp.cantidad)::int as cantidad
      FROM detalle_venta_productos dp
      INNER JOIN productos pro ON dp.producto_id = pro.id
      INNER JOIN ventas_productos vp ON dp.venta_producto_id = vp.id
      WHERE vp.subtotal > 0 ${wcProd}
      GROUP BY pro.nombre
      ORDER BY pro.nombre
    `;

    const itemsServiciosQuery = `
      SELECT ser.nombre, COUNT(*)::int as cantidad
      FROM detalle_venta_servicios dvs
      INNER JOIN inscripciones ins ON dvs.inscripcion_id = ins.id
      INNER JOIN servicios ser ON ins.servicio_id = ser.id
      INNER JOIN ventas_servicios vs ON dvs.venta_servicio_id = vs.id
      WHERE vs.subtotal > 0 ${wcServ}
      GROUP BY ser.nombre
      ORDER BY ser.nombre
    `;

    const [itemsProdResult, itemsServResult, totals] = await Promise.all([
      query(itemsProductosQuery, sanitizeParams(prod.params)),
      query(itemsServiciosQuery, sanitizeParams(serv.params)),
      getTotals(filters, userSucursalId, userRol),
    ]);

    return {
      productos: {
        items: itemsProdResult.rows.map((r) => ({
          nombre: r.nombre,
          cantidad: parseInt(r.cantidad, 10) || 0,
        })),
        totalGeneral: totals.totalProductos,
        totalEfectivo: totals.efectivoProductos,
        totalQr: totals.qrProductos,
      },
      servicios: {
        items: itemsServResult.rows.map((r) => ({
          nombre: r.nombre,
          cantidad: parseInt(r.cantidad, 10) || 0,
        })),
        totalGeneral: totals.totalServicios,
        totalEfectivo: totals.efectivoServicios,
        totalQr: totals.qrServicios,
      },
    };
  } catch (error) {
    console.error("❌ Error in getResumen service:", error);
    throw error;
  }
};

// ============================================
// GET SALE DETAILS
// ============================================
const getSaleDetails = async (saleId, saleType) => {
  try {
    if (saleType === "producto") {
      const saleResult = await query(
        `SELECT 
          vp.*,
          TO_CHAR(vp.fecha, 'DD/MM/YYYY, HH24:MI:SS') as fecha_formateada,
          CONCAT(p_emp.nombres, ' ', p_emp.apellidos) as empleado_nombre,
          s.nombre as sucursal_nombre,
          u.username as usuario_creador
         FROM ventas_productos vp
         INNER JOIN empleados e ON vp.empleado_id = e.id
         INNER JOIN personas p_emp ON e.persona_id = p_emp.id
         INNER JOIN sucursales s ON vp.sucursal_id = s.id
         LEFT JOIN usuarios u ON e.id = u.empleado_id
         WHERE vp.id = $1::int`,
        [saleId]
      );

      if (saleResult.rows.length === 0) throw new Error("Venta no encontrada");

      const sale = saleResult.rows[0];

      const detailsResult = await query(
        `SELECT 
          dp.*,
          p.nombre,
          p.precio_venta as precio_unitario,
          (dp.cantidad * dp.precio_unitario) as subtotal
         FROM detalle_venta_productos dp
         INNER JOIN productos p ON dp.producto_id = p.id
         WHERE dp.venta_producto_id = $1::int`,
        [saleId]
      );

      return {
        ...sale,
        fecha: sale.fecha_formateada,
        items: detailsResult.rows,
        tipo: "producto",
        descripcionDescuento: sale.descripcion_descuento,
      };
    } else {
      const saleResult = await query(
        `SELECT 
          vs.*,
          TO_CHAR(vs.fecha, 'DD/MM/YYYY, HH24:MI:SS') as fecha_formateada,
          (
            SELECT STRING_AGG(DISTINCT CONCAT(p_cli2.nombres, ' ', p_cli2.apellidos), ', ')
            FROM detalle_venta_servicios dvs2
            INNER JOIN inscripciones ins2 ON dvs2.inscripcion_id = ins2.id
            INNER JOIN personas p_cli2 ON ins2.persona_id = p_cli2.id
            WHERE dvs2.venta_servicio_id = vs.id
          ) as cliente_nombre,
          CONCAT(p_emp.nombres, ' ', p_emp.apellidos) as empleado_nombre,
          s.nombre as sucursal_nombre,
          u.username as usuario_creador
         FROM ventas_servicios vs
         INNER JOIN empleados e ON vs.empleado_id = e.id
         INNER JOIN personas p_emp ON e.persona_id = p_emp.id
         INNER JOIN sucursales s ON vs.sucursal_id = s.id
         LEFT JOIN usuarios u ON e.id = u.empleado_id
         WHERE vs.id = $1::int`,
        [saleId]
      );

      if (saleResult.rows.length === 0) throw new Error("Venta no encontrada");

      const sale = saleResult.rows[0];

      const detailsResult = await query(
        `SELECT 
          dvs.*,
          ser.nombre,
          ins.fecha_inicio,
          ins.fecha_vencimiento,
          ser.precio,
          (SELECT COUNT(*) FROM detalle_venta_servicios WHERE venta_servicio_id = $1::int) as cantidad
         FROM detalle_venta_servicios dvs
         INNER JOIN inscripciones ins ON dvs.inscripcion_id = ins.id
         INNER JOIN servicios ser ON ins.servicio_id = ser.id
         WHERE dvs.venta_servicio_id = $1::int`,
        [saleId]
      );

      return {
        ...sale,
        fecha: sale.fecha_formateada,
        items: detailsResult.rows,
        tipo: "servicio",
        descripcionDescuento: sale.descripcion_descuento,
      };
    }
  } catch (error) {
    console.error("❌ Error in getSaleDetails service:", error);
    throw error;
  }
};

// ============================================
// GET SUCURSALES
// ============================================
const getSucursales = async () => {
  try {
    const result = await query(
      `SELECT id, nombre FROM sucursales WHERE estado = 1 ORDER BY nombre`
    );
    return result.rows.map((row) => ({
      id: row.id.toString(),
      name: row.nombre,
    }));
  } catch (error) {
    console.error("❌ Error in getSucursales service:", error);
    throw error;
  }
};

// ============================================
// GET EMPLEADOS — SOLO recepcionistas + sucursalId
// ============================================
const getEmpleados = async (sucursal = null) => {
  try {
    const params = [];
    let whereExtra = "";

    const baseWhere = `e.estado = 1 AND u.estado = 1 AND e.rol = 'recepcionista'`;

    if (sucursal && sucursal !== "all") {
      params.push(Number(sucursal));
      whereExtra = `AND e.sucursal_id = $${params.length}::int`;
    }

    const result = await query(
      `SELECT DISTINCT
         u.id as id,
         CONCAT(p.nombres, ' ', p.apellidos) as nombre,
         e.sucursal_id as "sucursalId"
       FROM usuarios u
       INNER JOIN empleados e ON u.empleado_id = e.id
       INNER JOIN personas p ON e.persona_id = p.id
       WHERE ${baseWhere}
       ${whereExtra}
       ORDER BY nombre`,
      sanitizeParams(params)
    );

    return result.rows.map((r) => ({
      id: r.id.toString(),
      nombre: r.nombre,
      sucursalId: r.sucursalId != null ? r.sucursalId.toString() : null,
    }));
  } catch (error) {
    console.error("❌ Error in getEmpleados service:", error);
    throw error;
  }
};

// ============================================
// ANULAR VENTA
// ============================================
const anularVenta = async (saleId, saleType, actor) => {
  const { usuarioId, rol } = actor || {};

  if (!saleId) throw new Error("ID de venta requerido");
  if (saleType !== "producto" && saleType !== "servicio") {
    throw new Error("Tipo de venta inválido. Debe ser 'producto' o 'servicio'");
  }
  if (normalizeRol(rol) !== "admin") {
    const err = new Error("Solo un administrador puede anular ventas");
    err.statusCode = 403;
    throw err;
  }

  const ventaIdNum = parseInt(saleId, 10);
  if (!Number.isInteger(ventaIdNum) || ventaIdNum <= 0) {
    throw new Error("ID de venta inválido");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tablaVenta =
      saleType === "producto" ? "ventas_productos" : "ventas_servicios";

    const ventaResult = await client.query(
      `SELECT 
         v.id,
         v.fecha,
         (v.fecha)::date AS fecha_dia,
         (NOW() AT TIME ZONE 'America/La_Paz')::date AS hoy_dia,
         v.sucursal_id,
         v.caja_id,
         v.empleado_id,
         v.cupon_id,
         v.total,
         v.forma_pago,
         v.detalle_pago,
         v.descripcion_descuento
       FROM ${tablaVenta} v
       WHERE v.id = $1::int
       FOR UPDATE`,
      [ventaIdNum]
    );

    if (ventaResult.rows.length === 0) throw new Error("La venta no existe");

    const venta = ventaResult.rows[0];

    const fechaVentaStr = venta.fecha_dia
      ? new Date(venta.fecha_dia).toISOString().slice(0, 10)
      : null;
    const hoyStr = venta.hoy_dia
      ? new Date(venta.hoy_dia).toISOString().slice(0, 10)
      : null;

    if (!fechaVentaStr || !hoyStr || fechaVentaStr !== hoyStr) {
      throw new Error("Solo se pueden anular ventas realizadas el día de hoy");
    }

    let cuponId = venta.cupon_id || null;
    let montoEfectivoCaja = 0;
    let esAbono = false;

    if (saleType === "producto") {
      const detallesResult = await client.query(
        `SELECT producto_id, cantidad FROM detalle_venta_productos WHERE venta_producto_id = $1::int`,
        [ventaIdNum]
      );

      for (const item of detallesResult.rows) {
        const stockCheck = await client.query(
          `SELECT stock IS NULL AS sin_stock FROM producto_sucursal
           WHERE producto_id = $1::int AND sucursal_id = $2::int FOR UPDATE`,
          [item.producto_id, venta.sucursal_id]
        );

        if (stockCheck.rows.length > 0 && !stockCheck.rows[0].sin_stock) {
          await client.query(
            `UPDATE producto_sucursal SET stock = stock + $1::int
             WHERE producto_id = $2::int AND sucursal_id = $3::int`,
            [item.cantidad, item.producto_id, venta.sucursal_id]
          );
        }
      }

      if (venta.forma_pago === "efectivo") {
        montoEfectivoCaja = parseFloat(venta.total) || 0;
      } else if (venta.forma_pago === "mixto") {
        const m = (venta.detalle_pago || "").match(
          new RegExp(EFECTIVO_REGEX, "i")
        );
        const parsed = m ? parseFloat((m[1] || "0").replace(",", ".")) : 0;
        montoEfectivoCaja =
          parsed > 0 ? parsed : (parseFloat(venta.total) || 0) / 2;
      }

      await client.query(
        `DELETE FROM movimientos_caja WHERE venta_producto_id = $1::int`,
        [ventaIdNum]
      );
      await client.query(`DELETE FROM ventas_productos WHERE id = $1::int`, [
        ventaIdNum,
      ]);
    } else {
      const descripcion = (venta.descripcion_descuento || "").toLowerCase();
      esAbono =
        descripcion.includes("pago de deuda") ||
        descripcion.includes("abono") ||
        (venta.detalle_pago || "").toLowerCase().includes("pago de deuda");

      if (esAbono) {
        const detalleResult = await client.query(
          `SELECT inscripcion_id FROM detalle_venta_servicios WHERE venta_servicio_id = $1::int LIMIT 1`,
          [ventaIdNum]
        );

        if (detalleResult.rows.length === 0) {
          throw new Error("No se encontró la inscripción asociada a este abono");
        }
        const inscripcionId = detalleResult.rows[0].inscripcion_id;

        const ventaOriginalResult = await client.query(
          `SELECT vs.id as venta_original_id, pp.id as pago_pendiente_id
           FROM ventas_servicios vs
           INNER JOIN detalle_venta_servicios dvs ON vs.id = dvs.venta_servicio_id
           INNER JOIN pagos_pendientes pp ON pp.venta_servicio_id = vs.id
           WHERE dvs.inscripcion_id = $1::int AND vs.id != $2::int
           LIMIT 1`,
          [inscripcionId, ventaIdNum]
        );

        if (ventaOriginalResult.rows.length > 0) {
          const pagoPendienteId = ventaOriginalResult.rows[0].pago_pendiente_id;
          const montoAbono = parseFloat(venta.total) || 0;

          await client.query(
            `UPDATE pagos_pendientes
             SET monto_pagado = monto_pagado - $1,
                 monto_pendiente = monto_pendiente + $1,
                 estado = 'pendiente',
                 fecha_ultima_actualizacion = TIMEZONE('America/La_Paz', NOW())
             WHERE id = $2::int`,
            [montoAbono, pagoPendienteId]
          );
        }

        if (venta.forma_pago === "efectivo") {
          montoEfectivoCaja = parseFloat(venta.total) || 0;
        } else if (venta.forma_pago === "mixto") {
          const m = (venta.detalle_pago || "").match(
            new RegExp(EFECTIVO_REGEX, "i")
          );
          const parsed = m ? parseFloat((m[1] || "0").replace(",", ".")) : 0;
          montoEfectivoCaja =
            parsed > 0 ? parsed : (parseFloat(venta.total) || 0) / 2;
        }

        await client.query(
          `DELETE FROM movimientos_caja WHERE venta_servicio_id = $1::int`,
          [ventaIdNum]
        );
        await client.query(`DELETE FROM ventas_servicios WHERE id = $1::int`, [
          ventaIdNum,
        ]);
      } else {
        const detallesResult = await client.query(
          `SELECT inscripcion_id FROM detalle_venta_servicios WHERE venta_servicio_id = $1::int`,
          [ventaIdNum]
        );
        const inscripcionIds = detallesResult.rows
          .map((r) => r.inscripcion_id)
          .filter((id) => id != null);

        if (inscripcionIds.length > 0) {
          const ventasAsociadasResult = await client.query(
            `SELECT DISTINCT venta_servicio_id FROM detalle_venta_servicios WHERE inscripcion_id = ANY($1::int[])`,
            [inscripcionIds]
          );
          const ventasAsociadasIds = ventasAsociadasResult.rows.map(
            (r) => r.venta_servicio_id
          );

          await client.query(
            `DELETE FROM pagos_pendientes WHERE venta_servicio_id = ANY($1::int[])`,
            [ventasAsociadasIds]
          );
          await client.query(
            `DELETE FROM movimientos_caja WHERE venta_servicio_id = ANY($1::int[])`,
            [ventasAsociadasIds]
          );
          await client.query(
            `DELETE FROM detalle_venta_servicios WHERE inscripcion_id = ANY($1::int[])`,
            [inscripcionIds]
          );
          await client.query(
            `DELETE FROM ventas_servicios WHERE id = ANY($1::int[])`,
            [ventasAsociadasIds]
          );
          await client.query(
            `UPDATE registros_acceso SET inscripcion_id = NULL WHERE inscripcion_id = ANY($1::int[])`,
            [inscripcionIds]
          );
          await client.query(
            `DELETE FROM inscripciones WHERE id = ANY($1::int[])`,
            [inscripcionIds]
          );
        }

        if (venta.forma_pago === "efectivo") {
          montoEfectivoCaja = parseFloat(venta.total) || 0;
        } else if (venta.forma_pago === "mixto") {
          const m = (venta.detalle_pago || "").match(
            new RegExp(EFECTIVO_REGEX, "i")
          );
          const parsed = m ? parseFloat((m[1] || "0").replace(",", ".")) : 0;
          montoEfectivoCaja =
            parsed > 0 ? parsed : (parseFloat(venta.total) || 0) / 2;
        }
      }
    }

    if (cuponId) {
      await client.query(
        `UPDATE cupones SET usos = GREATEST(usos - 1, 0) WHERE id = $1::int`,
        [cuponId]
      );
    }

    if (montoEfectivoCaja > 0) {
      const cajaResult = await client.query(
        `SELECT estado_caja, COALESCE(total, 0) AS total_actual FROM cajas WHERE id = $1::int FOR UPDATE`,
        [venta.caja_id]
      );

      if (cajaResult.rows.length === 0) {
        throw new Error("Caja asociada a la venta no encontrada");
      }

      const caja = cajaResult.rows[0];
      const totalActual = parseFloat(caja.total_actual) || 0;
      const nuevoTotal = Math.max(0, totalActual - montoEfectivoCaja);

      await client.query(`UPDATE cajas SET total = $1 WHERE id = $2::int`, [
        nuevoTotal,
        venta.caja_id,
      ]);

      const descripcionEgreso = esAbono
        ? `Anulación de abono #${ventaIdNum} - reverso efectivo`
        : `Anulación venta #${ventaIdNum} (${saleType}) - reverso efectivo`;

      const egresoResult = await client.query(
        `INSERT INTO movimientos_caja
          (caja_id, usuario_id, monto, tipo, descripcion,
           monto_anterior, monto_actual, venta_servicio_id, venta_producto_id, fecha)
         VALUES ($1::int, $2::int, $3, 'egreso', $4, $5, $6, NULL, NULL,
                 TIMEZONE('America/La_Paz', NOW()))
         RETURNING id, fecha`,
        [
          venta.caja_id,
          usuarioId,
          montoEfectivoCaja,
          descripcionEgreso,
          totalActual,
          nuevoTotal,
        ]
      );

      const egresoId = egresoResult.rows[0].id;
      const egresoFecha = egresoResult.rows[0].fecha;

      const posterioresResult = await client.query(
        `SELECT id, monto, tipo FROM movimientos_caja
         WHERE caja_id = $1::int AND (fecha > $2 OR (fecha = $2 AND id > $3::int))
         ORDER BY fecha ASC, id ASC`,
        [venta.caja_id, egresoFecha, egresoId]
      );

      let runningTotal = nuevoTotal;

      for (const mov of posterioresResult.rows) {
        const montoMov = parseFloat(mov.monto) || 0;
        const anterior = runningTotal;
        let actual = runningTotal;

        if (mov.tipo === "ingreso") actual = anterior + montoMov;
        else if (mov.tipo === "egreso")
          actual = Math.max(0, anterior - montoMov);
        else if (mov.tipo === "apertura") actual = montoMov;
        else if (mov.tipo === "cierre") actual = anterior;

        await client.query(
          `UPDATE movimientos_caja SET monto_anterior = $1, monto_actual = $2 WHERE id = $3::int`,
          [anterior, actual, mov.id]
        );

        runningTotal = actual;
      }
    }

    await client.query("COMMIT");

    return {
      success: true,
      message: esAbono
        ? `Abono #${ventaIdNum} anulado. La deuda original ha sido restaurada.`
        : saleType === "producto"
        ? `Venta de productos #${ventaIdNum} anulada. Stock revertido.`
        : `Venta de servicios #${ventaIdNum} anulada. Inscripciones y abonos asociados eliminados.`,
      ventaId: ventaIdNum,
      tipo: saleType,
      esAbono,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error in anularVenta service:", error);
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// ANULAR PAGO PENDIENTE
// ============================================
const anularPagoPendiente = async (pagoId, actor) => {
  const { usuarioId, rol } = actor || {};

  if (normalizeRol(rol) !== "admin") {
    const err = new Error("Solo un administrador puede anular pagos");
    err.statusCode = 403;
    throw err;
  }

  const pagoIdNum = parseInt(pagoId, 10);
  if (!Number.isInteger(pagoIdNum) || pagoIdNum <= 0) {
    throw new Error("ID de pago inválido");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const pagoResult = await client.query(
      `SELECT pp.*, vs.caja_id, vs.sucursal_id, vs.forma_pago, vs.detalle_pago
       FROM pagos_pendientes pp
       INNER JOIN ventas_servicios vs ON pp.venta_servicio_id = vs.id
       WHERE pp.id = $1::int
       FOR UPDATE`,
      [pagoIdNum]
    );

    if (pagoResult.rows.length === 0) {
      throw new Error("El pago pendiente no existe");
    }

    await client.query(`DELETE FROM pagos_pendientes WHERE id = $1::int`, [
      pagoIdNum,
    ]);

    await client.query("COMMIT");

    return {
      success: true,
      message: `Pago pendiente #${pagoIdNum} anulado correctamente.`,
      pagoId: pagoIdNum,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error in anularPagoPendiente service:", error);
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  getSales,
  getTotals,
  getResumen,
  getSaleDetails,
  getSucursales,
  getEmpleados,
  anularVenta,
  anularPagoPendiente,
};