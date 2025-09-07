const { query, pool } = require("../../db");

const getAllServices = async () => {
  const sql = `
    SELECT 
      s.id,
      s.nombre AS name,
      s.precio AS price,
      s.numero_ingresos AS "maxEntries",
      s.estado = 1 AS "isActive",
      ARRAY_AGG(ss.sucursal_id::text) AS sucursales
    FROM servicios s
    LEFT JOIN servicio_sucursal ss ON s.id = ss.servicio_id
    WHERE s.estado IN (0, 1)
    GROUP BY s.id, s.nombre, s.precio, s.numero_ingresos, s.estado
    ORDER BY s.nombre
  `;
  
  const result = await query(sql);
  return result.rows;
};

const getSucursales = async () => {
  const result = await query(
    `SELECT id, nombre AS name FROM sucursales WHERE estado = 1 ORDER BY nombre`
  );
  return result.rows;
};

const createService = async (serviceData) => {
  const { name, price, maxEntries, sucursales } = serviceData;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Insertar servicio
    const serviceResult = await client.query(
      `INSERT INTO servicios (nombre, precio, numero_ingresos, estado)
       VALUES ($1, $2, $3, 1)
       RETURNING id, nombre AS name, precio AS price, numero_ingresos AS "maxEntries", estado = 1 AS "isActive"`,
      [name, price, maxEntries]
    );
    
    const serviceId = serviceResult.rows[0].id;
    
    // Insertar relaciones con sucursales
    for (const sucursalId of sucursales) {
      await client.query(
        `INSERT INTO servicio_sucursal (servicio_id, sucursal_id)
         VALUES ($1, $2)`,
        [serviceId, sucursalId]
      );
    }
    
    await client.query('COMMIT');
    
    // Devolver el servicio creado con las sucursales
    const newService = serviceResult.rows[0];
    newService.sucursales = sucursales;
    
    return newService;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const updateService = async (id, serviceData) => {
  const { name, price, maxEntries, sucursales } = serviceData;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Actualizar servicio
    const serviceResult = await client.query(
      `UPDATE servicios 
       SET nombre = $1, precio = $2, numero_ingresos = $3
       WHERE id = $4
       RETURNING id, nombre AS name, precio AS price, numero_ingresos AS "maxEntries", estado = 1 AS "isActive"`,
      [name, price, maxEntries, id]
    );
    
    if (serviceResult.rows.length === 0) {
      throw new Error("Servicio no encontrado");
    }
    
    // Eliminar relaciones existentes
    await client.query(
      `DELETE FROM servicio_sucursal WHERE servicio_id = $1`,
      [id]
    );
    
    // Insertar nuevas relaciones
    for (const sucursalId of sucursales) {
      await client.query(
        `INSERT INTO servicio_sucursal (servicio_id, sucursal_id)
         VALUES ($1, $2)`,
        [id, sucursalId]
      );
    }
    
    await client.query('COMMIT');
    
    // Devolver el servicio actualizado con las sucursales
    const updatedService = serviceResult.rows[0];
    updatedService.sucursales = sucursales;
    
    return updatedService;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const deleteService = async (id) => {
  await query(
    `UPDATE servicios SET estado = 2 WHERE id = $1`,
    [id]
  );
};

const toggleServiceStatus = async (id) => {
  const result = await query(
    `UPDATE servicios 
     SET estado = CASE WHEN estado = 1 THEN 0 ELSE 1 END 
     WHERE id = $1 
     RETURNING id, nombre AS name, precio AS price, numero_ingresos AS "maxEntries", estado = 1 AS "isActive"`,
    [id]
  );
  
  if (result.rows.length === 0) {
    throw new Error("Servicio no encontrado");
  }
  
  // Obtener las sucursales del servicio
  const sucursalesResult = await query(
    `SELECT sucursal_id::text 
     FROM servicio_sucursal 
     WHERE servicio_id = $1`,
    [id]
  );
  
  const service = result.rows[0];
  service.sucursales = sucursalesResult.rows.map(row => row.sucursal_id);
  
  return service;
};

module.exports = {
  getAllServices,
  getSucursales,
  createService,
  updateService,
  deleteService,
  toggleServiceStatus
};