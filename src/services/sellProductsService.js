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
    
    // Obtener productos de la sucursal incluyendo información de sin_stock
    const productsQuery = `
      SELECT 
        p.id as idproducto,
        p.nombre,
        p.precio_venta,
        ps.stock,
        -- Determinar si es producto sin stock (stock es NULL)
        CASE WHEN ps.stock IS NULL THEN true ELSE false END as sin_stock
      FROM producto_sucursal ps
      JOIN productos p ON ps.producto_id = p.id
      WHERE ps.sucursal_id = $1 AND p.estado = 1
      ORDER BY p.nombre
    `;
    
    const productsResult = await query(productsQuery, [sucursal_id]);
    
    // Transformar los resultados para manejar productos sin stock
    const products = productsResult.rows.map(product => {
      // Para productos sin stock, establecer stock como 9999 para indicar ilimitado
      // pero mantener la información de sin_stock
      const stockValue = product.sin_stock ? 9999 : (product.stock || 0);
      
      return {
        idproducto: product.idproducto,
        nombre: product.nombre,
        precio_venta: product.precio_venta,
        stock: stockValue,
        sin_stock: product.sin_stock
      };
    });
    
    return products;
  } catch (error) {
    console.error("Error en getProducts service:", error);
    throw new Error("Error al obtener los productos");
  }
};

const getCashRegisterStatus = async (userId) => {
  try {
    // Obtener información del empleado y sucursal
    const userQuery = `
      SELECT 
        e.sucursal_id,
        c.id as caja_id
      FROM empleados e
      JOIN usuarios u ON e.id = u.empleado_id
      LEFT JOIN cajas c ON e.sucursal_id = c.sucursal_id AND c.estado = 1 -- 1 = activa
      WHERE u.id = $1
      LIMIT 1
    `;
    
    const userResult = await query(userQuery, [userId]);
    
    if (userResult.rows.length === 0) {
      throw new Error("Usuario no encontrado o no es un empleado");
    }
    
    const { sucursal_id, caja_id } = userResult.rows[0];
    
    if (!caja_id) {
      throw new Error("No hay caja activa para esta sucursal");
    }
    
    // Obtener el último estado de caja
    const estadoCajaQuery = `
      SELECT 
        ec.id as estado_caja_id, 
        c.id as caja_id, 
        ec.estado, 
        ec.monto_inicial, 
        ec.monto_final, 
        ec.usuario_id
      FROM cajas c
      INNER JOIN estado_caja ec ON c.id = ec.caja_id
      WHERE c.id = $1
      ORDER BY ec.id DESC
      LIMIT 1
    `;
    
    const estadoCajaResult = await query(estadoCajaQuery, [caja_id]);
    
    if (estadoCajaResult.rows.length === 0) {
      // Si no hay estado de caja, devolver estado cerrada
      return { 
        estado: 'cerrada',
        caja_id: caja_id,
        mensaje: 'No se encontró estado de caja activo'
      };
    }
    
    const estadoCaja = estadoCajaResult.rows[0];
    
    return {
      estado_caja_id: estadoCaja.estado_caja_id,
      caja_id: estadoCaja.caja_id,
      estado: estadoCaja.estado,
      monto_inicial: parseFloat(estadoCaja.monto_inicial) || 0,
      monto_final: parseFloat(estadoCaja.monto_final) || 0,
      usuario_id: estadoCaja.usuario_id
    };
  } catch (error) {
    console.error("Error en getCashRegisterStatus service:", error);
    throw new Error("Error al obtener el estado de la caja");
  }
};

