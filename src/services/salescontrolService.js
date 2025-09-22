const { query } = require("../../db");

const getSales = async (filters = {}) => {
  try {
    const { 
      dateFilterType, 
      specificDate, 
      startDate, 
      endDate, 
      sucursal,
      empleadoId
    } = filters;
    
    // Obtener ventas de productos
    let productQuery = `
      SELECT 
        CONCAT('P-', vp.id) AS id,
        TO_CHAR(vp.fecha, 'YYYY-MM-DD HH24:MI') AS fecha,
        NULL AS cliente,
        CONCAT(pe.nombres, ' ', pe.apellidos) AS empleado,
        s.nombre AS sucursal,
        'producto' AS tipo,
        STRING_AGG(CONCAT(p.nombre, ' x', dvp.cantidad, ' (Bs. ', dvp.precio_unitario, ')'), ', ') AS detalle,
        vp.subtotal::text,
        vp.descuento::text,
        vp.total::text,
        vp.forma_pago AS "formaPago",
        vp.detalle_pago AS "detallePago",
        vp.descripcion_descuento AS "justificacionDescuento"
      FROM ventas_productos vp
      JOIN sucursales s ON vp.sucursal_id = s.id
      JOIN empleados e ON vp.empleado_id = e.id
      JOIN personas pe ON e.persona_id = pe.id
      JOIN detalle_venta_productos dvp ON vp.id = dvp.venta_producto_id
      JOIN productos p ON dvp.producto_id = p.id
    `;
    
    // Obtener ventas de servicios
    let serviceQuery = `
      SELECT 
        CONCAT('S-', vs.id) AS id,
        TO_CHAR(vs.fecha, 'YYYY-MM-DD HH24:MI') AS fecha,
        CONCAT(pc.nombres, ' ', pc.apellidos) AS cliente,
        CONCAT(pe.nombres, ' ', pe.apellidos) AS empleado,
        s.nombre AS sucursal,
        'servicio' AS tipo,
        STRING_AGG(se.nombre, ', ') AS detalle,
        vs.subtotal::text,
        vs.descuento::text,
        vs.total::text,
        vs.forma_pago AS "formaPago",
        vs.detalle_pago AS "detallePago",
        vs.descripcion_descuento AS "justificacionDescuento"
      FROM ventas_servicios vs
      JOIN sucursales s ON vs.sucursal_id = s.id
      JOIN personas pc ON vs.persona_id = pc.id
      JOIN empleados e ON vs.empleado_id = e.id
      JOIN personas pe ON e.persona_id = pe.id
      JOIN detalle_venta_servicios dvs ON vs.id = dvs.venta_servicio_id
      JOIN inscripciones i ON dvs.inscripcion_id = i.id
      JOIN servicios se ON i.servicio_id = se.id
    `;
    
    // Aplicar filtros
    const whereConditions = [];
    const queryParams = [];
    let paramCount = 0;
    
    // Por defecto, si no hay filtros específicos, mostrar solo el día actual
    if ((!dateFilterType || dateFilterType === 'specific') && !specificDate && !startDate && !endDate) {
      whereConditions.push(`DATE(fecha) = CURRENT_DATE`);
    } 
    // Filtro de fecha específica
    else if (dateFilterType === 'specific' && specificDate) {
      whereConditions.push(`DATE(fecha) = $${++paramCount}`);
      queryParams.push(specificDate);
    } 
    // Filtro de rango de fechas
    else if (dateFilterType === 'range' && startDate && endDate) {
      whereConditions.push(`DATE(fecha) BETWEEN $${++paramCount} AND $${++paramCount}`);
      queryParams.push(startDate, endDate);
    }
    
    // Filtro de sucursal
    if (sucursal && sucursal !== 'all') {
      whereConditions.push(`s.id = $${++paramCount}`);
      queryParams.push(parseInt(sucursal));
    }
    
    // Filtro de empleado (para recepcionistas)
    if (empleadoId) {
      whereConditions.push(`e.id = $${++paramCount}`);
      queryParams.push(parseInt(empleadoId));
    }
    
    // Añadir condiciones WHERE si existen
    if (whereConditions.length > 0) {
      const whereClause = ' WHERE ' + whereConditions.join(' AND ');
      productQuery += whereClause;
      serviceQuery += whereClause;
    }
    
    // Añadir GROUP BY y ORDER BY
    productQuery += `
      GROUP BY vp.id, vp.fecha, s.nombre, pe.nombres, pe.apellidos,
              vp.subtotal, vp.descuento, vp.total, vp.forma_pago, vp.detalle_pago,
              vp.descripcion_descuento
      ORDER BY vp.fecha DESC
    `;
    
    serviceQuery += `
      GROUP BY vs.id, vs.fecha, s.nombre, pc.nombres, pc.apellidos, 
              pe.nombres, pe.apellidos,
              vs.subtotal, vs.descuento, vs.total, vs.forma_pago, vs.detalle_pago,
              vs.descripcion_descuento
      ORDER BY vs.fecha DESC
    `;
    
    // Ejecutar ambas consultas
    const productSales = await query(productQuery, queryParams);
    const serviceSales = await query(serviceQuery, queryParams);
    
    // Combinar resultados
    const allSales = [...productSales.rows, ...serviceSales.rows];
    
    // Función para parsear montos de pago mixto
    const parseMixedPayment = (detallePago) => {
      let efectivo = 0;
      let qr = 0;
      
      if (!detallePago) return { efectivo, qr };
      
      try {
        // Buscar efectivo
        const efectivoRegex = /Efectivo:\s*(?:Bs\.\s*)?([\d.,]+)/i;
        const efectivoMatch = detallePago.match(efectivoRegex);
        if (efectivoMatch && efectivoMatch[1]) {
          efectivo = parseFloat(efectivoMatch[1].replace(',', ''));
        }
        
        // Buscar QR
        const qrRegex = /QR:\s*(?:Bs\.\s*)?([\d.,]+)/i;
        const qrMatch = detallePago.match(qrRegex);
        if (qrMatch && qrMatch[1]) {
          qr = parseFloat(qrMatch[1].replace(',', ''));
        }
        
      } catch (error) {
        console.error("Error parsing mixed payment:", error);
      }
      
      return { efectivo, qr };
    };
    
    // Procesar pagos mixtos
    return allSales.map(sale => {
      // Convertir valores numéricos
      const processedSale = {
        id: sale.id,
        fecha: sale.fecha,
        cliente: sale.cliente,
        empleado: sale.empleado,
        sucursal: sale.sucursal,
        tipo: sale.tipo,
        detalle: sale.detalle,
        subtotal: parseFloat(sale.subtotal),
        descuento: parseFloat(sale.descuento),
        total: parseFloat(sale.total),
        formaPago: sale.formaPago,
        justificacionDescuento: sale.justificacionDescuento
      };
      
      // Procesar pagos según el tipo
      if (sale.formaPago === 'mixto') {
        const { efectivo, qr } = parseMixedPayment(sale.detallePago);
        processedSale.efectivo = efectivo;
        processedSale.qr = qr;
      } else if (sale.formaPago === 'efectivo') {
        processedSale.efectivo = parseFloat(sale.total);
      } else if (sale.formaPago === 'qr') {
        processedSale.qr = parseFloat(sale.total);
      }
      
      return processedSale;
    });
    
  } catch (error) {
    console.error("Error in getSales service:", error);
    throw new Error("Error al obtener las ventas");
  }
};

