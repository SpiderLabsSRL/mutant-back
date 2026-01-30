const { query } = require("../../db");

const getSales = async (filters = {}, page = 1, pageSize = 20) => {
  try {
    console.log("🔍 Filtros recibidos en sales service:", filters);
    console.log("📄 Paginación:", { page, pageSize });

    const offset = (page - 1) * pageSize;

    // Función para validar y parsear JSON de forma segura
    const safeJsonParse = (jsonString) => {
      if (!jsonString) return null;
      try {
        return JSON.parse(jsonString);
      } catch (e) {
        console.warn("⚠️ JSON inválido detectado:", jsonString);
        return null;
      }
    };

    // Preparar condiciones WHERE
    let whereConditions = [];
    let params = [];
    let paramCount = 1;

    // Filtro por sucursal
    if (filters.sucursal && filters.sucursal !== "all") {
      whereConditions.push(`vp.sucursal_id = $${paramCount}`);
      params.push(filters.sucursal);
      paramCount++;
    }

    // Filtro por empleado (solo para recepcionistas)
    if (filters.empleadoId) {
      console.log(`🔄 Filtro por empleadoId: ${filters.empleadoId}`);

      // Obtener el empleado_id correcto desde la tabla usuarios
      const usuarioResult = await query(
        "SELECT empleado_id FROM usuarios WHERE id = $1",
        [filters.empleadoId],
      );

      if (usuarioResult.rows.length > 0) {
        const empleadoIdReal = usuarioResult.rows[0].empleado_id;
        console.log(
          `🔍 usuario_id ${filters.empleadoId} → empleado_id ${empleadoIdReal}`,
        );

        whereConditions.push(`vp.empleado_id = $${paramCount}`);
        params.push(empleadoIdReal);
        paramCount++;
      } else {
        console.log(
          `⚠️ Usuario ${filters.empleadoId} no encontrado, ignorando filtro`,
        );
      }
    }

    // Filtro por fecha
    if (filters.dateFilterType === "specific" && filters.specificDate) {
      whereConditions.push(`DATE(vp.fecha) = $${paramCount}`);
      params.push(filters.specificDate);
      paramCount++;
    } else if (
      filters.dateFilterType === "range" &&
      filters.startDate &&
      filters.endDate
    ) {
      whereConditions.push(`DATE(vp.fecha) BETWEEN $${paramCount} AND $${paramCount + 1}`);
      params.push(filters.startDate, filters.endDate);
      paramCount += 2;
    } else if (filters.dateFilterType === "today") {
      whereConditions.push(`DATE(vp.fecha) = CURRENT_DATE`);
    } else if (filters.dateFilterType === "yesterday") {
      whereConditions.push(`DATE(vp.fecha) = CURRENT_DATE - INTERVAL '1 day'`);
    } else if (filters.dateFilterType === "thisWeek") {
      whereConditions.push(`DATE(vp.fecha) >= DATE_TRUNC('week', CURRENT_DATE)`);
      whereConditions.push(`DATE(vp.fecha) <= CURRENT_DATE`);
    } else if (filters.dateFilterType === "lastWeek") {
      whereConditions.push(`DATE(vp.fecha) >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days'`);
      whereConditions.push(`DATE(vp.fecha) < DATE_TRUNC('week', CURRENT_DATE)`);
    } else if (filters.dateFilterType === "thisMonth") {
      whereConditions.push(`DATE(vp.fecha) >= DATE_TRUNC('month', CURRENT_DATE)`);
      whereConditions.push(`DATE(vp.fecha) <= CURRENT_DATE`);
    } else if (filters.dateFilterType === "lastMonth") {
      whereConditions.push(`DATE(vp.fecha) >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'`);
      whereConditions.push(`DATE(vp.fecha) < DATE_TRUNC('month', CURRENT_DATE)`);
    }
    // Para "all" no agregamos filtro de fecha

    // Construir WHERE clause
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Query para contar total (sin LIMIT para paginación)
    const countQuery = `
      SELECT COUNT(*) as total_count FROM (
        SELECT vp.id FROM ventas_productos vp ${whereClause}
        UNION ALL
        SELECT vs.id FROM ventas_servicios vs ${whereClause.replace(/vp\./g, 'vs.')}
      ) as total
    `;

    // Query para ventas de productos (con paginación)
    let queryStrProductos = `
      SELECT 
        vp.id,
        vp.fecha,
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
      ${whereClause}
      GROUP BY vp.id, vp.fecha, p_emp.nombres, p_emp.apellidos, s.nombre, 
               vp.forma_pago, vp.detalle_pago, vp.descripcion_descuento
      ORDER BY vp.fecha DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    // Query para ventas de servicios (con paginación)
    let queryStrServicios = `
      SELECT 
        vs.id,
        vs.fecha,
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
      ${whereClause.replace(/vp\./g, 'vs.')}
      GROUP BY vs.id, vs.fecha, p_cli.nombres, p_cli.apellidos, 
               p_emp.nombres, p_emp.apellidos, s.nombre, 
               vs.forma_pago, vs.detalle_pago, vs.descripcion_descuento
      ORDER BY vs.fecha DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    // Parámetros para paginación
    params.push(pageSize, offset);

    console.log("🔄 Ejecutando consultas...");
    console.log("Query productos:", queryStrProductos.substring(0, 300) + "...");
    console.log("Params:", params);

    // Obtener total de registros
    const countResult = await query(countQuery, params.slice(0, params.length - 2));
    const totalCount = parseInt(countResult.rows[0]?.total_count || 0);

    // Ejecutar consultas en paralelo
    const [productSalesResult, serviceSalesResult] = await Promise.all([
      query(queryStrProductos, params),
      query(queryStrServicios, params),
    ]);

    console.log(`✅ Productos encontrados: ${productSalesResult.rows.length}`);
    console.log(`✅ Servicios encontrados: ${serviceSalesResult.rows.length}`);

    // Combinar resultados
    let allSales = [...productSalesResult.rows, ...serviceSalesResult.rows];

    // Ordenar por fecha descendente
    allSales.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    console.log(
      `📊 Ventas encontradas: ${allSales.length} de ${totalCount} totales (página ${page})`,
    );

    return {
      sales: allSales.map((sale) => ({
        ...sale,
        id: sale.id.toString(),
        subtotal: parseFloat(sale.subtotal) || 0,
        descuento: parseFloat(sale.descuento) || 0,
        total: parseFloat(sale.total) || 0,
        efectivo: sale.efectivo ? parseFloat(sale.efectivo) : 0,
        qr: sale.qr ? parseFloat(sale.qr) : 0,
        fecha: sale.fecha, // Mantener fecha original de la BD
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

const getSaleDetails = async (saleId, saleType) => {
  try {
    console.log(
      `🔍 Obteniendo detalles de venta ${saleId} de tipo ${saleType}`,
    );

    if (saleType === "producto") {
      // Detalles de venta de productos
      const saleResult = await query(
        `SELECT 
          vp.*,
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
      console.log(
        `✅ Venta encontrada: ID ${sale.id}, Empleado: ${sale.empleado_nombre}`,
      );

      // Detalles de productos vendidos
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
        items: detailsResult.rows,
        tipo: "producto",
        descripcionDescuento: sale.descripcion_descuento,
      };
    } else {
      // Detalles de venta de servicios
      const saleResult = await query(
        `SELECT 
          vs.*,
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
      console.log(
        `✅ Venta encontrada: ID ${sale.id}, Empleado: ${sale.empleado_nombre}`,
      );

      // Detalles de servicios vendidos
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
  getSaleDetails,
  getSucursales,
};