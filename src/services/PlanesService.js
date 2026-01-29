// src/services/PlanesService.js
const { query } = require("../../db");

class PlanesService {
  // Obtener todos los planes con sus sucursales
  async getAllPlanes() {
    try {
      // Primero obtener todos los servicios (planes)
      const serviciosQuery = `
        SELECT 
          s.id,
          s.nombre,
          s.precio,
          s.numero_ingresos,
          s.estado,
          s.tipo_duracion,
          s.cantidad_duracion,
          s.multisucursal
        FROM servicios s
        WHERE s.estado IN (1, 2)
        ORDER BY s.nombre
      `;

      const serviciosResult = await query(serviciosQuery);
      const servicios = serviciosResult.rows;

      // Obtener todas las sucursales relacionadas
      const sucursalesQuery = `
        SELECT 
          ss.servicio_id,
          ss.sucursal_id,
          suc.nombre as sucursal_nombre,
          ss.disponible,
          ss.multisucursal
        FROM servicio_sucursal ss
        INNER JOIN sucursales suc ON ss.sucursal_id = suc.id
        WHERE ss.servicio_id = ANY($1)
        AND suc.estado = 1
        ORDER BY ss.servicio_id, suc.nombre
      `;

      const servicioIds = servicios.map((s) => s.id);
      const sucursalesResult = await query(sucursalesQuery, [servicioIds]);
      const sucursales = sucursalesResult.rows;

      return {
        servicios: servicios,
        sucursales: sucursales,
      };
    } catch (error) {
      console.error("Error en getAllPlanes:", error);
      throw new Error("Error al obtener los planes desde la base de datos");
    }
  }

  // Obtener solo planes activos (estado = 1)
  async getActivePlanes() {
    try {
      // Primero obtener todos los servicios activos
      const serviciosQuery = `
        SELECT 
          s.id,
          s.nombre,
          s.precio,
          s.numero_ingresos,
          s.estado,
          s.tipo_duracion,
          s.cantidad_duracion,
          s.multisucursal
        FROM servicios s
        WHERE s.estado = 1
        ORDER BY s.nombre
      `;

      const serviciosResult = await query(serviciosQuery);
      const servicios = serviciosResult.rows;

      // Obtener todas las sucursales relacionadas
      const sucursalesQuery = `
        SELECT 
          ss.servicio_id,
          ss.sucursal_id,
          suc.nombre as sucursal_nombre,
          ss.disponible,
          ss.multisucursal
        FROM servicio_sucursal ss
        INNER JOIN sucursales suc ON ss.sucursal_id = suc.id
        WHERE ss.servicio_id = ANY($1)
        AND suc.estado = 1
        AND ss.disponible = true
        ORDER BY ss.servicio_id, suc.nombre
      `;

      const servicioIds = servicios.map((s) => s.id);
      const sucursalesResult = await query(sucursalesQuery, [servicioIds]);
      const sucursales = sucursalesResult.rows;

      return {
        servicios: servicios,
        sucursales: sucursales,
      };
    } catch (error) {
      console.error("Error en getActivePlanes:", error);
      throw new Error(
        "Error al obtener los planes activos desde la base de datos",
      );
    }
  }

