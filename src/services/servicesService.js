const { query, pool } = require("../../db");

// ============================================
// HELPERS
// ============================================

// Mapea días de texto a números (1=Lunes, 7=Domingo)
const DAY_MAP = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

const DAY_MAP_REVERSE = {
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
  7: "sunday",
};

// ============================================
// GET ALL SERVICES
// ============================================
const getAllServices = async () => {
  const sql = `
    SELECT 
      s.id::text,
      s.nombre AS name,
      s.descripcion AS description,
      s.precio AS price,
      s.numero_ingresos AS "maxEntries",
      s.multisucursal,
      s.tipo_duracion AS "tipoDuracion",
      s.cantidad_duracion AS "cantidadDuracion",
      s.cantidad_personas AS "requiredPeople",
      (s.estado = 1) AS "isActive",
      s.tipo_servicio_id::text AS "serviceType",
      COALESCE(
        ARRAY_AGG(DISTINCT ss.sucursal_id::text) FILTER (WHERE ss.sucursal_id IS NOT NULL),
        ARRAY[]::text[]
      ) AS sucursales,
      COALESCE(
        ARRAY_AGG(DISTINCT CASE WHEN ss.multisucursal THEN ss.sucursal_id::text END) 
          FILTER (WHERE ss.multisucursal),
        ARRAY[]::text[]
      ) AS "sucursalesMultisucursal",
      -- Horarios: si hay registros, activar flags
      (COUNT(hs.id) > 0) AS "hasTimeRange",
      MIN(hs.hora_inicio)::text AS "startTime",
      MAX(hs.hora_fin)::text AS "endTime",
      (COUNT(DISTINCT hs.dia_semana) > 0) AS "hasSpecificDays",
      COALESCE(
        ARRAY_AGG(DISTINCT hs.dia_semana) FILTER (WHERE hs.dia_semana IS NOT NULL),
        ARRAY[]::int[]
      ) AS "specificDaysRaw",
      (s.cantidad_personas IS NOT NULL AND s.cantidad_personas > 0) AS "requiredPeopleEnabled"
    FROM servicios s
    LEFT JOIN servicio_sucursal ss ON s.id = ss.servicio_id
    LEFT JOIN horarios_servicio hs ON s.id = hs.servicio_id
    WHERE s.estado IN (0, 1)
    GROUP BY s.id, s.nombre, s.descripcion, s.precio, s.numero_ingresos, 
             s.multisucursal, s.tipo_duracion, s.cantidad_duracion, 
             s.cantidad_personas, s.estado, s.tipo_servicio_id
    ORDER BY s.nombre;
  `;

  const result = await query(sql);

  // Transformar specificDaysRaw (int[]) a specificDays (string[])
  return result.rows.map((row) => {
    const { specificDaysRaw, ...rest } = row;
    return {
      ...rest,
      specificDays: (specificDaysRaw || []).map((d) => DAY_MAP_REVERSE[d]).filter(Boolean),
    };
  });
};

// ============================================
// GET SUCURSALES
// ============================================
const getSucursales = async () => {
  const result = await query(
    `SELECT id, nombre AS name FROM sucursales WHERE estado = 1 ORDER BY nombre`
  );
  return result.rows;
};

// ============================================
// GET SERVICE TYPES
// ============================================
const getServiceTypes = async () => {
  const result = await query(
    `SELECT id::text, nombre AS name FROM tipos_servicio WHERE estado = 1 ORDER BY nombre`
  );
  return result.rows;
};

// ============================================
// CREATE SERVICE TYPE
// ============================================
const createServiceType = async (name) => {
  const result = await query(
    `INSERT INTO tipos_servicio (nombre, estado) VALUES ($1, 1)
     RETURNING id::text, nombre AS name`,
    [name]
  );
  return result.rows[0];
};

