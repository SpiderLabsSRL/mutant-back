const { query, pool } = require("../../db");

// ============================================
// HELPERS
// ============================================

const bufferToDataUrl = (buffer) => {
  if (!buffer) return null;
  if (typeof buffer === "string") return buffer;
  if (Buffer.isBuffer(buffer)) {
    return `data:image/png;base64,${buffer.toString("base64")}`;
  }
  return null;
};

const dataUrlToBuffer = (dataUrl) => {
  if (!dataUrl) return null;
  if (typeof dataUrl === "string" && dataUrl.startsWith("data:")) {
    const base64 = dataUrl.split(",")[1];
    if (!base64) return null;
    return Buffer.from(base64, "base64");
  }
  if (typeof dataUrl === "string") {
    try {
      return Buffer.from(dataUrl, "base64");
    } catch {
      return null;
    }
  }
  return null;
};

// ============================================
// GET ALL PRODUCTS
// ============================================
const getAllProducts = async (sucursalId) => {
  let sql = `
    SELECT 
      p.id AS idproducto, 
      p.nombre, 
      p.descripcion,
      p.precio_venta, 
      p.precio_compra,
      p.codigo,
      p.imagen,
      p.landing,
      p.estado
    FROM productos p
    WHERE p.estado IN (0, 1)
  `;

  const params = [];

  if (sucursalId) {
    sql += `
      AND p.id IN (
        SELECT producto_id 
        FROM producto_sucursal 
        WHERE sucursal_id = $1
      )
    `;
    params.push(sucursalId);
  }

  sql += ` ORDER BY p.nombre`;

  const result = await query(sql, params);

  return result.rows.map((row) => ({
    ...row,
    imagen: bufferToDataUrl(row.imagen),
  }));
};

// ============================================
// GET PRODUCT BY ID
// ============================================
const getProductById = async (id) => {
  const result = await query(
    `SELECT 
      p.id AS idproducto, 
      p.nombre, 
      p.descripcion,
      p.precio_venta, 
      p.precio_compra,
      p.codigo,
      p.imagen,
      p.landing,
      p.estado
    FROM productos p
    WHERE p.id = $1 AND p.estado IN (0, 1)`,
    [id]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    ...row,
    imagen: bufferToDataUrl(row.imagen),
  };
};