const processSale = async (userId, saleData) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Obtener información del empleado y sucursal
    const userQuery = `
      SELECT 
        e.id as empleado_id,
        e.sucursal_id,
        c.id as caja_id
      FROM empleados e
      JOIN usuarios u ON e.id = u.empleado_id
      LEFT JOIN cajas c ON e.sucursal_id = c.sucursal_id AND c.estado = 1
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
    
    // 2. Verificar que la caja esté abierta
    const estadoCajaQuery = `
      SELECT id, monto_final, estado
      FROM estado_caja 
      WHERE caja_id = $1 
      ORDER BY id DESC 
      LIMIT 1
    `;
    
    const estadoCajaResult = await client.query(estadoCajaQuery, [caja_id]);
    
    if (estadoCajaResult.rows.length === 0) {
      throw new Error("No se encontró estado de caja para esta caja");
    }
    
    const estadoCajaActual = estadoCajaResult.rows[0];
    
    if (estadoCajaActual.estado !== 'abierta') {
      throw new Error("La caja no está abierta para realizar ventas");
    }
    
    const estado_caja_id = estadoCajaActual.id;
    
    // 3. Validar stock antes de procesar la venta
    for (const producto of saleData.productos) {
      // Verificar si el producto existe y obtener información de stock
      const productQuery = `
        SELECT 
          p.nombre,
          ps.stock,
          ps.stock IS NULL as sin_stock
        FROM producto_sucursal ps
        JOIN productos p ON ps.producto_id = p.id
        WHERE ps.producto_id = $1 AND ps.sucursal_id = $2
      `;
      
      const productResult = await client.query(productQuery, [
        producto.producto_id,
        sucursal_id
      ]);
      
      if (productResult.rows.length === 0) {
        throw new Error(`Producto no encontrado en la sucursal`);
      }
      
      const productInfo = productResult.rows[0];
      
      // Solo validar stock si el producto NO es sin stock
      if (!productInfo.sin_stock) {
        const currentStock = productInfo.stock || 0;
        
        if (currentStock < producto.cantidad) {
          throw new Error(`Stock insuficiente para ${productInfo.nombre}. Disponible: ${currentStock}, Solicitado: ${producto.cantidad}`);
        }
      }
    }
    
    // 4. Insertar venta en ventas_productos
    const insertSaleQuery = `
      INSERT INTO ventas_productos (
        subtotal, descuento, descripcion_descuento, total, 
        forma_pago, detalle_pago, sucursal_id, empleado_id, caja_id, fecha
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TIMEZONE('America/La_Paz', NOW()))
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
    
    // 5. Insertar detalles de venta y actualizar stock (solo para productos con stock)
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
      
      // Verificar si el producto tiene stock (no es sin stock) antes de actualizar
      const checkStockQuery = `
        SELECT stock IS NULL as sin_stock
        FROM producto_sucursal 
        WHERE producto_id = $1 AND sucursal_id = $2
      `;
      
      const stockResult = await client.query(checkStockQuery, [
        producto.producto_id,
        sucursal_id
      ]);
      
      if (stockResult.rows.length > 0 && !stockResult.rows[0].sin_stock) {
        // Solo actualizar stock si NO es producto sin stock
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
      // Si es producto sin stock, no se actualiza el stock (permanece NULL)
    }
    
    // 6. Procesar pagos según la forma de pago
    if (saleData.forma_pago === 'efectivo' || saleData.forma_pago === 'mixto') {
      const montoEfectivo = saleData.monto_efectivo || 0;
      
      if (montoEfectivo > 0) {
        // Registrar transacción de caja con estado_caja_id
        const insertTransactionQuery = `
          INSERT INTO transacciones_caja (
            caja_id, estado_caja_id, tipo, descripcion, monto, fecha, usuario_id
          ) VALUES ($1, $2, 'ingreso', 'Venta de productos', $3, TIMEZONE('America/La_Paz', NOW()), $4)
        `;
        
        await client.query(insertTransactionQuery, [
          caja_id,
          estado_caja_id,
          montoEfectivo,
          userId
        ]);
        
        // Actualizar estado de caja (monto_final)
        const updateCajaQuery = `
          UPDATE estado_caja 
          SET monto_final = monto_final + $1
          WHERE id = $2
        `;
        
        await client.query(updateCajaQuery, [montoEfectivo, estado_caja_id]);
      }
    }
    
    // Los pagos QR (tanto puros como la parte QR del pago mixto) NO se registran en transacciones_caja
    
    await client.query('COMMIT');
    
    return {
      idventa: ventaId,
      mensaje: "Venta procesada correctamente"
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error en processSale service:", error);
    
    // Mejorar mensajes de error para el usuario
    if (error.message.includes('stock insuficiente') || error.message.includes('Stock insuficiente')) {
      throw new Error(error.message);
    } else if (error.message.includes('caja no está abierta')) {
      throw new Error("La caja no está abierta. No se pueden realizar ventas.");
    } else if (error.message.includes('no hay caja activa')) {
      throw new Error("No hay caja activa para esta sucursal.");
    } else if (error.message.includes('usuario no encontrado')) {
      throw new Error("Error de autenticación. Por favor, inicie sesión nuevamente.");
    } else {
      throw new Error("Error al procesar la venta: " + error.message);
    }
  } finally {
    client.release();
  }
};

module.exports = {
  getProducts,
  getCashRegisterStatus,
  processSale
};