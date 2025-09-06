const { query } = require("../../db");

const getAllProducts = async () => {
  const result = await query(
    `SELECT 
      p.id as idproducto, 
      p.nombre, 
      p.precio_compra, 
      p.precio_venta, 
      p.proveedor, 
      p.estado
    FROM productos p
    WHERE p.estado IN (0, 1)
    ORDER BY p.nombre`
  );
  return result.rows;
};

const getProductById = async (id) => {
  const result = await query(
    `SELECT 
      p.id as idproducto, 
      p.nombre, 
      p.precio_compra, 
      p.precio_venta, 
      p.proveedor, 
      p.estado
    FROM productos p
    WHERE p.id = $1 AND p.estado IN (0, 1)`,
    [id]
  );
  return result.rows[0];
};

const createProduct = async (nombre, precio_compra, precio_venta, proveedor, sucursales, stock_por_sucursal) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Insertar producto
    const productResult = await client.query(
      `INSERT INTO productos (nombre, precio_compra, precio_venta, proveedor, estado)
       VALUES ($1, $2, $3, $4, 1)
       RETURNING id`,
      [nombre, precio_compra, precio_venta, proveedor]
    );
    
    const productId = productResult.rows[0].id;
    
    // Insertar stock por sucursal
    for (const sucursalId of sucursales) {
      const stock = stock_por_sucursal[sucursalId] || 0;
      
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

const updateProduct = async (id, nombre, precio_compra, precio_venta, proveedor, sucursales, stock_por_sucursal) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Actualizar producto
    await client.query(
      `UPDATE productos 
       SET nombre = $1, precio_compra = $2, precio_venta = $3, proveedor = $4
       WHERE id = $5`,
      [nombre, precio_compra, precio_venta, proveedor, id]
    );
    
    // Eliminar relaciones existentes
    await client.query(
      `DELETE FROM producto_sucursal WHERE producto_id = $1`,
      [id]
    );
    
    // Insertar nuevas relaciones
    for (const sucursalId of sucursales) {
      const stock = stock_por_sucursal[sucursalId] || 0;
      
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
     RETURNING *`,
    [id]
  );
  return result.rows[0];
};

const getProductStock = async (id) => {
  const result = await query(
    `SELECT 
      ps.id as idproducto_sucursal,
      ps.producto_id,
      ps.sucursal_id,
      ps.stock,
      s.nombre as sucursal_nombre
    FROM producto_sucursal ps
    INNER JOIN sucursales s ON ps.sucursal_id = s.id
    WHERE ps.producto_id = $1 AND s.estado = 1`,
    [id]
  );
  return result.rows;
};

const addStock = async (productId, sucursalId, cantidad) => {
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