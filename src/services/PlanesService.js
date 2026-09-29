// src/services/PlanesService.js
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

const DAY_MAP_REVERSE = {
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
  7: "sunday",
};

class PlanesService {
  // ============================================
  // GET ALL PLANES
  // ============================================
  async getAllPlanes() {
    try {
      const result = await query(`
        SELECT 
          s.id,
          s.nombre,
          s.descripcion,
          s.precio,
          s.numero_ingresos AS "numeroIngresos",
          s.estado,
          s.tipo_duracion AS "tipoDuracion",
          s.cantidad_duracion AS "cantidadDuracion",
          s.multisucursal,
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', ss.sucursal_id,
                  'nombre', suc.nombre,
                  'disponible', ss.disponible,
                  'multisucursal', ss.multisucursal
                ) ORDER BY suc.nombre
              )
              FROM servicio_sucursal ss
              INNER JOIN sucursales suc ON ss.sucursal_id = suc.id
              WHERE ss.servicio_id = s.id
                AND suc.estado = 1
            ),
            '[]'::json
          ) AS sucursales,
          (COUNT(hs.id) > 0) AS "hasTimeRange",
          MIN(hs.hora_inicio)::text AS "startTime",
          MAX(hs.hora_fin)::text AS "endTime",
          (COUNT(DISTINCT hs.dia_semana) > 0) AS "hasSpecificDays",
          COALESCE(
            ARRAY_AGG(DISTINCT hs.dia_semana) FILTER (WHERE hs.dia_semana IS NOT NULL),
            ARRAY[]::int[]
          ) AS "specificDaysRaw"
        FROM servicios s
        LEFT JOIN horarios_servicio hs ON s.id = hs.servicio_id
        WHERE s.estado IN (0, 1, 2)
        GROUP BY s.id
        ORDER BY s.nombre
      `);

      return result.rows.map((row) => {
        const { specificDaysRaw, ...rest } = row;
        return {
          ...rest,
          specificDays: (specificDaysRaw || [])
            .map((d) => DAY_MAP_REVERSE[d])
            .filter(Boolean),
        };
      });
    } catch (error) {
      console.error("Error en getAllPlanes:", error);
      throw new Error("Error al obtener los planes desde la base de datos");
    }
  }

  // ============================================
  // GET ACTIVE PLANES
  // ============================================
  async getActivePlanes() {
    try {
      const result = await query(`
        SELECT 
          s.id,
          s.nombre,
          s.descripcion,
          s.precio,
          s.numero_ingresos AS "numeroIngresos",
          s.estado,
          s.tipo_duracion AS "tipoDuracion",
          s.cantidad_duracion AS "cantidadDuracion",
          s.multisucursal,
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', ss.sucursal_id,
                  'nombre', suc.nombre,
                  'disponible', ss.disponible,
                  'multisucursal', ss.multisucursal
                ) ORDER BY suc.nombre
              )
              FROM servicio_sucursal ss
              INNER JOIN sucursales suc ON ss.sucursal_id = suc.id
              WHERE ss.servicio_id = s.id
                AND suc.estado = 1
                AND ss.disponible = TRUE
            ),
            '[]'::json
          ) AS sucursales,
          (COUNT(hs.id) > 0) AS "hasTimeRange",
          MIN(hs.hora_inicio)::text AS "startTime",
          MAX(hs.hora_fin)::text AS "endTime",
          (COUNT(DISTINCT hs.dia_semana) > 0) AS "hasSpecificDays",
          COALESCE(
            ARRAY_AGG(DISTINCT hs.dia_semana) FILTER (WHERE hs.dia_semana IS NOT NULL),
            ARRAY[]::int[]
          ) AS "specificDaysRaw"
        FROM servicios s
        LEFT JOIN horarios_servicio hs ON s.id = hs.servicio_id
        WHERE s.estado = 1
        GROUP BY s.id
        ORDER BY s.nombre
      `);

      return result.rows.map((row) => {
        const { specificDaysRaw, ...rest } = row;
        return {
          ...rest,
          specificDays: (specificDaysRaw || [])
            .map((d) => DAY_MAP_REVERSE[d])
            .filter(Boolean),
        };
      });
    } catch (error) {
      console.error("Error en getActivePlanes:", error);
      throw new Error(
        "Error al obtener los planes activos desde la base de datos"
      );
    }
  }

  // ============================================
  // CREATE PLAN
  // ============================================
  async createPlan(planData) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const servicioResult = await client.query(
        `
        INSERT INTO servicios (
          nombre, descripcion, precio, numero_ingresos, estado,
          tipo_duracion, cantidad_duracion, multisucursal
        ) VALUES ($1, $2, $3, $4, 1, $5, $6, $7)
        RETURNING id, nombre
        `,
        [
          planData.nombre,
          planData.descripcion || null,
          planData.precio,
          planData.numeroIngresos || null,
          planData.tipoDuracion,
          planData.cantidadDuracion,
          planData.multisucursal || false,
        ]
      );

      const newServicio = servicioResult.rows[0];

      if (planData.sucursalesIds && planData.sucursalesIds.length > 0) {
        for (const sucursalId of planData.sucursalesIds) {
          await client.query(
            `
            INSERT INTO servicio_sucursal (servicio_id, sucursal_id, multisucursal, disponible)
            VALUES ($1, $2, $3, TRUE)
            `,
            [newServicio.id, sucursalId, planData.multisucursal || false]
          );
        }
      }