// ============================================
// CREATE PRODUCT
// ============================================
const createProduct = async (data) => {
  const {
    nombre,
    precio_venta,
    sucursales,
    stock_por_sucursal,
    sin_stock,
    precio_compra,
    codigo,
    stock_minimo_por_sucursal,
    imagen,
    landing,
  } = data;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const imagenBuffer = dataUrlToBuffer(imagen);

    const productResult = await client.query(
      `INSERT INTO productos 
        (nombre, descripcion, precio_venta, precio_compra, codigo, imagen, landing, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
       RETURNING id`,
      [
        nombre,
        null,
        precio_venta,
        precio_compra || 0,
        codigo || null,
        imagenBuffer,
        landing || false,
      ]
    );

    const productId = productResult.rows[0].id;

    for (const sucursalId of sucursales) {
      let stock = stock_por_sucursal?.[sucursalId];

      if (sin_stock) {
        stock = null;
      } else {
        stock = stock !== undefined && stock !== null ? parseInt(stock) : 0;
        if (isNaN(stock)) stock = 0;
      }

      const stockMinimo = stock_minimo_por_sucursal?.[sucursalId];
      const stockMinimoValue =
        stockMinimo !== undefined && stockMinimo !== null && stockMinimo !== ""
          ? parseInt(stockMinimo)
          : null;

      await client.query(
        `INSERT INTO producto_sucursal (producto_id, sucursal_id, stock, stock_minimo)
         VALUES ($1, $2, $3, $4)`,
        [productId, sucursalId, stock, stockMinimoValue]
      );
    }

    await client.query("COMMIT");

    return await getProductById(productId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// UPDATE PRODUCT
// ============================================
const updateProduct = async (id, data) => {
  const {
    nombre,
    precio_venta,
    sucursales,
    stock_por_sucursal,
    sin_stock,
    precio_compra,
    codigo,
    stock_minimo_por_sucursal,
    imagen,
    landing,
  } = data;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const imagenBuffer = dataUrlToBuffer(imagen);

    if (imagen !== undefined && imagen !== null) {
      await client.query(
        `UPDATE productos 
         SET nombre = $1, precio_venta = $2, precio_compra = $3, codigo = $4, imagen = $5, landing = $6
         WHERE id = $7`,
        [
          nombre,
          precio_venta,
          precio_compra || 0,
          codigo || null,
          imagenBuffer,
          landing || false,
          id,
        ]
      );
    } else {
      await client.query(
        `UPDATE productos 
         SET nombre = $1, precio_venta = $2, precio_compra = $3, codigo = $4, landing = $5
         WHERE id = $6`,
        [
          nombre,
          precio_venta,
          precio_compra || 0,
          codigo || null,
          landing || false,
          id,
        ]
      );
    }

    await client.query(`DELETE FROM producto_sucursal WHERE producto_id = $1`, [id]);

    for (const sucursalId of sucursales) {
      let stock = stock_por_sucursal?.[sucursalId];

      if (sin_stock) {
        stock = null;
      } else {
        stock = stock !== undefined && stock !== null ? parseInt(stock) : 0;
        if (isNaN(stock)) stock = 0;
      }

      const stockMinimo = stock_minimo_por_sucursal?.[sucursalId];
      const stockMinimoValue =
        stockMinimo !== undefined && stockMinimo !== null && stockMinimo !== ""
          ? parseInt(stockMinimo)
          : null;

      await client.query(
        `INSERT INTO producto_sucursal (producto_id, sucursal_id, stock, stock_minimo)
         VALUES ($1, $2, $3, $4)`,
        [id, sucursalId, stock, stockMinimoValue]
      );
    }

    await client.query("COMMIT");

    return await getProductById(id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// DELETE PRODUCT (soft delete)
// ============================================
const deleteProduct = async (id) => {
  await query(`UPDATE productos SET estado = 2 WHERE id = $1`, [id]);
};

// ============================================
// TOGGLE PRODUCT STATUS
// ============================================
const toggleProductStatus = async (id) => {
  const result = await query(
    `UPDATE productos 
     SET estado = CASE WHEN estado = 1 THEN 0 ELSE 1 END 
     WHERE id = $1 
     RETURNING id, nombre, descripcion, precio_venta, precio_compra, codigo, imagen, landing, estado`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error("Producto no encontrado");
  }

  const row = result.rows[0];
  return {
    ...row,
    imagen: bufferToDataUrl(row.imagen),
  };
};

// ============================================
// TOGGLE PRODUCT LANDING
// ============================================
const toggleProductLanding = async (id) => {
  const result = await query(
    `UPDATE productos 
     SET landing = NOT landing 
     WHERE id = $1 
     RETURNING id, nombre, descripcion, precio_venta, precio_compra, codigo, imagen, landing, estado`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error("Producto no encontrado");
  }

  const row = result.rows[0];
  return {
    ...row,
    imagen: bufferToDataUrl(row.imagen),
  };
};

// ============================================
// GET PRODUCT STOCK
// ============================================
const getProductStock = async (id, sucursalId) => {
  let sql = `
    SELECT 
      ps.id AS idproducto_sucursal,
      ps.producto_id,
      ps.sucursal_id,
      ps.stock,
      ps.stock_minimo,
      s.nombre AS sucursal_nombre
    FROM producto_sucursal ps
    INNER JOIN sucursales s ON ps.sucursal_id = s.id
    WHERE ps.producto_id = $1 AND s.estado = 1
  `;

  const params = [id];

  if (sucursalId) {
    sql += ` AND ps.sucursal_id = $2`;
    params.push(sucursalId);
  }

  sql += ` ORDER BY s.nombre`;

  const result = await query(sql, params);
  return result.rows;
};

// ============================================
// ADD STOCK (con registro de movimiento)
// ============================================
const addStock = async (productId, sucursalId, cantidad, usuarioId) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1) Bloqueamos la fila para evitar race conditions
    const checkResult = await client.query(
      `SELECT stock FROM producto_sucursal 
       WHERE producto_id = $1 AND sucursal_id = $2
       FOR UPDATE`,
      [productId, sucursalId]
    );

    if (checkResult.rows.length === 0) {
      throw new Error("Producto no encontrado en la sucursal especificada");
    }

    const currentStock = checkResult.rows[0].stock;

    if (currentStock === null) {
      throw new Error(
        "No se puede agregar stock a un producto configurado como 'sin stock'"
      );
    }

    const cantidadNum = parseInt(cantidad);
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      throw new Error("La cantidad debe ser mayor a 0");
    }

    if (!usuarioId) {
      throw new Error(
        "No se pudo identificar al usuario que realiza el movimiento de stock"
      );
    }

    const stockAnterior = parseInt(currentStock) || 0;
    const stockNuevo = stockAnterior + cantidadNum;

    // 2) Actualizar stock
    await client.query(
      `UPDATE producto_sucursal 
       SET stock = $1 
       WHERE producto_id = $2 AND sucursal_id = $3`,
      [stockNuevo, productId, sucursalId]
    );

    // 3) Registrar movimiento (auditoría)
    await client.query(
      `INSERT INTO movimientos_stock (
        producto_id,
        sucursal_id,
        usuario_id,
        cantidad_anterior,
        cantidad_nueva,
        cantidad_modificada,
        descripcion
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        productId,
        sucursalId,
        usuarioId,
        stockAnterior,
        stockNuevo,
        cantidadNum,
        `Adición de stock: +${cantidadNum} unidades (${stockAnterior} → ${stockNuevo})`,
      ]
    );

    await client.query("COMMIT");

    return {
      success: true,
      stockAnterior,
      stockNuevo,
      cantidadAgregada: cantidadNum,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// GET SUCURSALES
// ============================================
const getSucursales = async () => {
  const result = await query(
    `SELECT id, nombre FROM sucursales WHERE estado = 1 ORDER BY nombre`
  );
  return result.rows;
};

// ============================================
// EXPORTS
// ============================================
module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductStatus,
  toggleProductLanding,
  getProductStock,
  addStock,
  getSucursales,
};