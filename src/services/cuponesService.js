const { query, pool } = require("../../db");

// ============================================
// GET ALL CUPONES
// ============================================
const getAllCupones = async () => {
  const sql = `
    SELECT 
      c.id,
      c.codigo,
      c.tipo,
      c.valor_descuento,
      c.descripcion,
      c.fecha_inicio,
      c.fecha_fin,
      c.usos,
      c.usos_maximos,
      c.aplica_servicios,
      c.aplica_productos,
      c.estado,
      COALESCE(
        ARRAY_AGG(DISTINCT cs.sucursal_id::text) FILTER (WHERE cs.sucursal_id IS NOT NULL),
        ARRAY[]::text[]
      ) AS sucursales_ids
    FROM cupones c
    LEFT JOIN cupon_sucursal cs ON c.id = cs.cupon_id
    WHERE c.estado IN (0, 1)
    GROUP BY c.id
    ORDER BY c.fecha_inicio DESC, c.id DESC
  `;

  const result = await query(sql);

  return result.rows.map((row) => ({
    id: row.id.toString(),
    codigo: row.codigo,
    tipo: row.tipo,
    valor: parseFloat(row.valor_descuento),
    descripcion: row.descripcion || "",
    fechaInicio: row.fecha_inicio
      ? new Date(row.fecha_inicio).toISOString().split("T")[0]
      : "",
    fechaExpiracion: row.fecha_fin
      ? new Date(row.fecha_fin).toISOString().split("T")[0]
      : "",
    usosMaximos: row.usos_maximos || 0,
    usosActuales: row.usos || 0,
    activo: row.estado === 1,
    aplicableA: [
      ...(row.aplica_servicios ? ["servicios"] : []),
      ...(row.aplica_productos ? ["productos"] : []),
    ],
    sucursalesIds: row.sucursales_ids || [],
  }));
};

// ============================================
// GET SUCURSALES
// ============================================
const getSucursales = async () => {
  const result = await query(
    `SELECT id, nombre, '' AS direccion FROM sucursales WHERE estado = 1 ORDER BY nombre`
  );
  return result.rows.map((row) => ({
    id: row.id.toString(),
    nombre: row.nombre,
    direccion: row.direccion || "",
  }));
};