      await client.query("COMMIT");
      return newServicio;
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error en createPlan:", error);
      throw new Error("Error al crear el plan en la base de datos");
    } finally {
      client.release();
    }
  }

  // ============================================
  // UPDATE PLAN
  // ============================================
  async updatePlan(id, planData) {
    try {
      const result = await query(
        `
        UPDATE servicios 
        SET 
          nombre = $1,
          descripcion = $2,
          precio = $3,
          numero_ingresos = $4,
          tipo_duracion = $5,
          cantidad_duracion = $6,
          multisucursal = $7,
          estado = $8
        WHERE id = $9
        RETURNING id, nombre
        `,
        [
          planData.nombre,
          planData.descripcion || null,
          planData.precio,
          planData.numeroIngresos || null,
          planData.tipoDuracion,
          planData.cantidadDuracion,
          planData.multisucursal || false,
          planData.estado || 1,
          id,
        ]
      );

      if (result.rowCount === 0) {
        throw new Error("Plan no encontrado");
      }

      return result.rows[0];
    } catch (error) {
      console.error("Error en updatePlan:", error);
      throw new Error("Error al actualizar el plan en la base de datos");
    }
  }

  // ============================================
  // DELETE PLAN (soft)
  // ============================================
  async deletePlan(id) {
    const result = await query(
      `UPDATE servicios SET estado = 2 WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      throw new Error("Plan no encontrado");
    }

    return { success: true };
  }

  // ============================================
  // TOGGLE STATUS
  // ============================================
  async togglePlanStatus(id) {
    const result = await query(
      `
      UPDATE servicios 
      SET estado = CASE 
        WHEN estado = 1 THEN 0 
        ELSE 1 
      END
      WHERE id = $1
      RETURNING id, nombre, estado
      `,
      [id]
    );

    if (result.rowCount === 0) {
      throw new Error("Plan no encontrado");
    }

    return result.rows[0];
  }

  // ============================================
  // TIPOS DURACIÓN
  // ============================================
  async getTiposDuracion() {
    const result = await query(`
      SELECT DISTINCT tipo_duracion 
      FROM servicios 
      WHERE estado = 1 
      ORDER BY tipo_duracion
    `);
    return result.rows.map((row) => row.tipo_duracion);
  }

  // ============================================
  // SUCURSALES POR PLAN
  // ============================================
  async getSucursalesByPlan(planId) {
    const result = await query(
      `
      SELECT 
        ss.servicio_id,
        ss.sucursal_id,
        suc.nombre AS sucursal_nombre,
        ss.disponible,
        ss.multisucursal
      FROM servicio_sucursal ss
      INNER JOIN sucursales suc ON ss.sucursal_id = suc.id
      WHERE ss.servicio_id = $1
        AND suc.estado = 1
      ORDER BY suc.nombre
      `,
      [planId]
    );
    return result.rows;
  }

  // ============================================
  // UPDATE SUCURSALES
  // ============================================
  async updatePlanSucursales(planId, sucursalesIds) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `DELETE FROM servicio_sucursal WHERE servicio_id = $1`,
        [planId]
      );

      if (sucursalesIds && sucursalesIds.length > 0) {
        const servicioResult = await client.query(
          `SELECT multisucursal FROM servicios WHERE id = $1`,
          [planId]
        );

        if (servicioResult.rowCount === 0) {
          throw new Error("Plan no encontrado");
        }

        const { multisucursal } = servicioResult.rows[0];

        for (const sucursalId of sucursalesIds) {
          await client.query(
            `
            INSERT INTO servicio_sucursal (servicio_id, sucursal_id, multisucursal, disponible)
            VALUES ($1, $2, $3, TRUE)
            `,
            [planId, sucursalId, multisucursal]
          );
        }
      }

      await client.query("COMMIT");
      return { success: true, updatedCount: sucursalesIds?.length || 0 };
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error en updatePlanSucursales:", error);
      throw new Error("Error al actualizar las sucursales del plan");
    } finally {
      client.release();
    }
  }

  // ============================================
  // TIENDA: Productos landing
  // ============================================
  async getProductosLanding() {
    const result = await query(`
      SELECT 
        p.id,
        p.nombre,
        p.descripcion,
        p.codigo,
        p.precio_venta AS precio,
        p.imagen,
        p.landing,
        p.estado,
        COALESCE(
          SUM(ps.stock) FILTER (WHERE ps.stock IS NOT NULL),
          0
        ) AS stock_total
      FROM productos p
      LEFT JOIN producto_sucursal ps ON p.id = ps.producto_id
      WHERE p.estado = 1
        AND p.landing = TRUE
      GROUP BY p.id
      ORDER BY p.nombre
    `);

    return result.rows.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      descripcion: row.descripcion || "",
      codigo: row.codigo,
      precio: parseFloat(row.precio) || 0,
      imagen: bufferToDataUrl(row.imagen),
      landing: row.landing,
      stock: parseInt(row.stock_total) || 0,
      categoria: "General",
      destacado: false,
    }));
  }

  // ============================================
  // TIENDA: Producto por ID
  // ============================================
  async getProductoById(id) {
    const result = await query(
      `
      SELECT 
        p.id,
        p.nombre,
        p.descripcion,
        p.codigo,
        p.precio_venta AS precio,
        p.imagen,
        p.landing,
        p.estado,
        COALESCE(
          SUM(ps.stock) FILTER (WHERE ps.stock IS NOT NULL),
          0
        ) AS stock_total
      FROM productos p
      LEFT JOIN producto_sucursal ps ON p.id = ps.producto_id
      WHERE p.id = $1
        AND p.estado = 1
      GROUP BY p.id
      `,
      [id]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      nombre: row.nombre,
      descripcion: row.descripcion || "",
      codigo: row.codigo,
      precio: parseFloat(row.precio) || 0,
      imagen: bufferToDataUrl(row.imagen),
      landing: row.landing,
      stock: parseInt(row.stock_total) || 0,
      categoria: "General",
      destacado: false,
    };
  }
}

module.exports = new PlanesService();