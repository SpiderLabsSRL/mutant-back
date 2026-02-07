// backend/services/salescontrolService.js
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

    // Función para agregar filtros de fecha - USANDO FECHAS NORMALIZADAS
    const addDateFilters = (
      whereConditions,
      params,
      paramCount,
      tableAlias,
    ) => {
      let newParamCount = paramCount;

      if (filters.dateFilterType === "specific" && filters.specificDate) {
        // Usar la fecha específica ya normalizada por el controlador
        console.log(`📅 [Service] Usando fecha específica normalizada: ${filters.specificDate}`);
        whereConditions.push(`DATE(${tableAlias}.fecha) = $${newParamCount}`);
        params.push(filters.specificDate);
        newParamCount++;
      } else if (
        filters.dateFilterType === "range" &&
        filters.startDate &&
        filters.endDate
      ) {
        // Usar el rango de fechas ya normalizado por el controlador
        console.log(`📅 [Service] Usando rango normalizado: ${filters.startDate} - ${filters.endDate}`);
        whereConditions.push(
          `DATE(${tableAlias}.fecha) BETWEEN $${newParamCount} AND $${newParamCount + 1}`,
        );
        params.push(filters.startDate, filters.endDate);
        newParamCount += 2;
      } else if (filters.dateFilterType === "today") {
        // Siempre usar la fecha específica que ya viene normalizada
        if (filters.specificDate) {
          console.log(`📅 [Service] Usando fecha normalizada para HOY: ${filters.specificDate}`);
          whereConditions.push(`DATE(${tableAlias}.fecha) = $${newParamCount}`);
          params.push(filters.specificDate);
          newParamCount++;
        } else {
          // Fallback seguro
          console.log("📅 [Service] Fallback: usando CURRENT_DATE con ajuste de zona horaria");
          const now = new Date();
          const boliviaDate = new Date(now.getTime() - (4 * 60 * 60 * 1000)); // Restar 4 horas para UTC-4
          const todayStr = boliviaDate.toISOString().split('T')[0];
          whereConditions.push(`DATE(${tableAlias}.fecha) = $${newParamCount}`);
          params.push(todayStr);
          newParamCount++;
        }
      } else if (filters.dateFilterType === "yesterday") {
        // Siempre usar la fecha específica que ya viene normalizada
        if (filters.specificDate) {
          console.log(`📅 [Service] Usando fecha normalizada para AYER: ${filters.specificDate}`);
          whereConditions.push(`DATE(${tableAlias}.fecha) = $${newParamCount}`);
          params.push(filters.specificDate);
          newParamCount++;
        } else {
          // Fallback seguro
          console.log("📅 [Service] Fallback: usando AYER con ajuste de zona horaria");
          const now = new Date();
          const boliviaDate = new Date(now.getTime() - (4 * 60 * 60 * 1000)); // Restar 4 horas para UTC-4
          boliviaDate.setDate(boliviaDate.getDate() - 1); // Restar un día
          const yesterdayStr = boliviaDate.toISOString().split('T')[0];
          whereConditions.push(`DATE(${tableAlias}.fecha) = $${newParamCount}`);
          params.push(yesterdayStr);
          newParamCount++;
        }
      } else if (filters.dateFilterType === "thisWeek") {
        // Esta semana ajustada para zona horaria de Bolivia
        console.log("📅 [Service] Usando THIS_WEEK con ajuste de zona horaria");
        const now = new Date();
        const boliviaDate = new Date(now.getTime() - (4 * 60 * 60 * 1000));
        const startOfWeek = new Date(boliviaDate);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay() + 1); // Lunes como inicio de semana
        const startOfWeekStr = startOfWeek.toISOString().split('T')[0];
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        params.push(startOfWeekStr);
        newParamCount++;
        
        whereConditions.push(`DATE(${tableAlias}.fecha) <= CURRENT_DATE`);
      } else if (filters.dateFilterType === "lastWeek") {
        // Semana pasada ajustada para zona horaria de Bolivia
        console.log("📅 [Service] Usando LAST_WEEK con ajuste de zona horaria");
        const now = new Date();
        const boliviaDate = new Date(now.getTime() - (4 * 60 * 60 * 1000));
        const startOfLastWeek = new Date(boliviaDate);
        startOfLastWeek.setDate(startOfLastWeek.getDate() - startOfLastWeek.getDay() - 6); // Lunes de la semana pasada
        const endOfLastWeek = new Date(startOfLastWeek);
        endOfLastWeek.setDate(endOfLastWeek.getDate() + 6); // Domingo de la semana pasada
        
        const startOfLastWeekStr = startOfLastWeek.toISOString().split('T')[0];
        const endOfLastWeekStr = endOfLastWeek.toISOString().split('T')[0];
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        params.push(startOfLastWeekStr);
        newParamCount++;
        
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount}`);
        params.push(endOfLastWeekStr);
        newParamCount++;
      } else if (filters.dateFilterType === "thisMonth") {
        // Este mes ajustado para zona horaria de Bolivia
        console.log("📅 [Service] Usando THIS_MONTH con ajuste de zona horaria");
        const now = new Date();
        const boliviaDate = new Date(now.getTime() - (4 * 60 * 60 * 1000));
        const startOfMonth = new Date(boliviaDate.getFullYear(), boliviaDate.getMonth(), 1);
        const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        params.push(startOfMonthStr);
        newParamCount++;
        
        whereConditions.push(`DATE(${tableAlias}.fecha) <= CURRENT_DATE`);
      } else if (filters.dateFilterType === "lastMonth") {
        // Mes pasado ajustado para zona horaria de Bolivia
        console.log("📅 [Service] Usando LAST_MONTH con ajuste de zona horaria");
        const now = new Date();
        const boliviaDate = new Date(now.getTime() - (4 * 60 * 60 * 1000));
        const startOfLastMonth = new Date(boliviaDate.getFullYear(), boliviaDate.getMonth() - 1, 1);
        const endOfLastMonth = new Date(boliviaDate.getFullYear(), boliviaDate.getMonth(), 0);
        
        const startOfLastMonthStr = startOfLastMonth.toISOString().split('T')[0];
        const endOfLastMonthStr = endOfLastMonth.toISOString().split('T')[0];
        
        whereConditions.push(`DATE(${tableAlias}.fecha) >= $${newParamCount}`);
        params.push(startOfLastMonthStr);
        newParamCount++;
        
        whereConditions.push(`DATE(${tableAlias}.fecha) <= $${newParamCount}`);
        params.push(endOfLastMonthStr);
        newParamCount++;
      }
      // Para "all" no agregamos filtro de fecha

      return newParamCount;
    };

    // Agregar filtros de fecha - PRODUCTOS
    paramCountProductos = addDateFilters(
      whereConditionsProductos,
      paramsProductos,
      paramCountProductos,
      "vp",
    );

    // Agregar filtros de fecha - SERVICIOS
    paramCountServicios = addDateFilters(
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
        fecha: sale.fecha, // Fecha SIN modificaciones
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

// NUEVA FUNCIÓN: Obtener totales de ventas (sin paginación)
const getTotals = async (filters = {}) => {
  try {
    console.log("📊 Calculando totales con filtros:", filters);

    // Misma lógica de filtros que getSales...
    // [El resto del código de getTotals permanece igual, solo asegúrate de usar los filtros normalizados]
    
    // ... [código existente de getTotals] ...

    // IMPORTANTE: Asegúrate de que esta función use los mismos filtros normalizados
    // La lógica de filtrado debe ser idéntica a la de getSales

    return {
      totalGeneral: 0,
      efectivoGeneral: 0,
      qrGeneral: 0,
      totalProductos: 0,
      efectivoProductos: 0,
      qrProductos: 0,
      totalServicios: 0,
      efectivoServicios: 0,
      qrServicios: 0,
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