  // Crear un nuevo plan
  async createPlan(planData) {
    const client = await query.getClient();

    try {
      await client.query("BEGIN");

      // Insertar el servicio principal
      const insertServicioQuery = `
        INSERT INTO servicios (
          nombre, 
          precio, 
          numero_ingresos, 
          estado, 
          tipo_duracion, 
          cantidad_duracion, 
          multisucursal
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const servicioValues = [
        planData.nombre,
        planData.precio.toString(),
        planData.numeroIngresos,
        1, // estado activo por defecto
        planData.tipoDuracion,
        planData.cantidadDuracion,
        planData.multisucursal,
      ];

      const servicioResult = await client.query(
        insertServicioQuery,
        servicioValues,
      );
      const newServicio = servicioResult.rows[0];

      // Insertar las sucursales relacionadas
      if (planData.sucursalesIds && planData.sucursalesIds.length > 0) {
        const insertSucursalesQuery = `
          INSERT INTO servicio_sucursal (servicio_id, sucursal_id, multisucursal, disponible)
          VALUES ${planData.sucursalesIds
            .map(
              (_, i) =>
                `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`,
            )
            .join(", ")}
        `;

        const sucursalesValues = [];
        planData.sucursalesIds.forEach((sucursalId) => {
          sucursalesValues.push(
            newServicio.id,
            sucursalId,
            planData.multisucursal,
            true, // disponible por defecto
          );
        });

        await client.query(insertSucursalesQuery, sucursalesValues);
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

  // Actualizar un plan
  async updatePlan(id, planData) {
    const client = await query.getClient();

    try {
      await client.query("BEGIN");

      // Actualizar el servicio principal
      const updateServicioQuery = `
        UPDATE servicios 
        SET 
          nombre = $1,
          precio = $2,
          numero_ingresos = $3,
          tipo_duracion = $4,
          cantidad_duracion = $5,
          multisucursal = $6,
          estado = $7
        WHERE id = $8
        RETURNING *
      `;

      const servicioValues = [
        planData.nombre,
        planData.precio.toString(),
        planData.numeroIngresos,
        planData.tipoDuracion,
        planData.cantidadDuracion,
        planData.multisucursal,
        planData.estado || 1,
        id,
      ];

      const servicioResult = await client.query(
        updateServicioQuery,
        servicioValues,
      );

      if (servicioResult.rowCount === 0) {
        throw new Error("Plan no encontrado");
      }

      const updatedServicio = servicioResult.rows[0];

      await client.query("COMMIT");

      return updatedServicio;
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error en updatePlan:", error);
      throw new Error("Error al actualizar el plan en la base de datos");
    } finally {
      client.release();
    }
  }

  // Eliminar un plan (cambiar estado a 2 = eliminado)
  async deletePlan(id) {
    try {
      const deleteQuery = `
        UPDATE servicios 
        SET estado = 2 
        WHERE id = $1
      `;

      const result = await query(deleteQuery, [id]);

      if (result.rowCount === 0) {
        throw new Error("Plan no encontrado");
      }

      return { success: true };
    } catch (error) {
      console.error("Error en deletePlan:", error);
      throw new Error("Error al eliminar el plan en la base de datos");
    }
  }

  // Cambiar estado de un plan (activar/desactivar)
  async togglePlanStatus(id) {
    try {
      const toggleQuery = `
        UPDATE servicios 
        SET estado = CASE 
          WHEN estado = 1 THEN 0 
          ELSE 1 
        END
        WHERE id = $1
        RETURNING *
      `;

      const result = await query(toggleQuery, [id]);

      if (result.rowCount === 0) {
        throw new Error("Plan no encontrado");
      }

      return result.rows[0];
    } catch (error) {
      console.error("Error en togglePlanStatus:", error);
      throw new Error(
        "Error al cambiar el estado del plan en la base de datos",
      );
    }
  }

  // Obtener tipos de duración disponibles
  async getTiposDuracion() {
    try {
      const tiposQuery = `
        SELECT DISTINCT tipo_duracion 
        FROM servicios 
        WHERE estado = 1 
        ORDER BY tipo_duracion
      `;

      const result = await query(tiposQuery);
      return result.rows.map((row) => row.tipo_duracion);
    } catch (error) {
      console.error("Error en getTiposDuracion:", error);
      throw new Error(
        "Error al obtener los tipos de duración desde la base de datos",
      );
    }
  }

  // Obtener sucursales de un plan específico
  async getSucursalesByPlan(planId) {
    try {
      const sucursalesQuery = `
        SELECT 
          ss.servicio_id,
          ss.sucursal_id,
          suc.nombre as sucursal_nombre,
          ss.disponible,
          ss.multisucursal
        FROM servicio_sucursal ss
        INNER JOIN sucursales suc ON ss.sucursal_id = suc.id
        WHERE ss.servicio_id = $1
        AND suc.estado = 1
        ORDER BY suc.nombre
      `;

      const result = await query(sucursalesQuery, [planId]);
      return result.rows;
    } catch (error) {
      console.error("Error en getSucursalesByPlan:", error);
      throw new Error(
        "Error al obtener las sucursales del plan desde la base de datos",
      );
    }
  }

  // Actualizar sucursales de un plan
  async updatePlanSucursales(planId, sucursalesIds) {
    const client = await query.getClient();

    try {
      await client.query("BEGIN");

      // Primero eliminar todas las sucursales existentes
      const deleteQuery = `
        DELETE FROM servicio_sucursal 
        WHERE servicio_id = $1
      `;
      await client.query(deleteQuery, [planId]);

      // Luego insertar las nuevas sucursales
      if (sucursalesIds && sucursalesIds.length > 0) {
        // Obtener información del servicio para el campo multisucursal
        const servicioQuery = `
          SELECT multisucursal FROM servicios WHERE id = $1
        `;
        const servicioResult = await client.query(servicioQuery, [planId]);

        if (servicioResult.rowCount === 0) {
          throw new Error("Plan no encontrado");
        }

        const { multisucursal } = servicioResult.rows[0];

        const insertQuery = `
          INSERT INTO servicio_sucursal (servicio_id, sucursal_id, multisucursal, disponible)
          VALUES ${sucursalesIds
            .map(
              (_, i) =>
                `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`,
            )
            .join(", ")}
        `;

        const values = [];
        sucursalesIds.forEach((sucursalId) => {
          values.push(planId, sucursalId, multisucursal, true);
        });

        await client.query(insertQuery, values);
      }

      await client.query("COMMIT");

      return {
        success: true,
        updatedCount: sucursalesIds?.length || 0,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error en updatePlanSucursales:", error);
      throw new Error(
        "Error al actualizar las sucursales del plan en la base de datos",
      );
    } finally {
      client.release();
    }
  }
}

module.exports = new PlanesService();
