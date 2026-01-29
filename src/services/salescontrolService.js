// backend/services/salescontrolService.js
const { query } = require("../../db");

const getSales = async (filters = {}) => {
  try {
    console.log("🔍 Filtros recibidos en sales service:", filters);

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

    // Función para extraer valores del detalle_pago de forma segura
    const getPaymentDetail = (formaPago, detallePago, tipo) => {
      if (formaPago === tipo) return "total";

      if (formaPago === "mixto" && detallePago) {
        const parsed = safeJsonParse(detallePago);
        if (parsed && typeof parsed === "object" && parsed[tipo]) {
          return `'${parsed[tipo]}'::numeric`;
        }
      }

      return "0";
    };

    let queryStr = `
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
      WHERE vp.subtotal > 0
    `;

    let params = [];
    let paramCount = 1;

    // Filtro por sucursal
    if (filters.sucursal) {
      queryStr += ` AND vp.sucursal_id = $${paramCount}`;
      params.push(filters.sucursal);
      paramCount++;
    }

    // Filtro por empleado
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

        queryStr += ` AND vp.empleado_id = $${paramCount}`;
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
      queryStr += ` AND DATE(vp.fecha) = $${paramCount}`;
      params.push(filters.specificDate);
      paramCount++;
    } else if (
      filters.dateFilterType === "range" &&
      filters.startDate &&
      filters.endDate
    ) {
      queryStr += ` AND DATE(vp.fecha) BETWEEN $${paramCount} AND $${paramCount + 1}`;
      params.push(filters.startDate, filters.endDate);
      paramCount += 2;
    } else if (filters.dateFilterType === "today") {
      queryStr += ` AND DATE(vp.fecha) = CURRENT_DATE`;
    }

    queryStr += ` GROUP BY vp.id, vp.fecha, p_emp.nombres, p_emp.apellidos, s.nombre, vp.forma_pago, vp.detalle_pago, vp.descripcion_descuento`;

    // Query para ventas de servicios
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
      WHERE vs.subtotal > 0
    `;

    let paramsServicios = [];
    let paramCountServicios = 1;

    // Filtro por sucursal
    if (filters.sucursal) {
      queryStrServicios += ` AND vs.sucursal_id = $${paramCountServicios}`;
      paramsServicios.push(filters.sucursal);
      paramCountServicios++;
    }

    // Filtro por empleado
    if (filters.empleadoId) {
      console.log(
        `🔄 Filtro por empleadoId (servicios): ${filters.empleadoId}`,
      );

      // Obtener el empleado_id correcto desde la tabla usuarios
      const usuarioResult = await query(
        "SELECT empleado_id FROM usuarios WHERE id = $1",
        [filters.empleadoId],
      );

      if (usuarioResult.rows.length > 0) {
        const empleadoIdReal = usuarioResult.rows[0].empleado_id;
        console.log(
          `🔍 usuario_id ${filters.empleadoId} → empleado_id ${empleadoIdReal} (servicios)`,
        );

        queryStrServicios += ` AND vs.empleado_id = $${paramCountServicios}`;
        paramsServicios.push(empleadoIdReal);
        paramCountServicios++;
      } else {
        console.log(
          `⚠️ Usuario ${filters.empleadoId} no encontrado, ignorando filtro (servicios)`,
        );
      }
    }

    // Filtro por fecha
    if (filters.dateFilterType === "specific" && filters.specificDate) {
      queryStrServicios += ` AND DATE(vs.fecha) = $${paramCountServicios}`;
      paramsServicios.push(filters.specificDate);
      paramCountServicios++;
    } else if (
      filters.dateFilterType === "range" &&
      filters.startDate &&
      filters.endDate
    ) {
      queryStrServicios += ` AND DATE(vs.fecha) BETWEEN $${paramCountServicios} AND $${paramCountServicios + 1}`;
      paramsServicios.push(filters.startDate, filters.endDate);
      paramCountServicios += 2;
    } else if (filters.dateFilterType === "today") {
      queryStrServicios += ` AND DATE(vs.fecha) = CURRENT_DATE`;
    }

    queryStrServicios += ` GROUP BY vs.id, vs.fecha, p_cli.nombres, p_cli.apellidos, p_emp.nombres, p_emp.apellidos, s.nombre, vs.forma_pago, vs.detalle_pago, vs.descripcion_descuento`;

    console.log("🔄 Ejecutando consulta de productos...");
    console.log("Query productos:", queryStr.substring(0, 500) + "...");
    console.log("Params productos:", params);

    const productSalesResult = await query(queryStr, params);
    console.log(`✅ Productos encontrados: ${productSalesResult.rows.length}`);

    console.log("🔄 Ejecutando consulta de servicios...");
    console.log(
      "Query servicios:",
      queryStrServicios.substring(0, 500) + "...",
    );
    console.log("Params servicios:", paramsServicios);

    const serviceSalesResult = await query(queryStrServicios, paramsServicios);
    console.log(`✅ Servicios encontrados: ${serviceSalesResult.rows.length}`);

    // Combinar resultados
    let allSales = [...productSalesResult.rows, ...serviceSalesResult.rows];

    // Ordenar por fecha descendente
    allSales.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    console.log(
      `📊 Total de ventas encontradas: ${allSales.length} (${productSalesResult.rows.length} productos, ${serviceSalesResult.rows.length} servicios)`,
    );

    // Depurar si hay registros con JSON inválido
    const problematicSales = allSales.filter((sale) => {
      return sale.formaPago === "mixto" && (!sale.efectivo || !sale.qr);
    });

    if (problematicSales.length > 0) {
      console.warn(
        `⚠️ ${problematicSales.length} ventas con detalle_pago problemático encontradas`,
      );
      problematicSales.forEach((sale) => {
        console.log(
          `Venta ID ${sale.id}: formaPago=${sale.formaPago}, efectivo=${sale.efectivo}, qr=${sale.qr}`,
        );
      });
    }

    return allSales;
  } catch (error) {
    console.error("❌ Error in getSales service:", error);
    console.error("Stack trace:", error.stack);

    // Intentar con una consulta más simple para debug
    try {
      console.log("🔄 Intentando consulta simple para debug...");
      const simpleQuery = `
        SELECT 
          vp.id,
          vp.fecha,
          NULL as cliente,
          'Empleado' as empleado,
          'Sucursal' as sucursal,
          'producto' as tipo,
          'Producto' as detalle,
          vp.subtotal::text,
          vp.descuento::text,
          vp.total::text,
          vp.forma_pago as "formaPago",
          0 as efectivo,
          0 as qr,
          NULL as "descripcionDescuento",
          NULL as "justificacionDescuento"
        FROM ventas_productos vp 
        WHERE vp.subtotal > 0 
        LIMIT 5
      `;
      const debugResult = await query(simpleQuery, []);
      console.log(
        `✅ Consulta simple exitosa: ${debugResult.rows.length} registros`,
      );
      return debugResult.rows;
    } catch (debugError) {
      console.error("❌ Error incluso en consulta simple:", debugError);
      throw error; // Re-lanzar el error original
    }
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
