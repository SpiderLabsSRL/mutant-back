const { query, pool } = require("../../db");

const getAllProducts = async (sucursalId) => {
  let sql = `
    SELECT 
      p.id as idproducto, 
      p.nombre, 
      p.precio_venta, 
      p.estado
    FROM productos p
    WHERE p.estado IN (0, 1)
  `;
  
  if (sucursalId) {
    sql += `
      AND p.id IN (
        SELECT producto_id 
        FROM producto_sucursal 
        WHERE sucursal_id = $1
      )
    `;
  }
  
  sql += ` ORDER BY p.nombre`;
  
  const params = sucursalId ? [sucursalId] : [];
  const result = await query(sql, params);
  return result.rows;
};

const getProductById = async (id) => {
  const result = await query(
    `SELECT 
      p.id as idproducto, 
      p.nombre, 
      p.precio_venta, 
      p.estado
    FROM productos p
    WHERE p.id = $1 AND p.estado IN (0, 1)`,
    [id]
  );
  return result.rows[0];
};

const createProduct = async (nombre, precio_venta, sucursales, stock_por_sucursal, sin_stock) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Insertar producto
    const productResult = await client.query(
      `INSERT INTO productos (nombre, precio_venta, estado)
       VALUES ($1, $2, 1)
       RETURNING id`,
      [nombre, precio_venta]
    );
    
    const productId = productResult.rows[0].id;
    
    // Insertar stock por sucursal
    for (const sucursalId of sucursales) {
      let stock = stock_por_sucursal[sucursalId];
      
      // Si es producto sin stock, establecer como NULL
      if (sin_stock) {
        stock = null;
      } else {
        // Si no es sin stock, asegurar que sea un número válido
        stock = stock !== undefined && stock !== null ? parseInt(stock) : 0;
        if (isNaN(stock)) stock = 0;
      }
      
      await client.query(
        `INSERT INTO producto_sucursal (producto_id, sucursal_id, stock)
         VALUES ($1, $2, $3)`,
        [productId, sucursalId, stock]
      );
    }
    
    await client.query('COMMIT');
    
    // Devolver el producto creado
    const newProduct = await getProductById(productId);
    return newProduct;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const updateProduct = async (id, nombre, precio_venta, sucursales, stock_por_sucursal, sin_stock) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Actualizar producto - CORREGIDO: $3 en lugar de $4
    await client.query(
      `UPDATE productos 
       SET nombre = $1, precio_venta = $2
       WHERE id = $3`,
      [nombre, precio_venta, id]
    );
    
    // Eliminar relaciones existentes
    await client.query(
      `DELETE FROM producto_sucursal WHERE producto_id = $1`,
      [id]
    );
    
    // Insertar nuevas relaciones
    for (const sucursalId of sucursales) {
      let stock = stock_por_sucursal[sucursalId];
      
      // Si es producto sin stock, establecer como NULL
      if (sin_stock) {
        stock = null;
      } else {
        // Si no es sin stock, asegurar que sea un número válido
        stock = stock !== undefined && stock !== null ? parseInt(stock) : 0;
        if (isNaN(stock)) stock = 0;
      }
      
      await client.query(
        `INSERT INTO producto_sucursal (producto_id, sucursal_id, stock)
         VALUES ($1, $2, $3)`,
        [id, sucursalId, stock]
      );
    }
    
    await client.query('COMMIT');
    
    // Devolver el producto actualizado
    const updatedProduct = await getProductById(id);
    return updatedProduct;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const deleteProduct = async (id) => {
  await query(
    `UPDATE productos SET estado = 2 WHERE id = $1`,
    [id]
  );
};

const toggleProductStatus = async (id) => {
  const result = await query(
    `UPDATE productos 
     SET estado = CASE WHEN estado = 1 THEN 0 ELSE 1 END 
     WHERE id = $1 
     RETURNING id, nombre, precio_venta, estado`,
    [id]
  );
  
  if (result.rows.length === 0) {
    throw new Error("Producto no encontrado");
  }
  
  return result.rows[0];
};

const getProductStock = async (id, sucursalId) => {
  let sql = `
    SELECT 
      ps.id as idproducto_sucursal,
      ps.producto_id,
      ps.sucursal_id,
      ps.stock,
      s.nombre as sucursal_nombre
    FROM producto_sucursal ps
    INNER JOIN sucursales s ON ps.sucursal_id = s.id
    WHERE ps.producto_id = $1 AND s.estado = 1
  `;
  
  const params = [id];
  
  if (sucursalId) {
    sql += ` AND ps.sucursal_id = $2`;
    params.push(sucursalId);
  }
  
  const result = await query(sql, params);
  return result.rows;
};

const addStock = async (productId, sucursalId, cantidad) => {
  // Verificar si el producto tiene stock (no es NULL)
  const checkResult = await query(
    `SELECT stock FROM producto_sucursal 
     WHERE producto_id = $1 AND sucursal_id = $2`,
    [productId, sucursalId]
  );
  
  if (checkResult.rows.length === 0) {
    throw new Error("Producto no encontrado en la sucursal especificada");
  }
  
  const currentStock = checkResult.rows[0].stock;
  
  // Si el stock actual es NULL, no se puede agregar stock
  if (currentStock === null) {
    throw new Error("No se puede agregar stock a un producto configurado como 'sin stock'");
  }
  
  await query(
    `UPDATE producto_sucursal 
     SET stock = stock + $1 
     WHERE producto_id = $2 AND sucursal_id = $3`,
    [cantidad, productId, sucursalId]
  );
};

const getSucursales = async () => {
  const result = await query(
    `SELECT id, nombre FROM sucursales WHERE estado = 1 ORDER BY nombre`
  );
  return result.rows;
};

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductStatus,
  getProductStock,
  addStock,
  getSucursales
};