const getSaleDetails = async (saleId, saleType) => {
  try {
    let details = {};
    
    if (saleType === 'producto') {
      // Obtener detalles de venta de productos
      const productId = saleId.replace('P-', '');
      
      // Consulta para obtener información general de la venta
      const saleQuery = `
        SELECT 
          vp.*,
          s.nombre as sucursal_nombre,
          CONCAT(pe.nombres, ' ', pe.apellidos) as empleado_nombre,
          vp.descripcion_descuento as "descripcionDescuento"
        FROM ventas_productos vp
        JOIN sucursales s ON vp.sucursal_id = s.id
        JOIN empleados e ON vp.empleado_id = e.id
        JOIN personas pe ON e.persona_id = pe.id
        WHERE vp.id = $1
      `;
      
      // Consulta para obtener los productos vendidos
      const productsQuery = `
        SELECT 
          p.nombre,
          dvp.cantidad,
          dvp.precio_unitario,
          dvp.subtotal
        FROM detalle_venta_productos dvp
        JOIN productos p ON dvp.producto_id = p.id
        WHERE dvp.venta_producto_id = $1
      `;
      
      const [saleResult, productsResult] = await Promise.all([
        query(saleQuery, [productId]),
        query(productsQuery, [productId])
      ]);
      
      if (saleResult.rows.length > 0) {
        const saleData = saleResult.rows[0];
        details = {
          descripcionDescuento: saleData.descripcionDescuento,
          items: productsResult.rows.map(row => ({
            nombre: row.nombre,
            cantidad: parseInt(row.cantidad) || 1,
            precio_unitario: parseFloat(row.precio_unitario) || 0,
            subtotal: parseFloat(row.subtotal) || 0
          })),
          additionalInfo: {
            'Caja ID': saleData.caja_id,
            'Sucursal ID': saleData.sucursal_id,
            'Empleado ID': saleData.empleado_id
          }
        };
      }
      
    } else if (saleType === 'servicio') {
      // Obtener detalles de venta de servicios
      const serviceId = saleId.replace('S-', '');
      
      // Consulta para obtener información general de la venta
      const saleQuery = `
        SELECT 
          vs.*,
          s.nombre as sucursal_nombre,
          CONCAT(pe.nombres, ' ', pe.apellidos) as empleado_nombre,
          CONCAT(pc.nombres, ' ', pc.apellidos) as cliente_nombre,
          vs.descripcion_descuento as "descripcionDescuento"
        FROM ventas_servicios vs
        JOIN sucursales s ON vs.sucursal_id = s.id
        JOIN empleados e ON vs.empleado_id = e.id
        JOIN personas pe ON e.persona_id = pe.id
        JOIN personas pc ON vs.persona_id = pc.id
        WHERE vs.id = $1
      `;
      
      // Consulta para obtener los servicios vendidos
      const servicesQuery = `
        SELECT 
          se.nombre,
          i.fecha_inicio,
          i.fecha_vencimiento,
          dvs.precio
        FROM detalle_venta_servicios dvs
        JOIN inscripciones i ON dvs.inscripcion_id = i.id
        JOIN servicios se ON i.servicio_id = se.id
        WHERE dvs.venta_servicio_id = $1
      `;
      
      const [saleResult, servicesResult] = await Promise.all([
        query(saleQuery, [serviceId]),
        query(servicesQuery, [serviceId])
      ]);
      
      if (saleResult.rows.length > 0) {
        const saleData = saleResult.rows[0];
        details = {
          descripcionDescuento: saleData.descripcionDescuento,
          items: servicesResult.rows.map(row => ({
            nombre: row.nombre,
            fecha_inicio: row.fecha_inicio,
            fecha_vencimiento: row.fecha_vencimiento,
            precio: parseFloat(row.precio) || 0
          })),
        };
      }
    }
    
    return details;
    
  } catch (error) {
    console.error("Error in getSaleDetails service:", error);
    throw new Error("Error al obtener los detalles de la venta");
  }
};

const getSucursales = async () => {
  try {
    const result = await query(`
      SELECT id, nombre 
      FROM sucursales 
      WHERE estado = 1 
      ORDER BY nombre
    `);
    
    return result.rows.map(row => ({
      id: row.id.toString(),
      name: row.nombre
    }));
  } catch (error) {
    console.error("Error in getSucursales service:", error);
    throw new Error("Error al obtener las sucursales");
  }
};

module.exports = {
  getSales,
  getSaleDetails,
  getSucursales
};