// ============================================
// CREATE CUPON
// ============================================
const createCupon = async (data) => {
  const {
    codigo,
    tipo,
    valor,
    descripcion,
    fechaInicio,
    fechaExpiracion,
    usosMaximos,
    aplicableA,
    sucursalesIds,
  } = data;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const aplicaServicios = aplicableA.includes("servicios");
    const aplicaProductos = aplicableA.includes("productos");

    // Insertar cupón
    const cuponResult = await client.query(
      `INSERT INTO cupones 
        (codigo, tipo, valor_descuento, descripcion, fecha_inicio, fecha_fin, 
         usos, usos_maximos, aplica_servicios, aplica_productos, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, 1)
       RETURNING id`,
      [
        codigo,
        tipo,
        valor,
        descripcion || null,
        fechaInicio || new Date().toISOString().split("T")[0],
        fechaExpiracion,
        usosMaximos || 0,
        aplicaServicios,
        aplicaProductos,
      ]
    );

    const cuponId = cuponResult.rows[0].id;

    // Insertar sucursales
    for (const sucursalId of sucursalesIds) {
      await client.query(
        `INSERT INTO cupon_sucursal (cupon_id, sucursal_id) VALUES ($1, $2)`,
        [cuponId, sucursalId]
      );
    }

    await client.query("COMMIT");

    return await getCuponById(cuponId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// UPDATE CUPON
// ============================================
const updateCupon = async (id, data) => {
  const {
    codigo,
    tipo,
    valor,
    descripcion,
    fechaInicio,
    fechaExpiracion,
    usosMaximos,
    aplicableA,
    sucursalesIds,
  } = data;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const aplicaServicios = aplicableA.includes("servicios");
    const aplicaProductos = aplicableA.includes("productos");

    // Actualizar cupón
    const cuponResult = await client.query(
      `UPDATE cupones 
       SET codigo = $1, tipo = $2, valor_descuento = $3, descripcion = $4, 
           fecha_inicio = $5, fecha_fin = $6, usos_maximos = $7,
           aplica_servicios = $8, aplica_productos = $9
       WHERE id = $10 AND estado IN (0, 1)
       RETURNING id`,
      [
        codigo,
        tipo,
        valor,
        descripcion || null,
        fechaInicio || new Date().toISOString().split("T")[0],
        fechaExpiracion,
        usosMaximos || 0,
        aplicaServicios,
        aplicaProductos,
        id,
      ]
    );

    if (cuponResult.rows.length === 0) {
      throw new Error("Cupón no encontrado");
    }

    // Eliminar sucursales existentes
    await client.query(`DELETE FROM cupon_sucursal WHERE cupon_id = $1`, [id]);

    // Insertar nuevas sucursales
    for (const sucursalId of sucursalesIds) {
      await client.query(
        `INSERT INTO cupon_sucursal (cupon_id, sucursal_id) VALUES ($1, $2)`,
        [id, sucursalId]
      );
    }

    await client.query("COMMIT");

    return await getCuponById(id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// DELETE CUPON (soft delete)
// ============================================
const deleteCupon = async (id) => {
  await query(`UPDATE cupones SET estado = 2 WHERE id = $1`, [id]);
};

// ============================================
// TOGGLE STATUS
// ============================================
const toggleCuponStatus = async (id) => {
  const result = await query(
    `UPDATE cupones 
     SET estado = CASE WHEN estado = 1 THEN 0 ELSE 1 END 
     WHERE id = $1 AND estado IN (0, 1)
     RETURNING id`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error("Cupón no encontrado");
  }

  return await getCuponById(id);
};

// ============================================
// GET CUPON BY ID (helper)
// ============================================
const getCuponById = async (id) => {
  const sql = `
    SELECT 
      c.id,
      c.codigo,
      c.tipo,
      c.valor_descuento,
      c.descripcion,
      c.fecha_inicio,
      c.fecha_fin,
      c.usos,
      c.usos_maximos,
      c.aplica_servicios,
      c.aplica_productos,
      c.estado,
      COALESCE(
        ARRAY_AGG(DISTINCT cs.sucursal_id::text) FILTER (WHERE cs.sucursal_id IS NOT NULL),
        ARRAY[]::text[]
      ) AS sucursales_ids
    FROM cupones c
    LEFT JOIN cupon_sucursal cs ON c.id = cs.cupon_id
    WHERE c.id = $1
    GROUP BY c.id
  `;

  const result = await query(sql, [id]);

  if (result.rows.length === 0) {
    throw new Error("Cupón no encontrado");
  }

  const row = result.rows[0];

  return {
    id: row.id.toString(),
    codigo: row.codigo,
    tipo: row.tipo,
    valor: parseFloat(row.valor_descuento),
    descripcion: row.descripcion || "",
    fechaInicio: row.fecha_inicio
      ? new Date(row.fecha_inicio).toISOString().split("T")[0]
      : "",
    fechaExpiracion: row.fecha_fin
      ? new Date(row.fecha_fin).toISOString().split("T")[0]
      : "",
    usosMaximos: row.usos_maximos || 0,
    usosActuales: row.usos || 0,
    activo: row.estado === 1,
    aplicableA: [
      ...(row.aplica_servicios ? ["servicios"] : []),
      ...(row.aplica_productos ? ["productos"] : []),
    ],
    sucursalesIds: row.sucursales_ids || [],
  };
};

module.exports = {
  getAllCupones,
  getSucursales,
  createCupon,
  updateCupon,
  deleteCupon,
  toggleCuponStatus,
  getCuponById,
};