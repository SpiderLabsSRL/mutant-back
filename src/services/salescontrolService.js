// backend/services/salescontrolService.js
const { query, pool } = require("../../db");

// ============================================
// HELPERS
// ============================================
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

  return {
    ...filters,
    sucursal: forzado ? forzado : filters.sucursal,
  };
}

const buildDateFilters = async (
  whereConditions,
  params,
  paramCount,
  tableAlias,
  filters,
  hoyLaPaz
) => {
  let newParamCount = paramCount;
  const col = LA_PAZ_DATE(tableAlias);

  if (filters.dateFilterType === "specific" && filters.specificDate) {
    whereConditions.push(`${col} = $${newParamCount}`);
    params.push(filters.specificDate);
    newParamCount++;
  } else if (
    filters.dateFilterType === "range" &&
    filters.startDate &&
    filters.endDate
  ) {
    whereConditions.push(
      `${col} BETWEEN $${newParamCount} AND $${newParamCount + 1}`
    );
    params.push(filters.startDate, filters.endDate);
    newParamCount += 2;
  } else if (filters.dateFilterType === "today") {
    whereConditions.push(`${col} = $${newParamCount}`);
    params.push(hoyLaPaz);
    newParamCount++;
  } else if (filters.dateFilterType === "yesterday") {
    const ayerResult = await query(
      "SELECT ($1::date - INTERVAL '1 day')::date as ayer",
      [hoyLaPaz]
    );
    const ayerLaPaz = ayerResult.rows[0].ayer;
    whereConditions.push(`${col} = $${newParamCount}`);
    params.push(ayerLaPaz);
    newParamCount++;
  } else if (filters.dateFilterType === "thisWeek") {
    const thisWeekResult = await query(
      `SELECT 
        date_trunc('week', $1::date)::date as inicio_semana,
        (date_trunc('week', $1::date) + INTERVAL '6 days')::date as fin_semana`,
      [hoyLaPaz]
    );
    const { inicio_semana, fin_semana } = thisWeekResult.rows[0];
    whereConditions.push(`${col} >= $${newParamCount}`);
    params.push(inicio_semana);
    newParamCount++;
    whereConditions.push(`${col} <= $${newParamCount}`);
    params.push(fin_semana);
    newParamCount++;
  } else if (filters.dateFilterType === "lastWeek") {
    const lastWeekResult = await query(
      `SELECT 
        (date_trunc('week', $1::date) - INTERVAL '7 days')::date as inicio_semana_pasada,
        (date_trunc('week', $1::date) - INTERVAL '1 day')::date as fin_semana_pasada`,
      [hoyLaPaz]
    );
    const { inicio_semana_pasada, fin_semana_pasada } =
      lastWeekResult.rows[0];
    whereConditions.push(`${col} >= $${newParamCount}`);
    params.push(inicio_semana_pasada);
    newParamCount++;
    whereConditions.push(`${col} <= $${newParamCount}`);
    params.push(fin_semana_pasada);
    newParamCount++;
  } else if (filters.dateFilterType === "thisMonth") {
    const thisMonthResult = await query(
      `SELECT 
        date_trunc('month', $1::date)::date as inicio_mes,
        (date_trunc('month', $1::date) + INTERVAL '1 month - 1 day')::date as fin_mes`,
      [hoyLaPaz]
    );
    const { inicio_mes, fin_mes } = thisMonthResult.rows[0];
    whereConditions.push(`${col} >= $${newParamCount}`);
    params.push(inicio_mes);
    newParamCount++;
    whereConditions.push(`${col} <= $${newParamCount}`);
    params.push(fin_mes);
    newParamCount++;
  } else if (filters.dateFilterType === "lastMonth") {
    const lastMonthResult = await query(
      `SELECT 
        date_trunc('month', $1::date - INTERVAL '1 month')::date as inicio_mes_pasado,
        (date_trunc('month', $1::date) - INTERVAL '1 day')::date as fin_mes_pasado`,
      [hoyLaPaz]
    );
    const { inicio_mes_pasado, fin_mes_pasado } = lastMonthResult.rows[0];
    whereConditions.push(`${col} >= $${newParamCount}`);
    params.push(inicio_mes_pasado);
    newParamCount++;
    whereConditions.push(`${col} <= $${newParamCount}`);
    params.push(fin_mes_pasado);
    newParamCount++;
  }

  return newParamCount;
};

