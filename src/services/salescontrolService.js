const { query } = require("../../db");

// Función para obtener fecha actual en zona Bolivia (America/La_Paz)
const getBoliviaDate = () => {
  const now = new Date();
  // Bolivia está en UTC-4
  const boliviaOffset = -4 * 60; // en minutos
  const localOffset = now.getTimezoneOffset(); // en minutos
  const boliviaTime = new Date(now.getTime() + (localOffset - boliviaOffset) * 60000);
  return boliviaTime;
};

// Función para formatear fecha a YYYY-MM-DD en zona Bolivia
const formatBoliviaDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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

    // Función para agregar filtros de fecha - CORREGIDA CON ZONA BOLIVIA
    const addDateFilters = (whereConditions, params, paramCount, tableAlias) => {
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
        whereConditions.push(`DATE(${tableAlias}.fecha) BETWEEN $${newParamCount} AND $${newParamCount + 1}`);
        params.push(filters.startDate, filters.endDate);
        newParamCount += 2;
      } else if (filters.dateFilterType === "today") {
        // FECHA HOY EN ZONA BOLIVIA
        const boliviaToday = getBoliviaDate();
        const todayStr = formatBoliviaDate(boliviaToday);
        console.log(`📅 Filtro HOY (Bolivia): ${todayStr}`);
        whereConditions.push(`DATE(${tableAlias}.fecha) = $${newParamCount}`);
        params.push(todayStr);
        newParamCount++;
      } else if (filters.dateFilterType === "yesterday") {
        // FECHA AYER EN ZONA BOLIVIA
        const boliviaToday = getBoliviaDate();
        const boliviaYesterday = new Date(boliviaToday);
        boliviaYesterday.setDate(boliviaYesterday.getDate() - 1);
        const yesterdayStr = formatBoliviaDate(boliviaYesterday);
        console.log(`📅 Filtro AYER (Bolivia): ${yesterdayStr}`);
        whereConditions.push(`DATE(${tableAlias}.fecha) = $${newParamCount}`);
        params.push(yesterdayStr);
        newParamCount++;
      } else if (filters.dateFilterType === "thisWeek") {
        // Esta semana en zona Bolivia
        const boliviaToday = getBoliviaDate();
        const weekStart = new Date(boliviaToday);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1)); // Lunes
        const weekEnd = new Date(boliviaToday);
        
        const weekStartStr = formatBoliviaDate(weekStart);
        const weekEndStr = formatBoliviaDate(weekEnd);
        
        console.log(`📅 Filtro ESTA SEMANA (Bolivia): ${weekStartStr} a ${weekEndStr}`);
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount + 1}`);
        params.push(weekStartStr, weekEndStr);
        newParamCount += 2;
      } else if (filters.dateFilterType === "lastWeek") {
        // Semana pasada en zona Bolivia
        const boliviaToday = getBoliviaDate();
        const weekStart = new Date(boliviaToday);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() - 6 + (weekStart.getDay() === 0 ? -6 : 1)); // Lunes semana pasada
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const weekStartStr = formatBoliviaDate(weekStart);
        const weekEndStr = formatBoliviaDate(weekEnd);
        
        console.log(`📅 Filtro SEMANA PASADA (Bolivia): ${weekStartStr} a ${weekEndStr}`);
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount + 1}`);
        params.push(weekStartStr, weekEndStr);
        newParamCount += 2;
      } else if (filters.dateFilterType === "thisMonth") {
        // Mes actual en zona Bolivia
        const boliviaToday = getBoliviaDate();
        const monthStart = new Date(boliviaToday.getFullYear(), boliviaToday.getMonth(), 1);
        const monthEnd = new Date(boliviaToday);
        
        const monthStartStr = formatBoliviaDate(monthStart);
        const monthEndStr = formatBoliviaDate(monthEnd);
        
        console.log(`📅 Filtro ESTE MES (Bolivia): ${monthStartStr} a ${monthEndStr}`);
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount + 1}`);
        params.push(monthStartStr, monthEndStr);
        newParamCount += 2;
      } else if (filters.dateFilterType === "lastMonth") {
        // Mes pasado en zona Bolivia
        const boliviaToday = getBoliviaDate();
        const lastMonth = new Date(boliviaToday.getFullYear(), boliviaToday.getMonth() - 1, 1);
        const lastMonthEnd = new Date(boliviaToday.getFullYear(), boliviaToday.getMonth(), 0);
        
        const lastMonthStartStr = formatBoliviaDate(lastMonth);
        const lastMonthEndStr = formatBoliviaDate(lastMonthEnd);
        
        console.log(`📅 Filtro MES PASADO (Bolivia): ${lastMonthStartStr} a ${lastMonthEndStr}`);
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount + 1}`);
        params.push(lastMonthStartStr, lastMonthEndStr);
        newParamCount += 2;
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
    console.log("📍 Parámetros productos:", paramsProductos);
    console.log("📍 Parámetros servicios:", paramsServicios);

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
        const parts = dateStr.split(', ');
        const datePart = parts[0];
        const timePart = parts[1];
        
        const [day, month, year] = datePart.split('/');
        const [hours, minutes, seconds] = timePart.split(':');
        
        return new Date(
          parseInt(year),
          parseInt(month) - 1,
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
        fecha: sale.fecha,
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

// NUEVA FUNCIÓN: Obtener totales de ventas (sin paginación) - CORREGIDA
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
      const usuarioResult = await query(
        "SELECT empleado_id FROM usuarios WHERE id = $1",
        [filters.empleadoId],
      );

      if (usuarioResult.rows.length > 0) {
        const empleadoIdReal = usuarioResult.rows[0].empleado_id;
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

    // Función para agregar filtros de fecha - CORREGIDA CON ZONA BOLIVIA
    const addDateFilters = (whereConditions, params, paramCount, tableAlias) => {
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
        whereConditions.push(`DATE(${tableAlias}.fecha) BETWEEN $${newParamCount} AND $${newParamCount + 1}`);
        params.push(filters.startDate, filters.endDate);
        newParamCount += 2;
      } else if (filters.dateFilterType === "today") {
        // FECHA HOY EN ZONA BOLIVIA
        const boliviaToday = getBoliviaDate();
        const todayStr = formatBoliviaDate(boliviaToday);
        console.log(`📅 Filtro HOY para totales (Bolivia): ${todayStr}`);
        whereConditions.push(`DATE(${tableAlias}.fecha) = $${newParamCount}`);
        params.push(todayStr);
        newParamCount++;
      } else if (filters.dateFilterType === "yesterday") {
        // FECHA AYER EN ZONA BOLIVIA
        const boliviaToday = getBoliviaDate();
        const boliviaYesterday = new Date(boliviaToday);
        boliviaYesterday.setDate(boliviaYesterday.getDate() - 1);
        const yesterdayStr = formatBoliviaDate(boliviaYesterday);
        console.log(`📅 Filtro AYER para totales (Bolivia): ${yesterdayStr}`);
        whereConditions.push(`DATE(${tableAlias}.fecha) = $${newParamCount}`);
        params.push(yesterdayStr);
        newParamCount++;
      } else if (filters.dateFilterType === "thisWeek") {
        const boliviaToday = getBoliviaDate();
        const weekStart = new Date(boliviaToday);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1));
        const weekEnd = new Date(boliviaToday);
        
        const weekStartStr = formatBoliviaDate(weekStart);
        const weekEndStr = formatBoliviaDate(weekEnd);
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount + 1}`);
        params.push(weekStartStr, weekEndStr);
        newParamCount += 2;
      } else if (filters.dateFilterType === "lastWeek") {
        const boliviaToday = getBoliviaDate();
        const weekStart = new Date(boliviaToday);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() - 6 + (weekStart.getDay() === 0 ? -6 : 1));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        
        const weekStartStr = formatBoliviaDate(weekStart);
        const weekEndStr = formatBoliviaDate(weekEnd);
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount + 1}`);
        params.push(weekStartStr, weekEndStr);
        newParamCount += 2;
      } else if (filters.dateFilterType === "thisMonth") {
        const boliviaToday = getBoliviaDate();
        const monthStart = new Date(boliviaToday.getFullYear(), boliviaToday.getMonth(), 1);
        const monthEnd = new Date(boliviaToday);
        
        const monthStartStr = formatBoliviaDate(monthStart);
        const monthEndStr = formatBoliviaDate(monthEnd);
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount + 1}`);
        params.push(monthStartStr, monthEndStr);
        newParamCount += 2;
      } else if (filters.dateFilterType === "lastMonth") {
        const boliviaToday = getBoliviaDate();
        const lastMonth = new Date(boliviaToday.getFullYear(), boliviaToday.getMonth() - 1, 1);
        const lastMonthEnd = new Date(boliviaToday.getFullYear(), boliviaToday.getMonth(), 0);
        
        const lastMonthStartStr = formatBoliviaDate(lastMonth);
        const lastMonthEndStr = formatBoliviaDate(lastMonthEnd);
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount + 1}`);
        params.push(lastMonthStartStr, lastMonthEndStr);
        newParamCount += 2;
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

    // Query para totales de productos
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

    // Query para totales de servicios
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