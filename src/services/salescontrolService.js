// backend/services/salescontrolService.js
const { query } = require("../../db");

// ============================================
// HELPERS
// ============================================

/**
 * Regex flexible para extraer efectivo de detalle_pago
 */
const EFECTIVO_REGEX =
  "(?:efectivo|Efectivo)\\s*[:=]?\\s*(?:Bs\\.?)?\\s*([0-9]+(?:[.,][0-9]+)?)";

/**
 * Regex flexible para extraer QR de detalle_pago
 */
const QR_REGEX =
  "(?:QR|qr|Q\\.R\\.)\\s*[:=]?\\s*(?:Bs\\.?)?\\s*([0-9]+(?:[.,][0-9]+)?)";

/**
 * ✅ Helper para comparar fechas respetando zona horaria La Paz
 */
const LA_PAZ_DATE = (alias) =>
  `(${alias}.fecha AT TIME ZONE 'America/La_Paz')::date`;

// ============================================
// HELPER: Construye filtros de fecha
// ============================================
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
  // "all" → sin filtro de fecha

  return newParamCount;
};

// ============================================
// GET SALES
// ============================================
const getSales = async (filters = {}, page = 1, pageSize = 20) => {
  try {
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

    // Sucursal
    if (filters.sucursal) {
      whereConditionsProductos.push(`vp.sucursal_id = $${paramCountProductos}`);
      paramsProductos.push(filters.sucursal);
      paramCountProductos++;

      whereConditionsServicios.push(`vs.sucursal_id = $${paramCountServicios}`);
      paramsServicios.push(filters.sucursal);
      paramCountServicios++;
    }

    // Empleado
    if (filters.empleadoId) {
      const usuarioResult = await query(
        "SELECT empleado_id FROM usuarios WHERE id = $1",
        [filters.empleadoId]
      );
      if (usuarioResult.rows.length > 0) {
        const empleadoIdReal = usuarioResult.rows[0].empleado_id;
        whereConditionsProductos.push(
          `vp.empleado_id = $${paramCountProductos}`
        );
        paramsProductos.push(empleadoIdReal);
        paramCountProductos++;

        whereConditionsServicios.push(
          `vs.empleado_id = $${paramCountServicios}`
        );
        paramsServicios.push(empleadoIdReal);
        paramCountServicios++;
      }
    }

    // Fechas
    paramCountProductos = await buildDateFilters(
      whereConditionsProductos,
      paramsProductos,
      paramCountProductos,
      "vp",
      filters,
      hoyLaPaz
    );

    paramCountServicios = await buildDateFilters(
      whereConditionsServicios,
      paramsServicios,
      paramCountServicios,
      "vs",
      filters,
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

    // ✅ CORREGIDO: Se agrega subconsulta json_agg para items
    let queryStrProductos = `
      SELECT 
        vp.id,
        TO_CHAR(vp.fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY, HH24:MI:SS') as fecha,
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

    // ✅ CORREGIDO: Se agrega subconsulta json_agg para items
    let queryStrServicios = `
      SELECT 
        vs.id,
        TO_CHAR(vs.fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY, HH24:MI:SS') as fecha,
        CONCAT(p_cli.nombres, ' ', p_cli.apellidos) as cliente,
        CONCAT(p_emp.nombres, ' ', p_emp.apellidos) as empleado,
        s.nombre as sucursal,
        'servicio' as tipo,
        STRING_AGG(CONCAT(ser.nombre, ' (', dvs.precio::text, ' Bs.)'), ', ') as detalle,
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
      INNER JOIN personas p_cli ON vs.persona_id = p_cli.id
      INNER JOIN empleados e ON vs.empleado_id = e.id
      INNER JOIN personas p_emp ON e.persona_id = p_emp.id
      INNER JOIN sucursales s ON vs.sucursal_id = s.id
      INNER JOIN detalle_venta_servicios dvs ON vs.id = dvs.venta_servicio_id
      INNER JOIN inscripciones ins ON dvs.inscripcion_id = ins.id
      INNER JOIN servicios ser ON ins.servicio_id = ser.id
      ${whereClauseServicios}
      GROUP BY vs.id, vs.fecha, p_cli.nombres, p_cli.apellidos, 
               p_emp.nombres, p_emp.apellidos, s.nombre, 
               vs.forma_pago, vs.detalle_pago, vs.descripcion_descuento, vs.total
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
        // ✅ items ya viene como array desde SQL (json_agg) o null
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
const getTotals = async (filters = {}) => {
  try {
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

    if (filters.sucursal) {
      whereConditionsProductos.push(`vp.sucursal_id = $${paramCountProductos}`);
      paramsProductos.push(filters.sucursal);
      paramCountProductos++;

      whereConditionsServicios.push(`vs.sucursal_id = $${paramCountServicios}`);
      paramsServicios.push(filters.sucursal);
      paramCountServicios++;
    }

    if (filters.empleadoId) {
      const usuarioResult = await query(
        "SELECT empleado_id FROM usuarios WHERE id = $1",
        [filters.empleadoId]
      );
      if (usuarioResult.rows.length > 0) {
        const empleadoIdReal = usuarioResult.rows[0].empleado_id;
        whereConditionsProductos.push(
          `vp.empleado_id = $${paramCountProductos}`
        );
        paramsProductos.push(empleadoIdReal);
        paramCountProductos++;

        whereConditionsServicios.push(
          `vs.empleado_id = $${paramCountServicios}`
        );
        paramsServicios.push(empleadoIdReal);
        paramCountServicios++;
      }
    }

    paramCountProductos = await buildDateFilters(
      whereConditionsProductos,
      paramsProductos,
      paramCountProductos,
      "vp",
      filters,
      hoyLaPaz
    );

    paramCountServicios = await buildDateFilters(
      whereConditionsServicios,
      paramsServicios,
      paramCountServicios,
      "vs",
      filters,
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
          TO_CHAR(vp.fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY, HH24:MI:SS') as fecha_formateada,
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
          TO_CHAR(vs.fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY, HH24:MI:SS') as fecha_formateada,
          CONCAT(p_cli.nombres, ' ', p_cli.apellidos) as cliente_nombre,
          CONCAT(p_emp.nombres, ' ', p_emp.apellidos) as empleado_nombre,
          s.nombre as sucursal_nombre,
          u.username as usuario_creador
         FROM ventas_servicios vs
         INNER JOIN personas p_cli ON vs.persona_id = p_cli.id
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

module.exports = {
  getSales,
  getTotals,
  getSaleDetails,
  getSucursales,
};