// ============================================
// CREATE SERVICE
// ============================================
const createService = async (serviceData) => {
  const {
    name,
    description,
    price,
    maxEntries,
    sucursales,
    multisucursal,
    sucursalesMultisucursal,
    tipoDuracion,
    cantidadDuracion,
    serviceType,
    hasTimeRange,
    startTime,
    endTime,
    hasSpecificDays,
    specificDays,
    requiredPeopleEnabled,
    requiredPeople,
  } = serviceData;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Insertar servicio
    const serviceResult = await client.query(
      `INSERT INTO servicios 
        (nombre, descripcion, precio, numero_ingresos, multisucursal, 
         tipo_duracion, cantidad_duracion, tipo_servicio_id, cantidad_personas, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
       RETURNING id, nombre AS name, descripcion AS description, precio AS price, 
                 numero_ingresos AS "maxEntries", multisucursal, 
                 tipo_duracion AS "tipoDuracion", cantidad_duracion AS "cantidadDuracion",
                 cantidad_personas AS "requiredPeople", estado = 1 AS "isActive",
                 tipo_servicio_id::text AS "serviceType"`,
      [
        name,
        description || null,
        price,
        maxEntries,
        multisucursal || false,
        tipoDuracion,
        cantidadDuracion,
        serviceType || null,
        requiredPeopleEnabled ? (Number(requiredPeople) || 0) : 0,
      ]
    );

    const serviceId = serviceResult.rows[0].id;

    // Insertar relaciones con sucursales
    for (const sucursalId of sucursales) {
      const isMultisucursal =
        multisucursal && sucursalesMultisucursal.includes(sucursalId);

      await client.query(
        `INSERT INTO servicio_sucursal (servicio_id, sucursal_id, disponible, multisucursal)
         VALUES ($1, $2, TRUE, $3)`,
        [serviceId, sucursalId, isMultisucursal]
      );
    }

    // Insertar horarios si aplica
    if (hasTimeRange && startTime && endTime) {
      // Si tiene días específicos, crear un horario por cada día
      if (hasSpecificDays && specificDays && specificDays.length > 0) {
        for (const dayId of specificDays) {
          const diaNum = DAY_MAP[dayId];
          if (diaNum) {
            await client.query(
              `INSERT INTO horarios_servicio (servicio_id, dia_semana, hora_inicio, hora_fin)
               VALUES ($1, $2, $3, $4)`,
              [serviceId, diaNum, startTime, endTime]
            );
          }
        }
      } else {
        // Sin días específicos: crear un horario genérico para todos los días (1-7)
        // Pero mejor crear uno solo con día 1 como referencia y que el front lo maneje
        // Opción: crear para los 7 días
        for (let dia = 1; dia <= 7; dia++) {
          await client.query(
            `INSERT INTO horarios_servicio (servicio_id, dia_semana, hora_inicio, hora_fin)
             VALUES ($1, $2, $3, $4)`,
            [serviceId, dia, startTime, endTime]
          );
        }
      }
    }

    await client.query("COMMIT");

    const newService = serviceResult.rows[0];
    newService.sucursales = sucursales;
    newService.sucursalesMultisucursal = multisucursal ? sucursalesMultisucursal : [];
    newService.hasTimeRange = hasTimeRange || false;
    newService.startTime = hasTimeRange ? startTime : undefined;
    newService.endTime = hasTimeRange ? endTime : undefined;
    newService.hasSpecificDays = hasSpecificDays || false;
    newService.specificDays = hasSpecificDays ? specificDays : [];
    newService.requiredPeopleEnabled = requiredPeopleEnabled || false;

    return newService;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// UPDATE SERVICE
// ============================================
const updateService = async (id, serviceData) => {
  const {
    name,
    description,
    price,
    maxEntries,
    sucursales,
    multisucursal,
    sucursalesMultisucursal,
    tipoDuracion,
    cantidadDuracion,
    serviceType,
    hasTimeRange,
    startTime,
    endTime,
    hasSpecificDays,
    specificDays,
    requiredPeopleEnabled,
    requiredPeople,
  } = serviceData;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Actualizar servicio
    const serviceResult = await client.query(
      `UPDATE servicios 
       SET nombre = $1, descripcion = $2, precio = $3, numero_ingresos = $4, 
           multisucursal = $5, tipo_duracion = $6, cantidad_duracion = $7,
           tipo_servicio_id = $8, cantidad_personas = $9
       WHERE id = $10
       RETURNING id, nombre AS name, descripcion AS description, precio AS price, 
                 numero_ingresos AS "maxEntries", multisucursal, 
                 tipo_duracion AS "tipoDuracion", cantidad_duracion AS "cantidadDuracion",
                 cantidad_personas AS "requiredPeople", estado = 1 AS "isActive",
                 tipo_servicio_id::text AS "serviceType"`,
      [
        name,
        description || null,
        price,
        maxEntries,
        multisucursal || false,
        tipoDuracion,
        cantidadDuracion,
        serviceType || null,
        requiredPeopleEnabled ? (Number(requiredPeople) || 0) : 0,
        id,
      ]
    );

    if (serviceResult.rows.length === 0) {
      throw new Error("Servicio no encontrado");
    }

    // Eliminar relaciones de sucursales que ya no están
    if (sucursales.length > 0) {
      const placeholders = sucursales.map((_, i) => `$${i + 2}`).join(",");
      await client.query(
        `DELETE FROM servicio_sucursal 
         WHERE servicio_id = $1 
         AND sucursal_id NOT IN (${placeholders})`,
        [id, ...sucursales]
      );
    }

    // Insertar/actualizar relaciones con sucursales
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

    // Si se desactiva multisucursal, quitar todas las marcas
    if (!multisucursal) {
      await client.query(
        `UPDATE servicio_sucursal SET multisucursal = FALSE WHERE servicio_id = $1`,
        [id]
      );
    }

    // ============================================
    // ACTUALIZAR HORARIOS
    // ============================================
    // Eliminar horarios existentes
    await client.query(`DELETE FROM horarios_servicio WHERE servicio_id = $1`, [id]);

    // Insertar nuevos horarios si aplica
    if (hasTimeRange && startTime && endTime) {
      if (hasSpecificDays && specificDays && specificDays.length > 0) {
        for (const dayId of specificDays) {
          const diaNum = DAY_MAP[dayId];
          if (diaNum) {
            await client.query(
              `INSERT INTO horarios_servicio (servicio_id, dia_semana, hora_inicio, hora_fin)
               VALUES ($1, $2, $3, $4)`,
              [id, diaNum, startTime, endTime]
            );
          }
        }
      } else {
        for (let dia = 1; dia <= 7; dia++) {
          await client.query(
            `INSERT INTO horarios_servicio (servicio_id, dia_semana, hora_inicio, hora_fin)
             VALUES ($1, $2, $3, $4)`,
            [id, dia, startTime, endTime]
          );
        }
      }
    }

    await client.query("COMMIT");

    const updatedService = serviceResult.rows[0];
    updatedService.sucursales = sucursales;
    updatedService.sucursalesMultisucursal = multisucursal ? sucursalesMultisucursal : [];
    updatedService.hasTimeRange = hasTimeRange || false;
    updatedService.startTime = hasTimeRange ? startTime : undefined;
    updatedService.endTime = hasTimeRange ? endTime : undefined;
    updatedService.hasSpecificDays = hasSpecificDays || false;
    updatedService.specificDays = hasSpecificDays ? specificDays : [];
    updatedService.requiredPeopleEnabled = requiredPeopleEnabled || false;

    return updatedService;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// DELETE SERVICE (soft delete)
// ============================================
const deleteService = async (id) => {
  await query(`UPDATE servicios SET estado = 2 WHERE id = $1`, [id]);
};

// ============================================
// TOGGLE SERVICE STATUS
// ============================================
const toggleServiceStatus = async (id) => {
  const result = await query(
    `UPDATE servicios 
     SET estado = CASE WHEN estado = 1 THEN 0 ELSE 1 END 
     WHERE id = $1 
     RETURNING id, nombre AS name, descripcion AS description, precio AS price, 
               numero_ingresos AS "maxEntries", multisucursal, 
               tipo_duracion AS "tipoDuracion", cantidad_duracion AS "cantidadDuracion",
               cantidad_personas AS "requiredPeople", estado = 1 AS "isActive",
               tipo_servicio_id::text AS "serviceType"`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error("Servicio no encontrado");
  }

  // Obtener sucursales disponibles
  const sucursalesResult = await query(
    `SELECT sucursal_id::text FROM servicio_sucursal 
     WHERE servicio_id = $1 AND disponible = TRUE`,
    [id]
  );

  // Obtener sucursales multisucursal
  const multisucursalResult = await query(
    `SELECT sucursal_id::text FROM servicio_sucursal 
     WHERE servicio_id = $1 AND multisucursal = TRUE`,
    [id]
  );

  // Obtener horarios
  const horariosResult = await query(
    `SELECT dia_semana, hora_inicio::text, hora_fin::text 
     FROM horarios_servicio WHERE servicio_id = $1 ORDER BY dia_semana`,
    [id]
  );

  const service = result.rows[0];
  service.sucursales = sucursalesResult.rows.map((row) => row.sucursal_id);
  service.sucursalesMultisucursal = multisucursalResult.rows.map((row) => row.sucursal_id);

  if (horariosResult.rows.length > 0) {
    service.hasTimeRange = true;
    service.startTime = horariosResult.rows[0].hora_inicio;
    service.endTime = horariosResult.rows[0].hora_fin;
    service.hasSpecificDays = true;
    service.specificDays = horariosResult.rows
      .map((row) => DAY_MAP_REVERSE[row.dia_semana])
      .filter(Boolean);
  } else {
    service.hasTimeRange = false;
    service.hasSpecificDays = false;
    service.specificDays = [];
  }

  service.requiredPeopleEnabled = (service.requiredPeople || 0) > 0;

  return service;
};

module.exports = {
  getAllServices,
  getSucursales,
  getServiceTypes,
  createServiceType,
  createService,
  updateService,
  deleteService,
  toggleServiceStatus,
};