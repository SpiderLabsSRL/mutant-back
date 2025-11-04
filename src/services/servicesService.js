const { query, pool } = require("../../db");

const getAllServices = async () => {
  const sql = `
    SELECT 
      s.id,
      s.nombre AS name,
      s.precio AS price,
      s.numero_ingresos AS "maxEntries",
      s.multisucursal,
      s.tipo_duracion AS "tipoDuracion",
      s.cantidad_duracion AS "cantidadDuracion",
      (s.estado = 1) AS "isActive",
      ARRAY_AGG(DISTINCT ss.sucursal_id::text) AS sucursales,
      ARRAY_AGG(DISTINCT CASE WHEN ss.multisucursal THEN ss.sucursal_id::text END) 
          FILTER (WHERE ss.multisucursal) AS "sucursalesMultisucursal"
    FROM servicios s
    LEFT JOIN servicio_sucursal ss ON s.id = ss.servicio_id
    WHERE s.estado IN (0, 1)
    GROUP BY s.id, s.nombre, s.precio, s.numero_ingresos, s.multisucursal, s.tipo_duracion, s.cantidad_duracion, s.estado
    ORDER BY s.nombre;
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
  const {
    name,
    price,
    maxEntries,
    sucursales,
    multisucursal,
    sucursalesMultisucursal,
    tipoDuracion,
    cantidadDuracion,
  } = serviceData;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Insertar servicio (maxEntries puede ser null para ilimitado)
    const serviceResult = await client.query(
      `INSERT INTO servicios (nombre, precio, numero_ingresos, multisucursal, tipo_duracion, cantidad_duracion, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 1)
       RETURNING id, nombre AS name, precio AS price, numero_ingresos AS "maxEntries", multisucursal, tipo_duracion AS "tipoDuracion", cantidad_duracion AS "cantidadDuracion", estado = 1 AS "isActive"`,
      [name, price, maxEntries, multisucursal, tipoDuracion, cantidadDuracion]
    );

    const serviceId = serviceResult.rows[0].id;

    // Insertar relaciones con sucursales disponibles
    for (const sucursalId of sucursales) {
      const isMultisucursal =
        multisucursal && sucursalesMultisucursal.includes(sucursalId);

      await client.query(
        `INSERT INTO servicio_sucursal (servicio_id, sucursal_id, disponible, multisucursal)
         VALUES ($1, $2, TRUE, $3)`,
        [serviceId, sucursalId, isMultisucursal]
      );
    }

    await client.query("COMMIT");

    // Devolver el servicio creado
    const newService = serviceResult.rows[0];
    newService.sucursales = sucursales;
    newService.sucursalesMultisucursal = multisucursal
      ? sucursalesMultisucursal
      : [];

    return newService;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const updateService = async (id, serviceData) => {
  const {
    name,
    price,
    maxEntries,
    sucursales,
    multisucursal,
    sucursalesMultisucursal,
    tipoDuracion,
    cantidadDuracion,
  } = serviceData;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Actualizar servicio (maxEntries puede ser null para ilimitado)
    const serviceResult = await client.query(
      `UPDATE servicios 
       SET nombre = $1, precio = $2, numero_ingresos = $3, multisucursal = $4, tipo_duracion = $5, cantidad_duracion = $6
       WHERE id = $7
       RETURNING id, nombre AS name, precio AS price, numero_ingresos AS "maxEntries", multisucursal, tipo_duracion AS "tipoDuracion", cantidad_duracion AS "cantidadDuracion", estado = 1 AS "isActive"`,
      [name, price, maxEntries, multisucursal, tipoDuracion, cantidadDuracion, id]
    );

    if (serviceResult.rows.length === 0) {
      throw new Error("Servicio no encontrado");
    }

    // Eliminar relaciones que ya no están en las sucursales disponibles
    await client.query(
      `DELETE FROM servicio_sucursal 
       WHERE servicio_id = $1 
       AND sucursal_id NOT IN (${sucursales
         .map((_, i) => `$${i + 2}`)
         .join(",")})`,
      [id, ...sucursales]
    );

    // Insertar/actualizar relaciones con sucursales disponibles
    for (const sucursalId of sucursales) {
      const isMultisucursal =
        multisucursal && sucursalesMultisucursal.includes(sucursalId);

      await client.query(
        `INSERT INTO servicio_sucursal (servicio_id, sucursal_id, disponible, multisucursal)
         VALUES ($1, $2, TRUE, $3)
         ON CONFLICT (servicio_id, sucursal_id)
         DO UPDATE SET disponible = TRUE, multisucursal = $3`,
        [id, sucursalId, isMultisucursal]
      );
    }

    // Si se desactiva el multisucursal, quitar todas las marcas multisucursal
    if (!multisucursal) {
      await client.query(
        `UPDATE servicio_sucursal 
         SET multisucursal = FALSE 
         WHERE servicio_id = $1`,
        [id]
      );
    }

    await client.query("COMMIT");

    // Devolver el servicio actualizado
    const updatedService = serviceResult.rows[0];
    updatedService.sucursales = sucursales;
    updatedService.sucursalesMultisucursal = multisucursal
      ? sucursalesMultisucursal
      : [];

    return updatedService;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const deleteService = async (id) => {
  await query(`UPDATE servicios SET estado = 2 WHERE id = $1`, [id]);
};

const toggleServiceStatus = async (id) => {
  const result = await query(
    `UPDATE servicios 
     SET estado = CASE WHEN estado = 1 THEN 0 ELSE 1 END 
     WHERE id = $1 
     RETURNING id, nombre AS name, precio AS price, numero_ingresos AS "maxEntries", multisucursal, tipo_duracion AS "tipoDuracion", cantidad_duracion AS "cantidadDuracion", estado = 1 AS "isActive"`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error("Servicio no encontrado");
  }

  // Obtener las sucursales disponibles del servicio
  const sucursalesResult = await query(
    `SELECT sucursal_id::text 
     FROM servicio_sucursal 
     WHERE servicio_id = $1 AND disponible = TRUE`,
    [id]
  );

  // Obtener las sucursales multisucursal del servicio
  const multisucursalResult = await query(
    `SELECT sucursal_id::text 
     FROM servicio_sucursal 
     WHERE servicio_id = $1 AND multisucursal = TRUE`,
    [id]
  );

  const service = result.rows[0];
  service.sucursales = sucursalesResult.rows.map((row) => row.sucursal_id);
  service.sucursalesMultisucursal = multisucursalResult.rows.map(
    (row) => row.sucursal_id
  );

  return service;
};

module.exports = {
  getAllServices,
  getSucursales,
  createService,
  updateService,
  deleteService,
  toggleServiceStatus,
};