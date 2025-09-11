// src/services/sellProductsService.js
const { query, pool } = require("../../db");

const getProducts = async (userId) => {
  try {
    // Obtener información de la sucursal del usuario
    const userQuery = `
      SELECT 
        e.sucursal_id,
        e.id as empleado_id
      FROM empleados e
      JOIN usuarios u ON e.id = u.empleado_id
      WHERE u.id = $1
    `;
    
    const userResult = await query(userQuery, [userId]);
    
    if (userResult.rows.length === 0) {
      throw new Error("Usuario no encontrado o no es un empleado");
    }
    
    const { sucursal_id, empleado_id } = userResult.rows[0];
    
    // Obtener productos de la sucursal
    const productsQuery = `
      SELECT 
        p.id as idproducto,
        p.nombre,
        p.precio_venta,
        ps.stock
      FROM producto_sucursal ps
      JOIN productos p ON ps.producto_id = p.id
      WHERE ps.sucursal_id = $1 AND p.estado = 1
      ORDER BY p.nombre
    `;
    
    const productsResult = await query(productsQuery, [sucursal_id]);
    return productsResult.rows;
  } catch (error) {
    console.error("Error en getProducts service:", error);
    throw new Error("Error al obtener los productos");
  }
};

const processSale = async (userId, saleData) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Obtener información del empleado y sucursal
    // El campo c.estado es SMALLINT (1 = activa, 0 = inactiva, 2 = otro estado)
    const userQuery = `
      SELECT 
        e.id as empleado_id,
        e.sucursal_id,
        c.id as caja_id
      FROM empleados e
      JOIN usuarios u ON e.id = u.empleado_id
      LEFT JOIN cajas c ON e.sucursal_id = c.sucursal_id AND c.estado = 1 -- 1 = activa
      WHERE u.id = $1
      LIMIT 1
    `;
    
    const userResult = await client.query(userQuery, [userId]);
    
    if (userResult.rows.length === 0) {
      throw new Error("Usuario no encontrado o no es un empleado");
    }
    
    const { empleado_id, sucursal_id, caja_id } = userResult.rows[0];
    
    if (!caja_id) {
      throw new Error("No hay caja activa para esta sucursal");
    }
    
    // 2. Verificar si hay un estado_caja abierto para esta caja
    const estadoCajaQuery = `
      SELECT id 
      FROM estado_caja 
      WHERE caja_id = $1 AND estado = 'abierta'
      LIMIT 1
    `;
    
    const estadoCajaResult = await client.query(estadoCajaQuery, [caja_id]);
    
    if (estadoCajaResult.rows.length === 0) {
      throw new Error("No hay caja abierta para realizar ventas");
    }
    
    // 3. Insertar venta en ventas_productos
    const insertSaleQuery = `
      INSERT INTO ventas_productos (
        subtotal, descuento, descripcion_descuento, total, 
        forma_pago, detalle_pago, sucursal_id, empleado_id, caja_id, fecha
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING id
    `;
    
    const saleValues = [
      saleData.subtotal,
      saleData.descuento,
      saleData.descripcion_descuento || '',
      saleData.total,
      saleData.forma_pago,
      saleData.detalle_pago || '',
      sucursal_id,
      empleado_id,
      caja_id
    ];
    
    const saleResult = await client.query(insertSaleQuery, saleValues);
    const ventaId = saleResult.rows[0].id;
    
    // 4. Insertar detalles de venta y actualizar stock
    for (const producto of saleData.productos) {
      // Insertar detalle de venta
      const insertDetailQuery = `
        INSERT INTO detalle_venta_productos (
          venta_producto_id, producto_id, cantidad, precio_unitario, subtotal
        ) VALUES ($1, $2, $3, $4, $5)
      `;
      
      await client.query(insertDetailQuery, [
        ventaId,
        producto.producto_id,
        producto.cantidad,
        producto.precio_unitario,
        producto.subtotal
      ]);
      
      // Actualizar stock
      const updateStockQuery = `
        UPDATE producto_sucursal 
        SET stock = stock - $1
        WHERE producto_id = $2 AND sucursal_id = $3
      `;
      
      await client.query(updateStockQuery, [
        producto.cantidad,
        producto.producto_id,
        sucursal_id
      ]);
    }
    
    // 5. Si el pago es en efectivo, registrar en transacciones_caja
    if (saleData.forma_pago === 'efectivo' || saleData.forma_pago === 'mixto') {
      let montoEfectivo = 0;
      
      if (saleData.forma_pago === 'efectivo') {
        montoEfectivo = saleData.total;
      } else if (saleData.forma_pago === 'mixto') {
        // Extraer monto en efectivo del detalle de pago
        const efectivoMatch = saleData.detalle_pago.match(/Efectivo: Bs\. (\d+\.?\d*)/);
        if (efectivoMatch) {
          montoEfectivo = parseFloat(efectivoMatch[1]);
        }
      }
      
      if (montoEfectivo > 0) {
        const insertTransactionQuery = `
          INSERT INTO transacciones_caja (
            caja_id, tipo, descripcion, monto, fecha, usuario_id
          ) VALUES ($1, 'ingreso', 'Venta de productos', $2, NOW(), $3)
        `;
        
        await client.query(insertTransactionQuery, [
          caja_id,
          montoEfectivo,
          userId
        ]);
        
        // Actualizar estado de caja (monto_final)
        const updateCajaQuery = `
          UPDATE estado_caja 
          SET monto_final = monto_final + $1
          WHERE caja_id = $2 AND estado = 'abierta'
        `;
        
        await client.query(updateCajaQuery, [montoEfectivo, caja_id]);
      }
    }
    
    await client.query('COMMIT');
    
    return {
      idventa: ventaId,
      mensaje: "Venta procesada correctamente"
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error en processSale service:", error);
    throw new Error("Error al procesar la venta: " + error.message);
  } finally {
    client.release();
  }
};

module.exports = {
  getProducts,
  processSale
};