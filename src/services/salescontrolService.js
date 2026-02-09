// backend/services/salescontrolService.js
const { query } = require("../../db");

const getSales = async (filters = {}, page = 1, pageSize = 20) => {
  try {
    console.log("🔍 Filtros recibidos en sales service:", filters);
    console.log("📄 Paginación:", { page, pageSize });

    // Primero obtener la fecha actual en La Paz
    const todayResult = await query(
      "SELECT (NOW() AT TIME ZONE 'America/La_Paz')::date as hoy_la_paz"
    );
    const hoyLaPaz = todayResult.rows[0].hoy_la_paz;
    console.log(`📅 Fecha actual en La Paz: ${hoyLaPaz}`);

    const offset = (page - 1) * pageSize;

    // Preparar condiciones WHERE para productos
    let whereConditionsProductos = [];
    let paramsProductos = [];
    let paramCountProductos = 1;

    // Preparar condiciones WHERE para servicios
    let whereConditionsServicios = [];
    let paramsServicios = [];
    let paramCountServicios = 1;

    // Condición base para ambas consultas
    const baseConditionProductos = "vp.subtotal > 0";
    const baseConditionServicios = "vs.subtotal > 0";

    // Filtro por sucursal - PRODUCTOS
    if (filters.sucursal && filters.sucursal !== "all") {
      whereConditionsProductos.push(`vp.sucursal_id = $${paramCountProductos}`);
      paramsProductos.push(filters.sucursal);
      paramCountProductos++;
    }

    // Filtro por sucursal - SERVICIOS
    if (filters.sucursal && filters.sucursal !== "all") {
      whereConditionsServicios.push(`vs.sucursal_id = $${paramCountServicios}`);
      paramsServicios.push(filters.sucursal);
      paramCountServicios++;
    }

    // Filtro por empleado (solo para recepcionistas) - PRODUCTOS
    if (filters.empleadoId) {
      console.log(`🔄 Filtro por empleadoId: ${filters.empleadoId}`);

      const usuarioResult = await query(
        "SELECT empleado_id FROM usuarios WHERE id = $1",
        [filters.empleadoId],
      );

      if (usuarioResult.rows.length > 0) {
        const empleadoIdReal = usuarioResult.rows[0].empleado_id;
        console.log(
          `🔍 usuario_id ${filters.empleadoId} → empleado_id ${empleadoIdReal}`,
        );

        whereConditionsProductos.push(
          `vp.empleado_id = $${paramCountProductos}`,
        );
        paramsProductos.push(empleadoIdReal);
        paramCountProductos++;
      }
    }

    // Filtro por empleado (solo para recepcionistas) - SERVICIOS
    if (filters.empleadoId) {
      const usuarioResult = await query(
        "SELECT empleado_id FROM usuarios WHERE id = $1",
        [filters.empleadoId],
      );

      if (usuarioResult.rows.length > 0) {
        const empleadoIdReal = usuarioResult.rows[0].empleado_id;
        whereConditionsServicios.push(
          `vs.empleado_id = $${paramCountServicios}`,
        );
        paramsServicios.push(empleadoIdReal);
        paramCountServicios++;
      }
    }

    // Función para agregar filtros de fecha - SIN CONVERSIONES
    const addDateFilters = async (
      whereConditions,
      params,
      paramCount,
      tableAlias,
    ) => {
      let newParamCount = paramCount;

      if (filters.dateFilterType === "specific" && filters.specificDate) {
        // Usar la fecha específica directamente
        console.log(`📅 [Service] Usando fecha específica: ${filters.specificDate}`);
        whereConditions.push(`DATE(${tableAlias}.fecha) = $${newParamCount}`);
        params.push(filters.specificDate);
        newParamCount++;
      } else if (
        filters.dateFilterType === "range" &&
        filters.startDate &&
        filters.endDate
      ) {
        // Usar el rango de fechas directamente
        console.log(`📅 [Service] Usando rango: ${filters.startDate} - ${filters.endDate}`);
        whereConditions.push(
          `DATE(${tableAlias}.fecha) BETWEEN $${newParamCount} AND $${newParamCount + 1}`,
        );
        params.push(filters.startDate, filters.endDate);
        newParamCount += 2;
      } else if (filters.dateFilterType === "today") {
        // Usar la fecha de hoy en La Paz (calculada al inicio)
        console.log(`📅 [Service] Usando HOY en La Paz: ${hoyLaPaz}`);
        whereConditions.push(`DATE(${tableAlias}.fecha) = $${newParamCount}`);
        params.push(hoyLaPaz);
        newParamCount++;
      } else if (filters.dateFilterType === "yesterday") {
        // Calcular ayer basado en la fecha de hoy en La Paz
        const ayerResult = await query(
          "SELECT ($1::date - INTERVAL '1 day')::date as ayer",
          [hoyLaPaz]
        );
        const ayerLaPaz = ayerResult.rows[0].ayer;
        console.log(`📅 [Service] Usando AYER en La Paz: ${ayerLaPaz}`);
        whereConditions.push(`DATE(${tableAlias}.fecha) = $${newParamCount}`);
        params.push(ayerLaPaz);
        newParamCount++;
      } else if (filters.dateFilterType === "thisWeek") {
        // Esta semana basada en la fecha de hoy en La Paz
        const thisWeekResult = await query(`
          SELECT 
            date_trunc('week', $1::date)::date as inicio_semana,
            (date_trunc('week', $1::date) + INTERVAL '6 days')::date as fin_semana
        `, [hoyLaPaz]);
        
        const { inicio_semana, fin_semana } = thisWeekResult.rows[0];
        console.log(`📅 [Service] Esta semana: ${inicio_semana} - ${fin_semana}`);
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        params.push(inicio_semana);
        newParamCount++;
        
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount}`);
        params.push(fin_semana);
        newParamCount++;
      } else if (filters.dateFilterType === "lastWeek") {
        // Semana pasada basada en la fecha de hoy en La Paz
        const lastWeekResult = await query(`
          SELECT 
            (date_trunc('week', $1::date) - INTERVAL '7 days')::date as inicio_semana_pasada,
            (date_trunc('week', $1::date) - INTERVAL '1 day')::date as fin_semana_pasada
        `, [hoyLaPaz]);
        
        const { inicio_semana_pasada, fin_semana_pasada } = lastWeekResult.rows[0];
        console.log(`📅 [Service] Semana pasada: ${inicio_semana_pasada} - ${fin_semana_pasada}`);
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        params.push(inicio_semana_pasada);
        newParamCount++;
        
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount}`);
        params.push(fin_semana_pasada);
        newParamCount++;
      } else if (filters.dateFilterType === "thisMonth") {
        // Este mes basado en la fecha de hoy en La Paz
        const thisMonthResult = await query(`
          SELECT 
            date_trunc('month', $1::date)::date as inicio_mes,
            (date_trunc('month', $1::date) + INTERVAL '1 month - 1 day')::date as fin_mes
        `, [hoyLaPaz]);
        
        const { inicio_mes, fin_mes } = thisMonthResult.rows[0];
        console.log(`📅 [Service] Este mes: ${inicio_mes} - ${fin_mes}`);
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        params.push(inicio_mes);
        newParamCount++;
        
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount}`);
        params.push(fin_mes);
        newParamCount++;
      } else if (filters.dateFilterType === "lastMonth") {
        // Mes pasado basado en la fecha de hoy en La Paz
        const lastMonthResult = await query(`
          SELECT 
            date_trunc('month', $1::date - INTERVAL '1 month')::date as inicio_mes_pasado,
            (date_trunc('month', $1::date) - INTERVAL '1 day')::date as fin_mes_pasado
        `, [hoyLaPaz]);
        
        const { inicio_mes_pasado, fin_mes_pasado } = lastMonthResult.rows[0];
        console.log(`📅 [Service] Mes pasado: ${inicio_mes_pasado} - ${fin_mes_pasado}`);
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        params.push(inicio_mes_pasado);
        newParamCount++;
        
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount}`);
        params.push(fin_mes_pasado);
        newParamCount++;
      }
      // Para "all" no agregamos filtro de fecha

      return newParamCount;
    };

    // Agregar filtros de fecha - PRODUCTOS
    paramCountProductos = await addDateFilters(
      whereConditionsProductos,
      paramsProductos,
      paramCountProductos,
      "vp",
    );

    // Agregar filtros de fecha - SERVICIOS
    paramCountServicios = await addDateFilters(
      whereConditionsServicios,
      paramsServicios,
      paramCountServicios,
      "vs",
    );

    // Construir WHERE clauses
    const whereClauseProductos =
      whereConditionsProductos.length > 0
        ? `WHERE ${baseConditionProductos} AND ${whereConditionsProductos.join(" AND ")}`
        : `WHERE ${baseConditionProductos}`;

    const whereClauseServicios =
      whereConditionsServicios.length > 0
        ? `WHERE ${baseConditionServicios} AND ${whereConditionsServicios.join(" AND ")}`
        : `WHERE ${baseConditionServicios}`;

    // Query para contar total de productos
    const countQueryProductos = `
      SELECT COUNT(DISTINCT vp.id) as total_count 
      FROM ventas_productos vp
      ${whereClauseProductos}
    `;

    // Query para contar total de servicios
    const countQueryServicios = `
      SELECT COUNT(DISTINCT vs.id) as total_count 
      FROM ventas_servicios vs
      ${whereClauseServicios}
    `;

    // Query para ventas de productos (con paginación)
    let queryStrProductos = `
      SELECT 
        vp.id,
        TO_CHAR(vp.fecha, 'DD/MM/YYYY, HH24:MI:SS') as fecha,
        NULL as cliente,
        CONCAT(p_emp.nombres, ' ', p_emp.apellidos) as empleado,
        s.nombre as sucursal,
        'producto' as tipo,
        STRING_AGG(CONCAT(dp.cantidad, 'x ', pro.nombre), ', ') as detalle,
        vp.subtotal::text,
        vp.descuento::text,
        vp.total::text,
        vp.forma_pago as "formaPago",
        CASE 
          WHEN vp.forma_pago = 'efectivo' THEN vp.total
          WHEN vp.forma_pago = 'mixto' AND vp.detalle_pago IS NOT NULL 
          THEN (
            CASE 
              WHEN vp.detalle_pago::text ~ '^\{.*\}$' 
              THEN COALESCE(
                (vp.detalle_pago::json->>'efectivo')::numeric,
                0
              )
              ELSE 0
            END
          )
          ELSE 0 
        END as efectivo,
        CASE 
          WHEN vp.forma_pago = 'qr' THEN vp.total
          WHEN vp.forma_pago = 'mixto' AND vp.detalle_pago IS NOT NULL
          THEN (
            CASE 
              WHEN vp.detalle_pago::text ~ '^\{.*\}$'
              THEN COALESCE(
                (vp.detalle_pago::json->>'qr')::numeric,
                0
              )
              ELSE 0
            END
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
               vp.forma_pago, vp.detalle_pago, vp.descripcion_descuento
      ORDER BY vp.fecha DESC
      LIMIT $${paramCountProductos} OFFSET $${paramCountProductos + 1}
    `;

    // Query para ventas de servicios (con paginación)
    let queryStrServicios = `
      SELECT 
        vs.id,
        TO_CHAR(vs.fecha, 'DD/MM/YYYY, HH24:MI:SS') as fecha,
        CONCAT(p_cli.nombres, ' ', p_cli.apellidos) as cliente,
        CONCAT(p_emp.nombres, ' ', p_emp.apellidos) as empleado,
        s.nombre as sucursal,
        'servicio' as tipo,
        STRING_AGG(CONCAT(ser.nombre, ' (', dvs.precio::text, ' Bs.)'), ', ') as detalle,
        vs.subtotal::text,
        vs.descuento::text,
        vs.total::text,
        vs.forma_pago as "formaPago",
        CASE 
          WHEN vs.forma_pago = 'efectivo' THEN vs.total
          WHEN vs.forma_pago = 'mixto' AND vs.detalle_pago IS NOT NULL 
          THEN (
            CASE 
              WHEN vs.detalle_pago::text ~ '^\{.*\}$'
              THEN COALESCE(
                (vs.detalle_pago::json->>'efectivo')::numeric,
                0
              )
              ELSE 0
            END
          )
          ELSE 0 
        END as efectivo,
        CASE 
          WHEN vs.forma_pago = 'qr' THEN vs.total
          WHEN vs.forma_pago = 'mixto' AND vs.detalle_pago IS NOT NULL
          THEN (
            CASE 
              WHEN vs.detalle_pago::text ~ '^\{.*\}$'
              THEN COALESCE(
                (vs.detalle_pago::json->>'qr')::numeric,
                0
              ) 
              ELSE 0
            END
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
               vs.forma_pago, vs.detalle_pago, vs.descripcion_descuento
      ORDER BY vs.fecha DESC
      LIMIT $${paramCountServicios} OFFSET $${paramCountServicios + 1}
    `;

    // Parámetros para paginación - PRODUCTOS
    const paramsProductosPaginados = [...paramsProductos, pageSize, offset];

    // Parámetros para paginación - SERVICIOS
    const paramsServiciosPaginados = [...paramsServicios, pageSize, offset];

    console.log("🔄 Ejecutando consultas...");
    console.log("📍 WHERE Productos:", whereClauseProductos);
    console.log("📍 WHERE Servicios:", whereClauseServicios);

    // Ejecutar consultas en paralelo
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
      countProductosResult.rows[0]?.total_count || 0,
    );
    const totalServicios = parseInt(
      countServiciosResult.rows[0]?.total_count || 0,
    );
    const totalCount = totalProductos + totalServicios;

    console.log(
      `✅ Productos encontrados: ${productSalesResult.rows.length} de ${totalProductos} totales`,
    );
    console.log(
      `✅ Servicios encontrados: ${serviceSalesResult.rows.length} de ${totalServicios} totales`,
    );

    // Combinar resultados
    let allSales = [...productSalesResult.rows, ...serviceSalesResult.rows];

    // Función auxiliar para parsear fecha desde string formateado
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
          parseInt(seconds),
        );
      } catch (e) {
        console.warn("⚠️ Error parseando fecha:", dateStr, e);
        return new Date();
      }
    }

    // Ordenar por fecha descendente
    allSales.sort((a, b) => {
      const dateA = parseDateFromString(a.fecha);
      const dateB = parseDateFromString(b.fecha);
      return dateB - dateA;
    });

    console.log(
      `📊 Ventas encontradas: ${allSales.length} de ${totalCount} totales (página ${page})`,
    );

    return {
      sales: allSales.map((sale) => ({
        ...sale,
        id: sale.id.toString(),
        fecha: sale.fecha, // FECHA ORIGINAL DEL BACKEND
        subtotal: parseFloat(sale.subtotal) || 0,
        descuento: parseFloat(sale.descuento) || 0,
        total: parseFloat(sale.total) || 0,
        efectivo: sale.efectivo ? parseFloat(sale.efectivo) : 0,
        qr: sale.qr ? parseFloat(sale.qr) : 0,
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
    console.error("Stack trace:", error.stack);
    throw error;
  }
};

// NUEVA FUNCIÓN: Obtener totales de ventas
const getTotals = async (filters = {}) => {
  try {
    console.log("📊 Calculando totales con filtros:", filters);

    // Primero obtener la fecha actual en La Paz
    const todayResult = await query(
      "SELECT (NOW() AT TIME ZONE 'America/La_Paz')::date as hoy_la_paz"
    );
    const hoyLaPaz = todayResult.rows[0].hoy_la_paz;
    console.log(`📅 [Totales] Fecha actual en La Paz: ${hoyLaPaz}`);

    // Preparar condiciones WHERE para productos
    let whereConditionsProductos = [];
    let paramsProductos = [];
    let paramCountProductos = 1;

    // Preparar condiciones WHERE para servicios
    let whereConditionsServicios = [];
    let paramsServicios = [];
    let paramCountServicios = 1;

    // Condición base
    const baseConditionProductos = "vp.subtotal > 0";
    const baseConditionServicios = "vs.subtotal > 0";

    // Filtro por sucursal - PRODUCTOS
    if (filters.sucursal) {
      whereConditionsProductos.push(`vp.sucursal_id = $${paramCountProductos}`);
      paramsProductos.push(filters.sucursal);
      paramCountProductos++;
    }

    // Filtro por sucursal - SERVICIOS
    if (filters.sucursal) {
      whereConditionsServicios.push(`vs.sucursal_id = $${paramCountServicios}`);
      paramsServicios.push(filters.sucursal);
      paramCountServicios++;
    }

    // Filtro por empleado - PRODUCTOS
    if (filters.empleadoId) {
      const usuarioResult = await query(
        "SELECT empleado_id FROM usuarios WHERE id = $1",
        [filters.empleadoId],
      );

      if (usuarioResult.rows.length > 0) {
        const empleadoIdReal = usuarioResult.rows[0].empleado_id;
        whereConditionsProductos.push(
          `vp.empleado_id = $${paramCountProductos}`,
        );
        paramsProductos.push(empleadoIdReal);
        paramCountProductos++;
      }
    }

    // Filtro por empleado - SERVICIOS
    if (filters.empleadoId) {
      const usuarioResult = await query(
        "SELECT empleado_id FROM usuarios WHERE id = $1",
        [filters.empleadoId],
      );

      if (usuarioResult.rows.length > 0) {
        const empleadoIdReal = usuarioResult.rows[0].empleado_id;
        whereConditionsServicios.push(
          `vs.empleado_id = $${paramCountServicios}`,
        );
        paramsServicios.push(empleadoIdReal);
        paramCountServicios++;
      }
    }

    // Función para agregar filtros de fecha (misma lógica que getSales)
    const addDateFilters = async (
      whereConditions,
      params,
      paramCount,
      tableAlias,
    ) => {
      let newParamCount = paramCount;

      if (filters.dateFilterType === "specific" && filters.specificDate) {
        whereConditions.push(`DATE(${tableAlias}.fecha) = $${newParamCount}`);
        params.push(filters.specificDate);
        newParamCount++;
      } else if (
        filters.dateFilterType === "range" &&
        filters.startDate &&
        filters.endDate
      ) {
        whereConditions.push(
          `DATE(${tableAlias}.fecha) BETWEEN $${newParamCount} AND $${newParamCount + 1}`,
        );
        params.push(filters.startDate, filters.endDate);
        newParamCount += 2;
      } else if (filters.dateFilterType === "today") {
        whereConditions.push(`DATE(${tableAlias}.fecha) = $${newParamCount}`);
        params.push(hoyLaPaz);
        newParamCount++;
      } else if (filters.dateFilterType === "yesterday") {
        const ayerResult = await query(
          "SELECT ($1::date - INTERVAL '1 day')::date as ayer",
          [hoyLaPaz]
        );
        const ayerLaPaz = ayerResult.rows[0].ayer;
        whereConditions.push(`DATE(${tableAlias}.fecha) = $${newParamCount}`);
        params.push(ayerLaPaz);
        newParamCount++;
      } else if (filters.dateFilterType === "thisWeek") {
        const thisWeekResult = await query(`
          SELECT 
            date_trunc('week', $1::date)::date as inicio_semana,
            (date_trunc('week', $1::date) + INTERVAL '6 days')::date as fin_semana
        `, [hoyLaPaz]);
        
        const { inicio_semana, fin_semana } = thisWeekResult.rows[0];
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        params.push(inicio_semana);
        newParamCount++;
        
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount}`);
        params.push(fin_semana);
        newParamCount++;
      } else if (filters.dateFilterType === "lastWeek") {
        const lastWeekResult = await query(`
          SELECT 
            (date_trunc('week', $1::date) - INTERVAL '7 days')::date as inicio_semana_pasada,
            (date_trunc('week', $1::date) - INTERVAL '1 day')::date as fin_semana_pasada
        `, [hoyLaPaz]);
        
        const { inicio_semana_pasada, fin_semana_pasada } = lastWeekResult.rows[0];
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        params.push(inicio_semana_pasada);
        newParamCount++;
        
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount}`);
        params.push(fin_semana_pasada);
        newParamCount++;
      } else if (filters.dateFilterType === "thisMonth") {
        const thisMonthResult = await query(`
          SELECT 
            date_trunc('month', $1::date)::date as inicio_mes,
            (date_trunc('month', $1::date) + INTERVAL '1 month - 1 day')::date as fin_mes
        `, [hoyLaPaz]);
        
        const { inicio_mes, fin_mes } = thisMonthResult.rows[0];
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        params.push(inicio_mes);
        newParamCount++;
        
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount}`);
        params.push(fin_mes);
        newParamCount++;
      } else if (filters.dateFilterType === "lastMonth") {
        const lastMonthResult = await query(`
          SELECT 
            date_trunc('month', $1::date - INTERVAL '1 month')::date as inicio_mes_pasado,
            (date_trunc('month', $1::date) - INTERVAL '1 day')::date as fin_mes_pasado
        `, [hoyLaPaz]);
        
        const { inicio_mes_pasado, fin_mes_pasado } = lastMonthResult.rows[0];
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        params.push(inicio_mes_pasado);
        newParamCount++;
        
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount}`);
        params.push(fin_mes_pasado);
        newParamCount++;
      }

      return newParamCount;
    };

    // Agregar filtros de fecha
    paramCountProductos = await addDateFilters(
      whereConditionsProductos,
      paramsProductos,
      paramCountProductos,
      "vp",
    );

    paramCountServicios = await addDateFilters(
      whereConditionsServicios,
      paramsServicios,
      paramCountServicios,
      "vs",
    );

    // Construir WHERE clauses
    const whereClauseProductos =
      whereConditionsProductos.length > 0
        ? `WHERE ${baseConditionProductos} AND ${whereConditionsProductos.join(" AND ")}`
        : `WHERE ${baseConditionProductos}`;

    const whereClauseServicios =
      whereConditionsServicios.length > 0
        ? `WHERE ${baseConditionServicios} AND ${whereConditionsServicios.join(" AND ")}`
        : `WHERE ${baseConditionServicios}`;

    // Query para totales de productos
    const totalsQueryProductos = `
      SELECT 
        COALESCE(SUM(vp.total), 0) as total_productos,
        COALESCE(SUM(
          CASE 
            WHEN vp.forma_pago = 'efectivo' THEN vp.total
            WHEN vp.forma_pago = 'mixto' AND vp.detalle_pago IS NOT NULL 
            THEN COALESCE((vp.detalle_pago::json->>'efectivo')::numeric, 0)
            ELSE 0 
          END
        ), 0) as efectivo_productos,
        COALESCE(SUM(
          CASE 
            WHEN vp.forma_pago = 'qr' THEN vp.total
            WHEN vp.forma_pago = 'mixto' AND vp.detalle_pago IS NOT NULL
            THEN COALESCE((vp.detalle_pago::json->>'qr')::numeric, 0)
            ELSE 0 
          END
        ), 0) as qr_productos
      FROM ventas_productos vp
      ${whereClauseProductos}
    `;

    // Query para totales de servicios
    const totalsQueryServicios = `
      SELECT 
        COALESCE(SUM(vs.total), 0) as total_servicios,
        COALESCE(SUM(
          CASE 
            WHEN vs.forma_pago = 'efectivo' THEN vs.total
            WHEN vs.forma_pago = 'mixto' AND vs.detalle_pago IS NOT NULL 
            THEN COALESCE((vs.detalle_pago::json->>'efectivo')::numeric, 0)
            ELSE 0 
          END
        ), 0) as efectivo_servicios,
        COALESCE(SUM(
          CASE 
            WHEN vs.forma_pago = 'qr' THEN vs.total
            WHEN vs.forma_pago = 'mixto' AND vs.detalle_pago IS NOT NULL
            THEN COALESCE((vs.detalle_pago::json->>'qr')::numeric, 0)
            ELSE 0 
          END
        ), 0) as qr_servicios
      FROM ventas_servicios vs
      ${whereClauseServicios}
    `;

    console.log("🔄 Ejecutando consultas de totales...");

    // Ejecutar consultas de totales
    const [totalesProductosResult, totalesServiciosResult] = await Promise.all([
      query(totalsQueryProductos, paramsProductos),
      query(totalsQueryServicios, paramsServicios),
    ]);

    const totalProductos = parseFloat(totalesProductosResult.rows[0]?.total_productos || 0);
    const efectivoProductos = parseFloat(totalesProductosResult.rows[0]?.efectivo_productos || 0);
    const qrProductos = parseFloat(totalesProductosResult.rows[0]?.qr_productos || 0);

    const totalServicios = parseFloat(totalesServiciosResult.rows[0]?.total_servicios || 0);
    const efectivoServicios = parseFloat(totalesServiciosResult.rows[0]?.efectivo_servicios || 0);
    const qrServicios = parseFloat(totalesServiciosResult.rows[0]?.qr_servicios || 0);

    const totalGeneral = totalProductos + totalServicios;
    const efectivoGeneral = efectivoProductos + efectivoServicios;
    const qrGeneral = qrProductos + qrServicios;

    const totals = {
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

    console.log("✅ Totales calculados:", totals);
    return totals;
  } catch (error) {
    console.error("❌ Error in getTotals service:", error);
    console.error("Stack trace:", error.stack);
    throw error;
  }
};

const getSaleDetails = async (saleId, saleType) => {
  try {
    console.log(
      `🔍 Obteniendo detalles de venta ${saleId} de tipo ${saleType}`,
    );

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
        [saleId],
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
        [saleId],
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
        [saleId],
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
        [saleId],
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

const getSucursales = async () => {
  try {
    console.log("🔄 Obteniendo sucursales...");
    const result = await query(
      `SELECT id, nombre FROM sucursales WHERE estado = 1 ORDER BY nombre`,
    );

    console.log(`✅ Sucursales encontradas: ${result.rows.length}`);

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