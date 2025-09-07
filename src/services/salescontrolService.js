// src/services/salescontrolService.js
const { query } = require("../../db");
const bcrypt = require("bcrypt");

const getSales = async (filters = {}) => {
  try {
    const { 
      dateFilterType, 
      specificDate, 
      startDate, 
      endDate, 
      sucursal 
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
        CASE 
          WHEN vp.forma_pago = 'efectivo' THEN vp.total::text
          WHEN vp.forma_pago = 'qr' THEN NULL
          ELSE NULL
        END AS efectivo,
        CASE 
          WHEN vp.forma_pago = 'qr' THEN vp.total::text
          WHEN vp.forma_pago = 'efectivo' THEN NULL
          ELSE NULL
        END AS qr,
        CASE 
          WHEN vp.forma_pago = 'mixto' THEN 
            SPLIT_PART(vp.detalle_pago, '|', 1) || ' | ' || SPLIT_PART(vp.detalle_pago, '|', 2)
          ELSE NULL
        END AS "detallePago",
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
        CASE 
          WHEN vs.forma_pago = 'efectivo' THEN vs.total::text
          WHEN vs.forma_pago = 'qr' THEN NULL
          ELSE NULL
        END AS efectivo,
        CASE 
          WHEN vs.forma_pago = 'qr' THEN vs.total::text
          WHEN vs.forma_pago = 'efectivo' THEN NULL
          ELSE NULL
        END AS qr,
        CASE 
          WHEN vs.forma_pago = 'mixto' THEN 
            SPLIT_PART(vs.detalle_pago, '|', 1) || ' | ' || SPLIT_PART(vs.detalle_pago, '|', 2)
          ELSE NULL
        END AS "detallePago",
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
    
    // Filtro de fecha
    if (dateFilterType === 'specific' && specificDate) {
      whereConditions.push(`DATE(fecha) = $${++paramCount}`);
      queryParams.push(specificDate);
    } else if (dateFilterType === 'range' && startDate && endDate) {
      whereConditions.push(`DATE(fecha) BETWEEN $${++paramCount} AND $${++paramCount}`);
      queryParams.push(startDate, endDate);
    }
    
    // Filtro de sucursal
    if (sucursal && sucursal !== 'all') {
      whereConditions.push(`s.id = $${++paramCount}`);
      queryParams.push(parseInt(sucursal));
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
    
    // Procesar pagos mixtos
    return allSales.map(sale => {
      if (sale.formaPago === 'mixto' && sale.detallePago) {
        const [efectivoPart, qrPart] = sale.detallePago.split('|');
        const efectivoMatch = efectivoPart.match(/Efectivo:\s*Bs\.\s*([\d.]+)/);
        const qrMatch = qrPart.match(/QR:\s*Bs\.\s*([\d.]+)/);
        
        if (efectivoMatch && qrMatch) {
          sale.efectivo = parseFloat(efectivoMatch[1]).toFixed(2);
          sale.qr = parseFloat(qrMatch[1]).toFixed(2);
        }
      }
      return sale;
    });
    
  } catch (error) {
    console.error("Error in getSales service:", error);
    throw new Error("Error al obtener las ventas");
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
  getSucursales
};