async function applyEmpleadoFilter(
  whereConditions,
  params,
  paramCount,
  columnExpr,
  empleadoIdFilter
) {
  if (!empleadoIdFilter) return paramCount;

  const usuarioResult = await query(
    "SELECT empleado_id FROM usuarios WHERE id = $1",
    [empleadoIdFilter]
  );

  if (usuarioResult.rows.length === 0) return paramCount;

  const empleadoIdReal = usuarioResult.rows[0].empleado_id;
  if (!empleadoIdReal) return paramCount;

  whereConditions.push(`${columnExpr} = $${paramCount}`);
  params.push(empleadoIdReal);
  return paramCount + 1;
}

// ============================================
// GET SALES
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

    const todayResult = await query(
      "SELECT (NOW() AT TIME ZONE 'America/La_Paz')::date as hoy_la_paz"
    );
    const hoyLaPaz = todayResult.rows[0].hoy_la_paz;

    const offset = (page - 1) * pageSize;

    let whereConditionsProductos = [];
    let paramsProductos = [];
    let paramCountProductos = 1;

    let whereConditionsServicios = [];
    let paramsServicios = [];
    let paramCountServicios = 1;

    const baseConditionProductos = "vp.subtotal > 0";
    const baseConditionServicios = "vs.subtotal > 0";

    if (effectiveFilters.sucursal) {
      whereConditionsProductos.push(`vp.sucursal_id = $${paramCountProductos}`);
      paramsProductos.push(effectiveFilters.sucursal);
      paramCountProductos++;

      whereConditionsServicios.push(`vs.sucursal_id = $${paramCountServicios}`);
      paramsServicios.push(effectiveFilters.sucursal);
      paramCountServicios++;
    }

    if (effectiveFilters.empleadoId) {
      paramCountProductos = await applyEmpleadoFilter(
        whereConditionsProductos,
        paramsProductos,
        paramCountProductos,
        "vp.empleado_id",
        effectiveFilters.empleadoId
      );
      paramCountServicios = await applyEmpleadoFilter(
        whereConditionsServicios,
        paramsServicios,
        paramCountServicios,
        "vs.empleado_id",
        effectiveFilters.empleadoId
      );
    }

    paramCountProductos = await buildDateFilters(
      whereConditionsProductos,
      paramsProductos,
      paramCountProductos,
      "vp",
      effectiveFilters,
      hoyLaPaz
    );

    paramCountServicios = await buildDateFilters(
      whereConditionsServicios,
      paramsServicios,
      paramCountServicios,
      "vs",
      effectiveFilters,
      hoyLaPaz
    );

    const whereClauseProductos =
      whereConditionsProductos.length > 0
        ? `WHERE ${baseConditionProductos} AND ${whereConditionsProductos.join(" AND ")}`
        : `WHERE ${baseConditionProductos}`;

    const whereClauseServicios =
      whereConditionsServicios.length > 0
        ? `WHERE ${baseConditionServicios} AND ${whereConditionsServicios.join(" AND ")}`
        : `WHERE ${baseConditionServicios}`;

    const countQueryProductos = `
      SELECT COUNT(DISTINCT vp.id) as total_count 
      FROM ventas_productos vp
      ${whereClauseProductos}
    `;

    const countQueryServicios = `
      SELECT COUNT(DISTINCT vs.id) as total_count 
      FROM ventas_servicios vs
      ${whereClauseServicios}
    `;

    let queryStrProductos = `
      SELECT 
        vp.id,
        TO_CHAR(vp.fecha, 'DD/MM/YYYY, HH24:MI:SS') as fecha,
        NULL as cliente,
        CONCAT(p_emp.nombres, ' ', p_emp.apellidos) as empleado,
        s.nombre as sucursal,
        'producto' as tipo,
        STRING_AGG(CONCAT(dp.cantidad, 'x ', pro.nombre), ', ') as detalle,
        (
          SELECT json_agg(
            json_build_object(
              'nombre', pro2.nombre,
              'cantidad', dp2.cantidad,
              'precio_unitario', dp2.precio_unitario::float,
              'subtotal', dp2.subtotal::float
            )
            ORDER BY dp2.id
          )
          FROM detalle_venta_productos dp2
          INNER JOIN productos pro2 ON dp2.producto_id = pro2.id
          WHERE dp2.venta_producto_id = vp.id
        ) as items,
        vp.subtotal::text,
        vp.descuento::text,
        vp.total::text,
        vp.forma_pago as "formaPago",
        vp.detalle_pago as "detalle_pago",
        CASE 
          WHEN vp.forma_pago = 'efectivo' THEN vp.total
          WHEN vp.forma_pago = 'qr' THEN 0
          WHEN vp.forma_pago = 'mixto' THEN
            COALESCE(
              NULLIF(
                REPLACE(
                  (regexp_match(vp.detalle_pago, '${EFECTIVO_REGEX}', 'i'))[1],
                  ',', '.'
                )::numeric,
                0
              ),
              vp.total / 2
            )
          ELSE 0 
        END as efectivo,
        CASE 
          WHEN vp.forma_pago = 'qr' THEN vp.total
          WHEN vp.forma_pago = 'efectivo' THEN 0
          WHEN vp.forma_pago = 'mixto' THEN
            COALESCE(
              NULLIF(
                REPLACE(
                  (regexp_match(vp.detalle_pago, '${QR_REGEX}', 'i'))[1],
                  ',', '.'
                )::numeric,
                0
              ),
              vp.total / 2
            )
          ELSE 0 
        END as qr,
        vp.descripcion_descuento as "descripcionDescuento",
        vp.descripcion_descuento as "justificacionDescuento"
      FROM ventas_productos vp
      INNER JOIN empleados e ON vp.empleado_id = e.id
      INNER JOIN personas p_emp ON e.persona_id = p_emp.id
      INNER JOIN sucursales s ON vp.sucursal_id = s.id
      INNER JOIN detalle_venta_productos dp ON vp.id = dp.venta_producto_id
      INNER JOIN productos pro ON dp.producto_id = pro.id
      ${whereClauseProductos}
      GROUP BY vp.id, vp.fecha, p_emp.nombres, p_emp.apellidos, s.nombre, 
               vp.forma_pago, vp.detalle_pago, vp.descripcion_descuento, vp.total
      ORDER BY vp.fecha DESC
      LIMIT $${paramCountProductos} OFFSET $${paramCountProductos + 1}
    `;

    let queryStrServicios = `
      SELECT 
        vs.id,
        TO_CHAR(vs.fecha, 'DD/MM/YYYY, HH24:MI:SS') as fecha,
        (
          SELECT STRING_AGG(DISTINCT CONCAT(p_cli2.nombres, ' ', p_cli2.apellidos), ', ')
          FROM detalle_venta_servicios dvs2
          INNER JOIN inscripciones ins2 ON dvs2.inscripcion_id = ins2.id
          INNER JOIN personas p_cli2 ON ins2.persona_id = p_cli2.id
          WHERE dvs2.venta_servicio_id = vs.id
        ) as cliente,
        CONCAT(p_emp.nombres, ' ', p_emp.apellidos) as empleado,
        s.nombre as sucursal,
        'servicio' as tipo,
        (
          SELECT STRING_AGG(servicio_detalle, ', ')
          FROM (
            SELECT DISTINCT
              CONCAT(ser2.nombre, ' (', dvs2.precio::text, ' Bs.)') as servicio_detalle
            FROM detalle_venta_servicios dvs2
            INNER JOIN inscripciones ins2 ON dvs2.inscripcion_id = ins2.id
            INNER JOIN servicios ser2 ON ins2.servicio_id = ser2.id
            WHERE dvs2.venta_servicio_id = vs.id
          ) sub
        ) as detalle,
        (
          SELECT json_agg(
            json_build_object(
              'nombre', ser2.nombre,
              'cantidad', 1,
              'precio_unitario', dvs2.precio::float,
              'subtotal', dvs2.precio::float
            )
            ORDER BY dvs2.id
          )
          FROM detalle_venta_servicios dvs2
          INNER JOIN inscripciones ins2 ON dvs2.inscripcion_id = ins2.id
          INNER JOIN servicios ser2 ON ins2.servicio_id = ser2.id
          WHERE dvs2.venta_servicio_id = vs.id
        ) as items,
        vs.subtotal::text,
        vs.descuento::text,
        vs.total::text,
        vs.forma_pago as "formaPago",
        vs.detalle_pago as "detalle_pago",
        CASE 
          WHEN vs.forma_pago = 'efectivo' THEN vs.total
          WHEN vs.forma_pago = 'qr' THEN 0
          WHEN vs.forma_pago = 'mixto' THEN
            COALESCE(
              NULLIF(
                REPLACE(
                  (regexp_match(vs.detalle_pago, '${EFECTIVO_REGEX}', 'i'))[1],
                  ',', '.'
                )::numeric,
                0
              ),
              vs.total / 2
            )
          ELSE 0 
        END as efectivo,
        CASE 
          WHEN vs.forma_pago = 'qr' THEN vs.total
          WHEN vs.forma_pago = 'efectivo' THEN 0
          WHEN vs.forma_pago = 'mixto' THEN
            COALESCE(
              NULLIF(
                REPLACE(
                  (regexp_match(vs.detalle_pago, '${QR_REGEX}', 'i'))[1],
                  ',', '.'
                )::numeric,
                0
              ),
              vs.total / 2
            )
          ELSE 0 
        END as qr,
        vs.descripcion_descuento as "descripcionDescuento",
        vs.descripcion_descuento as "justificacionDescuento"
      FROM ventas_servicios vs
      INNER JOIN empleados e ON vs.empleado_id = e.id
      INNER JOIN personas p_emp ON e.persona_id = p_emp.id
      INNER JOIN sucursales s ON vs.sucursal_id = s.id
      ${whereClauseServicios}
      ORDER BY vs.fecha DESC
      LIMIT $${paramCountServicios} OFFSET $${paramCountServicios + 1}
    `;

    const paramsProductosPaginados = [...paramsProductos, pageSize, offset];
    const paramsServiciosPaginados = [...paramsServicios, pageSize, offset];

    const [
      countProductosResult,
      countServiciosResult,
      productSalesResult,
      serviceSalesResult,
    ] = await Promise.all([
      query(countQueryProductos, paramsProductos),
      query(countQueryServicios, paramsServicios),
      query(queryStrProductos, paramsProductosPaginados),
      query(queryStrServicios, paramsServiciosPaginados),
    ]);

    const totalProductos = parseInt(
      countProductosResult.rows[0]?.total_count || 0
    );
    const totalServicios = parseInt(
      countServiciosResult.rows[0]?.total_count || 0
    );
    const totalCount = totalProductos + totalServicios;

    let allSales = [...productSalesResult.rows, ...serviceSalesResult.rows];

    function parseDateFromString(dateStr) {
      try {
        const parts = dateStr.split(", ");
        const datePart = parts[0];
        const timePart = parts[1];
        const [day, month, year] = datePart.split("/");
        const [hours, minutes, seconds] = timePart.split(":");
        return new Date(
          parseInt(year),
          parseInt(month) - 1,
          parseInt(day),
          parseInt(hours),
          parseInt(minutes),
          parseInt(seconds)
        );
      } catch (e) {
        return new Date();
      }
    }

    allSales.sort((a, b) => {
      const dateA = parseDateFromString(a.fecha);
      const dateB = parseDateFromString(b.fecha);
      return dateB - dateA;
    });

    return {
      sales: allSales.map((sale) => ({
        ...sale,
        id: sale.id.toString(),
        fecha: sale.fecha,
        subtotal: parseFloat(sale.subtotal) || 0,
        descuento: parseFloat(sale.descuento) || 0,
        total: parseFloat(sale.total) || 0,
        efectivo: sale.efectivo ? parseFloat(sale.efectivo) : 0,
        qr: sale.qr ? parseFloat(sale.qr) : 0,
        items: sale.items || [],
      })),
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
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

    const todayResult = await query(
      "SELECT (NOW() AT TIME ZONE 'America/La_Paz')::date as hoy_la_paz"
    );
    const hoyLaPaz = todayResult.rows[0].hoy_la_paz;

    let whereConditionsProductos = [];
    let paramsProductos = [];
    let paramCountProductos = 1;

    let whereConditionsServicios = [];
    let paramsServicios = [];
    let paramCountServicios = 1;

    const baseConditionProductos = "vp.subtotal > 0";
    const baseConditionServicios = "vs.subtotal > 0";

    if (effectiveFilters.sucursal) {
      whereConditionsProductos.push(`vp.sucursal_id = $${paramCountProductos}`);
      paramsProductos.push(effectiveFilters.sucursal);
      paramCountProductos++;

      whereConditionsServicios.push(`vs.sucursal_id = $${paramCountServicios}`);
      paramsServicios.push(effectiveFilters.sucursal);
      paramCountServicios++;
    }

    if (effectiveFilters.empleadoId) {
      paramCountProductos = await applyEmpleadoFilter(
        whereConditionsProductos,
        paramsProductos,
        paramCountProductos,
        "vp.empleado_id",
        effectiveFilters.empleadoId
      );
      paramCountServicios = await applyEmpleadoFilter(
        whereConditionsServicios,
        paramsServicios,
        paramCountServicios,
        "vs.empleado_id",
        effectiveFilters.empleadoId
      );
    }

    paramCountProductos = await buildDateFilters(
      whereConditionsProductos,
      paramsProductos,
      paramCountProductos,
      "vp",
      effectiveFilters,
      hoyLaPaz
    );

    paramCountServicios = await buildDateFilters(
      whereConditionsServicios,
      paramsServicios,
      paramCountServicios,
      "vs",
      effectiveFilters,
      hoyLaPaz
    );

    const whereClauseProductos =
      whereConditionsProductos.length > 0
        ? `WHERE ${baseConditionProductos} AND ${whereConditionsProductos.join(" AND ")}`
        : `WHERE ${baseConditionProductos}`;

    const whereClauseServicios =
      whereConditionsServicios.length > 0
        ? `WHERE ${baseConditionServicios} AND ${whereConditionsServicios.join(" AND ")}`
        : `WHERE ${baseConditionServicios}`;

    const totalsQueryProductos = `
      SELECT 
        COALESCE(SUM(vp.total), 0) as total_productos,
        COALESCE(SUM(
          CASE 
            WHEN vp.forma_pago = 'efectivo' THEN vp.total
            WHEN vp.forma_pago = 'qr' THEN 0
            WHEN vp.forma_pago = 'mixto' THEN
              COALESCE(
                NULLIF(
                  REPLACE(
                    (regexp_match(vp.detalle_pago, '${EFECTIVO_REGEX}', 'i'))[1],
                    ',', '.'
                  )::numeric,
                  0
                ),
                vp.total / 2
              )
            ELSE 0 
          END
        ), 0) as efectivo_productos,
        COALESCE(SUM(
          CASE 
            WHEN vp.forma_pago = 'qr' THEN vp.total
            WHEN vp.forma_pago = 'efectivo' THEN 0
            WHEN vp.forma_pago = 'mixto' THEN
              COALESCE(
                NULLIF(
                  REPLACE(
                    (regexp_match(vp.detalle_pago, '${QR_REGEX}', 'i'))[1],
                    ',', '.'
                  )::numeric,
                  0
                ),
                vp.total / 2
              )
            ELSE 0 
          END
        ), 0) as qr_productos
      FROM ventas_productos vp
      ${whereClauseProductos}
    `;

    const totalsQueryServicios = `
      SELECT 
        COALESCE(SUM(vs.total), 0) as total_servicios,
        COALESCE(SUM(
          CASE 
            WHEN vs.forma_pago = 'efectivo' THEN vs.total
            WHEN vs.forma_pago = 'qr' THEN 0
            WHEN vs.forma_pago = 'mixto' THEN
              COALESCE(
                NULLIF(
                  REPLACE(
                    (regexp_match(vs.detalle_pago, '${EFECTIVO_REGEX}', 'i'))[1],
                    ',', '.'
                  )::numeric,
                  0
                ),
                vs.total / 2
              )
            ELSE 0 
          END
        ), 0) as efectivo_servicios,
        COALESCE(SUM(
          CASE 
            WHEN vs.forma_pago = 'qr' THEN vs.total
            WHEN vs.forma_pago = 'efectivo' THEN 0
            WHEN vs.forma_pago = 'mixto' THEN
              COALESCE(
                NULLIF(
                  REPLACE(
                    (regexp_match(vs.detalle_pago, '${QR_REGEX}', 'i'))[1],
                    ',', '.'
                  )::numeric,
                  0
                ),
                vs.total / 2
              )
            ELSE 0 
          END
        ), 0) as qr_servicios
      FROM ventas_servicios vs
      ${whereClauseServicios}
    `;

    const [totalesProductosResult, totalesServiciosResult] = await Promise.all([
      query(totalsQueryProductos, paramsProductos),
      query(totalsQueryServicios, paramsServicios),
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

    const totalGeneral = totalProductos + totalServicios;
    const efectivoGeneral = efectivoProductos + efectivoServicios;
    const qrGeneral = qrProductos + qrServicios;

    return {
      totalGeneral,
      efectivoGeneral,
      qrGeneral,
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
         WHERE vp.id = $1`,
        [saleId]
      );

      if (saleResult.rows.length === 0) {
        throw new Error("Venta no encontrada");
      }

      const sale = saleResult.rows[0];

      const detailsResult = await query(
        `SELECT 
          dp.*,
          p.nombre,
          p.precio_venta as precio_unitario,
          (dp.cantidad * dp.precio_unitario) as subtotal
         FROM detalle_venta_productos dp
         INNER JOIN productos p ON dp.producto_id = p.id
         WHERE dp.venta_producto_id = $1`,
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
         WHERE vs.id = $1`,
        [saleId]
      );

      if (saleResult.rows.length === 0) {
        throw new Error("Venta no encontrada");
      }

      const sale = saleResult.rows[0];

      const detailsResult = await query(
        `SELECT 
          dvs.*,
          ser.nombre,
          ins.fecha_inicio,
          ins.fecha_vencimiento,
          ser.precio,
          (SELECT COUNT(*) FROM detalle_venta_servicios WHERE venta_servicio_id = $1) as cantidad
         FROM detalle_venta_servicios dvs
         INNER JOIN inscripciones ins ON dvs.inscripcion_id = ins.id
         INNER JOIN servicios ser ON ins.servicio_id = ser.id
         WHERE dvs.venta_servicio_id = $1`,
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
// ✅ ANULAR VENTA (SOLO ADMIN, SOLO HOY)
// ============================================
const anularVenta = async (saleId, saleType, actor) => {
  const { usuarioId, rol } = actor || {};

  // ---------- Validaciones de entrada / permisos ----------
  if (!saleId) {
    throw new Error("ID de venta requerido");
  }
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

    // ---------- Verificar venta existe y es de HOY ----------
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
       WHERE v.id = $1
       FOR UPDATE`,
      [ventaIdNum]
    );

    if (ventaResult.rows.length === 0) {
      throw new Error("La venta no existe");
    }

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

    // ---------- Anular según tipo ----------
    let cuponId = venta.cupon_id || null;
    let montoEfectivoCaja = 0;
    let esAbono = false;

    if (saleType === "producto") {
      // ====== PRODUCTOS ======

      const detallesResult = await client.query(
        `SELECT producto_id, cantidad
         FROM detalle_venta_productos
         WHERE venta_producto_id = $1`,
        [ventaIdNum]
      );

      for (const item of detallesResult.rows) {
        const stockCheck = await client.query(
          `SELECT stock IS NULL AS sin_stock
           FROM producto_sucursal
           WHERE producto_id = $1 AND sucursal_id = $2
           FOR UPDATE`,
          [item.producto_id, venta.sucursal_id]
        );

        if (stockCheck.rows.length > 0 && !stockCheck.rows[0].sin_stock) {
          await client.query(
            `UPDATE producto_sucursal
             SET stock = stock + $1
             WHERE producto_id = $2 AND sucursal_id = $3`,
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
        `DELETE FROM movimientos_caja
         WHERE venta_producto_id = $1`,
        [ventaIdNum]
      );

      await client.query(
        `DELETE FROM ventas_productos WHERE id = $1`,
        [ventaIdNum]
      );
    } else {
      // ====== SERVICIOS ======

      // 🔍 DETECTAR SI ES UN ABONO
      // En registrarPago se guarda descripcion_descuento = 'Pago de deuda pendiente'
      const descripcion = (venta.descripcion_descuento || "").toLowerCase();
      esAbono =
        descripcion.includes("pago de deuda") ||
        descripcion.includes("abono") ||
        (venta.detalle_pago || "").toLowerCase().includes("pago de deuda");

      if (esAbono) {
        // ============================================
        // CASO A: ANULAR UN ABONO (SOLO EL PAGO)
        // ============================================

        // 1. Obtener la inscripción asociada
        const detalleResult = await client.query(
          `SELECT inscripcion_id FROM detalle_venta_servicios 
           WHERE venta_servicio_id = $1 LIMIT 1`,
          [ventaIdNum]
        );

        if (detalleResult.rows.length === 0) {
          throw new Error("No se encontró la inscripción asociada a este abono");
        }
        const inscripcionId = detalleResult.rows[0].inscripcion_id;

        // 2. Buscar la venta original (que tiene el pago pendiente)
        const ventaOriginalResult = await client.query(
          `SELECT vs.id as venta_original_id, pp.id as pago_pendiente_id
           FROM ventas_servicios vs
           INNER JOIN detalle_venta_servicios dvs ON vs.id = dvs.venta_servicio_id
           INNER JOIN pagos_pendientes pp ON pp.venta_servicio_id = vs.id
           WHERE dvs.inscripcion_id = $1
             AND vs.id != $2
           LIMIT 1`,
          [inscripcionId, ventaIdNum]
        );

        if (ventaOriginalResult.rows.length > 0) {
          const pagoPendienteId = ventaOriginalResult.rows[0].pago_pendiente_id;
          const montoAbono = parseFloat(venta.total) || 0;

          // 3. Devolver el monto del abono a la deuda original
          await client.query(
            `UPDATE pagos_pendientes
             SET monto_pagado = monto_pagado - $1,
                 monto_pendiente = monto_pendiente + $1,
                 estado = 'pendiente',
                 fecha_ultima_actualizacion = TIMEZONE('America/La_Paz', NOW())
             WHERE id = $2`,
            [montoAbono, pagoPendienteId]
          );
        }

        // 4. Calcular monto efectivo a devolver a caja
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

        // 5. Eliminar movimientos_caja y la venta del abono
        await client.query(
          `DELETE FROM movimientos_caja WHERE venta_servicio_id = $1`,
          [ventaIdNum]
        );

        await client.query(
          `DELETE FROM ventas_servicios WHERE id = $1`,
          [ventaIdNum]
        );
      } else {
        // ============================================
        // CASO B: ANULAR LA VENTA ORIGINAL (BORRAR TODO)
        // ============================================

        // 1. Obtener inscripciones asociadas
        const detallesResult = await client.query(
          `SELECT inscripcion_id FROM detalle_venta_servicios 
           WHERE venta_servicio_id = $1`,
          [ventaIdNum]
        );
        const inscripcionIds = detallesResult.rows
          .map((r) => r.inscripcion_id)
          .filter((id) => id != null);

        if (inscripcionIds.length > 0) {
          // 2. Buscar TODAS las ventas asociadas (abonos + original)
          const ventasAsociadasResult = await client.query(
            `SELECT DISTINCT venta_servicio_id 
             FROM detalle_venta_servicios 
             WHERE inscripcion_id = ANY($1::int[])`,
            [inscripcionIds]
          );
          const ventasAsociadasIds = ventasAsociadasResult.rows.map(
            (r) => r.venta_servicio_id
          );

          // 3. Borrar pagos pendientes
          await client.query(
            `DELETE FROM pagos_pendientes WHERE venta_servicio_id = ANY($1::int[])`,
            [ventasAsociadasIds]
          );

          // 4. Borrar movimientos de caja de todas esas ventas
          await client.query(
            `DELETE FROM movimientos_caja WHERE venta_servicio_id = ANY($1::int[])`,
            [ventasAsociadasIds]
          );

          // 5. Borrar detalles de venta
          await client.query(
            `DELETE FROM detalle_venta_servicios WHERE inscripcion_id = ANY($1::int[])`,
            [inscripcionIds]
          );

          // 6. Borrar TODAS las ventas (abonos + original)
          await client.query(
            `DELETE FROM ventas_servicios WHERE id = ANY($1::int[])`,
            [ventasAsociadasIds]
          );

          // 7. Desvincular accesos
          await client.query(
            `UPDATE registros_acceso SET inscripcion_id = NULL WHERE inscripcion_id = ANY($1::int[])`,
            [inscripcionIds]
          );

          // 8. Borrar inscripciones
          await client.query(
            `DELETE FROM inscripciones WHERE id = ANY($1::int[])`,
            [inscripcionIds]
          );
        }

        // 9. Calcular monto efectivo de la venta original
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

    // ---------- Revertir uso de cupón ----------
    if (cuponId) {
      await client.query(
        `UPDATE cupones
         SET usos = GREATEST(usos - 1, 0)
         WHERE id = $1`,
        [cuponId]
      );
    }

    // ---------- Revertir monto en caja ----------
    if (montoEfectivoCaja > 0) {
      const cajaResult = await client.query(
        `SELECT estado_caja, COALESCE(total, 0) AS total_actual
         FROM cajas
         WHERE id = $1
         FOR UPDATE`,
        [venta.caja_id]
      );

      if (cajaResult.rows.length === 0) {
        throw new Error("Caja asociada a la venta no encontrada");
      }

      const caja = cajaResult.rows[0];
      const totalActual = parseFloat(caja.total_actual) || 0;
      const nuevoTotal = Math.max(0, totalActual - montoEfectivoCaja);

      await client.query(
        `UPDATE cajas SET total = $1 WHERE id = $2`,
        [nuevoTotal, venta.caja_id]
      );

      const descripcionEgreso = esAbono
        ? `Anulación de abono #${ventaIdNum} - reverso efectivo`
        : `Anulación venta #${ventaIdNum} (${saleType}) - reverso efectivo`;

      const egresoResult = await client.query(
        `INSERT INTO movimientos_caja
          (caja_id, usuario_id, monto, tipo, descripcion,
           monto_anterior, monto_actual, venta_servicio_id, venta_producto_id, fecha)
         VALUES ($1, $2, $3, 'egreso', $4, $5, $6, NULL, NULL,
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

      // Recalcular cadena de movimientos posteriores
      const posterioresResult = await client.query(
        `SELECT id, monto, tipo
         FROM movimientos_caja
         WHERE caja_id = $1
           AND (
             fecha > $2
             OR (fecha = $2 AND id > $3)
           )
         ORDER BY fecha ASC, id ASC`,
        [venta.caja_id, egresoFecha, egresoId]
      );

      let runningTotal = nuevoTotal;

      for (const mov of posterioresResult.rows) {
        const montoMov = parseFloat(mov.monto) || 0;
        const anterior = runningTotal;
        let actual = runningTotal;

        if (mov.tipo === "ingreso") {
          actual = anterior + montoMov;
        } else if (mov.tipo === "egreso") {
          actual = Math.max(0, anterior - montoMov);
        } else if (mov.tipo === "apertura") {
          actual = montoMov;
        } else if (mov.tipo === "cierre") {
          actual = anterior;
        }

        await client.query(
          `UPDATE movimientos_caja
           SET monto_anterior = $1, monto_actual = $2
           WHERE id = $3`,
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

module.exports = {
  getSales,
  getTotals,
  getSaleDetails,
  getSucursales,
  anularVenta,
};