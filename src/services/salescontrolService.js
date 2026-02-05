const { query } = require("../../db");

const getSales = async (filters = {}, page = 1, pageSize = 20) => {
  try {
    console.log("🔍 Filtros recibidos en sales service:", filters);
    console.log("📄 Paginación:", { page, pageSize });

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

        whereConditionsProductos.push(`vp.empleado_id = $${paramCountProductos}`);
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
        whereConditionsServicios.push(`vs.empleado_id = $${paramCountServicios}`);
        paramsServicios.push(empleadoIdReal);
        paramCountServicios++;
      }
    }

    // Función para agregar filtros de fecha - CON ZONA HORARIA AMERICA/LA_PAZ
    const addDateFilters = (whereConditions, params, paramCount, tableAlias) => {
      let newParamCount = paramCount;
      
      if (filters.dateFilterType === "specific" && filters.specificDate) {
        // Fecha específica
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') = $${newParamCount}`);
        params.push(filters.specificDate);
        newParamCount++;
      } else if (
        filters.dateFilterType === "range" &&
        filters.startDate &&
        filters.endDate
      ) {
        // Rango
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') BETWEEN $${newParamCount} AND $${newParamCount + 1}`);
        params.push(filters.startDate, filters.endDate);
        newParamCount += 2;
      } else if (filters.dateFilterType === "today") {
        // HOY en zona horaria America/La_Paz
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') = CURRENT_DATE AT TIME ZONE 'America/La_Paz'`);
      } else if (filters.dateFilterType === "yesterday") {
        // AYER en zona horaria America/La_Paz
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') = (CURRENT_DATE AT TIME ZONE 'America/La_Paz') - INTERVAL '1 day'`);
      } else if (filters.dateFilterType === "thisWeek") {
        // Esta semana en zona horaria America/La_Paz
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') >= DATE_TRUNC('week', CURRENT_DATE AT TIME ZONE 'America/La_Paz')`);
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') <= (CURRENT_DATE AT TIME ZONE 'America/La_Paz')`);
      } else if (filters.dateFilterType === "lastWeek") {
        // Semana pasada en zona horaria America/La_Paz
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') >= DATE_TRUNC('week', CURRENT_DATE AT TIME ZONE 'America/La_Paz') - INTERVAL '7 days'`);
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') < DATE_TRUNC('week', CURRENT_DATE AT TIME ZONE 'America/La_Paz')`);
      } else if (filters.dateFilterType === "thisMonth") {
        // Este mes en zona horaria America/La_Paz
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') >= DATE_TRUNC('month', CURRENT_DATE AT TIME ZONE 'America/La_Paz')`);
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') <= (CURRENT_DATE AT TIME ZONE 'America/La_Paz')`);
      } else if (filters.dateFilterType === "lastMonth") {
        // Mes pasado en zona horaria America/La_Paz
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') >= DATE_TRUNC('month', CURRENT_DATE AT TIME ZONE 'America/La_Paz') - INTERVAL '1 month'`);
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') < DATE_TRUNC('month', CURRENT_DATE AT TIME ZONE 'America/La_Paz')`);
      }
      // Para "all" no agregamos filtro de fecha
      
      return newParamCount;
    };

    // Agregar filtros de fecha - PRODUCTOS
    paramCountProductos = addDateFilters(whereConditionsProductos, paramsProductos, paramCountProductos, "vp");

    // Agregar filtros de fecha - SERVICIOS
    paramCountServicios = addDateFilters(whereConditionsServicios, paramsServicios, paramCountServicios, "vs");

    // Construir WHERE clauses
    const whereClauseProductos = whereConditionsProductos.length > 0 
      ? `WHERE ${baseConditionProductos} AND ${whereConditionsProductos.join(' AND ')}` 
      : `WHERE ${baseConditionProductos}`;

    const whereClauseServicios = whereConditionsServicios.length > 0 
      ? `WHERE ${baseConditionServicios} AND ${whereConditionsServicios.join(' AND ')}` 
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

    // Query para ventas de productos (con paginación) - CON ZONA HORARIA AMERICA/LA_PAZ
    let queryStrProductos = `
      SELECT 
        vp.id,
        TO_CHAR(vp.fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY, HH24:MI:SS') as fecha,
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

    // Query para ventas de servicios (con paginación) - CON ZONA HORARIA AMERICA/LA_PAZ
    let queryStrServicios = `
      SELECT 
        vs.id,
        TO_CHAR(vs.fecha AT TIME ZONE 'America/La_Paz', 'DD/MM/YYYY, HH24:MI:SS') as fecha,
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
      serviceSalesResult
    ] = await Promise.all([
      query(countQueryProductos, paramsProductos),
      query(countQueryServicios, paramsServicios),
      query(queryStrProductos, paramsProductosPaginados),
      query(queryStrServicios, paramsServiciosPaginados)
    ]);

    const totalProductos = parseInt(countProductosResult.rows[0]?.total_count || 0);
    const totalServicios = parseInt(countServiciosResult.rows[0]?.total_count || 0);
    const totalCount = totalProductos + totalServicios;

    console.log(`✅ Productos encontrados: ${productSalesResult.rows.length} de ${totalProductos} totales`);
    console.log(`✅ Servicios encontrados: ${serviceSalesResult.rows.length} de ${totalServicios} totales`);

    // Combinar resultados
    let allSales = [...productSalesResult.rows, ...serviceSalesResult.rows];

    // Ordenar por fecha descendente
    allSales.sort((a, b) => {
      const dateA = parseDateFromString(a.fecha);
      const dateB = parseDateFromString(b.fecha);
      return dateB - dateA;
    });

    console.log(
      `📊 Ventas encontradas: ${allSales.length} de ${totalCount} totales (página ${page})`,
    );

    // Función auxiliar para parsear fecha desde string formateado
    function parseDateFromString(dateStr) {
      try {
        // Formato: "DD/MM/YYYY, HH24:MI:SS"
        const parts = dateStr.split(', ');
        const datePart = parts[0]; // "DD/MM/YYYY"
        const timePart = parts[1]; // "HH24:MI:SS"
        
        const [day, month, year] = datePart.split('/');
        const [hours, minutes, seconds] = timePart.split(':');
        
        return new Date(
          parseInt(year),
          parseInt(month) - 1, // Meses en JS son 0-indexed
          parseInt(day),
          parseInt(hours),
          parseInt(minutes),
          parseInt(seconds)
        );
      } catch (e) {
        console.warn("⚠️ Error parseando fecha:", dateStr, e);
        return new Date();
      }
    }

    return {
      sales: allSales.map((sale) => ({
        ...sale,
        id: sale.id.toString(),
        fecha: sale.fecha, // FECHA SIN MODIFICAR
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

// NUEVA FUNCIÓN: Obtener totales de ventas (sin paginación) - CON ZONA HORARIA AMERICA/LA_PAZ
const getTotals = async (filters = {}) => {
  try {
    console.log("📊 Calculando totales con filtros:", filters);

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

        whereConditionsProductos.push(`vp.empleado_id = $${paramCountProductos}`);
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
        whereConditionsServicios.push(`vs.empleado_id = $${paramCountServicios}`);
        paramsServicios.push(empleadoIdReal);
        paramCountServicios++;
      }
    }

    // Función para agregar filtros de fecha - CON ZONA HORARIA AMERICA/LA_PAZ
    const addDateFilters = (whereConditions, params, paramCount, tableAlias) => {
      let newParamCount = paramCount;
      
      if (filters.dateFilterType === "specific" && filters.specificDate) {
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') = $${newParamCount}`);
        params.push(filters.specificDate);
        newParamCount++;
      } else if (
        filters.dateFilterType === "range" &&
        filters.startDate &&
        filters.endDate
      ) {
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') BETWEEN $${newParamCount} AND $${newParamCount + 1}`);
        params.push(filters.startDate, filters.endDate);
        newParamCount += 2;
      } else if (filters.dateFilterType === "today") {
        // HOY en zona horaria America/La_Paz
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') = CURRENT_DATE AT TIME ZONE 'America/La_Paz'`);
      } else if (filters.dateFilterType === "yesterday") {
        // AYER en zona horaria America/La_Paz
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') = (CURRENT_DATE AT TIME ZONE 'America/La_Paz') - INTERVAL '1 day'`);
      } else if (filters.dateFilterType === "thisWeek") {
        // Esta semana en zona horaria America/La_Paz
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') >= DATE_TRUNC('week', CURRENT_DATE AT TIME ZONE 'America/La_Paz')`);
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') <= (CURRENT_DATE AT TIME ZONE 'America/La_Paz')`);
      } else if (filters.dateFilterType === "lastWeek") {
        // Semana pasada en zona horaria America/La_Paz
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') >= DATE_TRUNC('week', CURRENT_DATE AT TIME ZONE 'America/La_Paz') - INTERVAL '7 days'`);
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') < DATE_TRUNC('week', CURRENT_DATE AT TIME ZONE 'America/La_Paz')`);
      } else if (filters.dateFilterType === "thisMonth") {
        // Este mes en zona horaria America/La_Paz
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') >= DATE_TRUNC('month', CURRENT_DATE AT TIME ZONE 'America/La_Paz')`);
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') <= (CURRENT_DATE AT TIME ZONE 'America/La_Paz')`);
      } else if (filters.dateFilterType === "lastMonth") {
        // Mes pasado en zona horaria America/La_Paz
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') >= DATE_TRUNC('month', CURRENT_DATE AT TIME ZONE 'America/La_Paz') - INTERVAL '1 month'`);
        whereConditions.push(`DATE(${tableAlias}.fecha AT TIME ZONE 'America/La_Paz') < DATE_TRUNC('month', CURRENT_DATE AT TIME ZONE 'America/La_Paz')`);
      }
      
      return newParamCount;
    };

    // Agregar filtros de fecha - PRODUCTOS
    paramCountProductos = addDateFilters(whereConditionsProductos, paramsProductos, paramCountProductos, "vp");

    // Agregar filtros de fecha - SERVICIOS
    paramCountServicios = addDateFilters(whereConditionsServicios, paramsServicios, paramCountServicios, "vs");

    // Construir WHERE clauses
    const whereClauseProductos = whereConditionsProductos.length > 0 
      ? `WHERE ${baseConditionProductos} AND ${whereConditionsProductos.join(' AND ')}` 
      : `WHERE ${baseConditionProductos}`;

    const whereClauseServicios = whereConditionsServicios.length > 0 
      ? `WHERE ${baseConditionServicios} AND ${whereConditionsServicios.join(' AND ')}` 
      : `WHERE ${baseConditionServicios}`;

    // Query para totales de productos - CON ZONA HORARIA AMERICA/LA_PAZ
    const totalsQueryProductos = `
      SELECT 
        COALESCE(SUM(vp.total), 0) as total_productos,
        COALESCE(SUM(
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
          END
        ), 0) as efectivo_productos,
        COALESCE(SUM(
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
          END
        ), 0) as qr_productos
      FROM ventas_productos vp
      ${whereClauseProductos}
    `;

    // Query para totales de servicios - CON ZONA HORARIA AMERICA/LA_PAZ
    const totalsQueryServicios = `
      SELECT 
        COALESCE(SUM(vs.total), 0) as total_servicios,
        COALESCE(SUM(
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
          END
        ), 0) as efectivo_servicios,
        COALESCE(SUM(
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
          END
        ), 0) as qr_servicios
      FROM ventas_servicios vs
      ${whereClauseServicios}
    `;

    console.log("📊 Parámetros para totales productos:", paramsProductos);
    console.log("📊 Parámetros para totales servicios:", paramsServicios);

    // Ejecutar consultas en paralelo
    const [totalesProductosResult, totalesServiciosResult] = await Promise.all([
      query(totalsQueryProductos, paramsProductos),
      query(totalesQueryServicios, paramsServicios)
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

    console.log("📊 Resultados de totales:", {
      totalProductos,
      efectivoProductos,
      qrProductos,
      totalServicios,
      efectivoServicios,
      qrServicios,
      totalGeneral,
      efectivoGeneral,
      qrGeneral
    });

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