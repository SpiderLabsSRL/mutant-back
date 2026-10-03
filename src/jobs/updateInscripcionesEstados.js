const cron = require("node-cron");
const { pool } = require("../../db");

// ============================================
// CRON JOB: Actualizar estados de inscripciones
// ============================================
// Se ejecuta todos los días a las 01:00 AM (hora America/La_Paz).
//
// Reglas:
//   1. Inscripciones con estado_inscripcion='inactivo' cuya fecha_inicio <= HOY
//      → pasan a 'activo' (eran futuras y ya comenzaron).
//   2. Inscripciones con estado_inscripcion='activo' cuya fecha_vencimiento < HOY
//      → pasan a 'inactivo' (vencieron ayer o antes).
//   3. Inscripciones con ingresos_disponibles = 0
//      → pasan a 'inactivo' (sin importar fechas).
//
// Notas:
//   - Solo se tocan inscripciones con estado (fila) = 1 (activas en el sistema).
//     Las eliminadas (estado=0 o estado=2) se ignoran.
//   - Se usa TIMEZONE('America/La_Paz', NOW()) para la fecha "hoy" real.
// ============================================

const ESTADO_INSCRIPCION_FILA = 1; // estado (SMALLINT) de la fila
const CRON_EXPRESSION = "0 1 * * *"; // 01:00 AM todos los días
const TIMEZONE = "America/La_Paz";

async function actualizarEstadosInscripciones() {
  const client = await pool.connect();
  const inicio = new Date();

  console.log(
    `\n⏰ [${inicio.toISOString()}] Iniciando actualización de estados de inscripciones...`
  );

  try {
    await client.query("BEGIN");

    // ============================================
    // 1. Futuras → Activas (fecha_inicio <= HOY)
    // ============================================
    const futurasActivar = await client.query(
      `
      UPDATE inscripciones
      SET estado_inscripcion = 'activo'
      WHERE estado = $1
        AND estado_inscripcion = 'inactivo'
        AND fecha_inicio <= TIMEZONE($2, NOW())::date
        AND fecha_vencimiento >= TIMEZONE($2, NOW())::date
        AND (ingresos_disponibles IS NULL OR ingresos_disponibles > 0)
      RETURNING id, persona_id, servicio_id, fecha_inicio, fecha_vencimiento
    `,
      [ESTADO_INSCRIPCION_FILA, TIMEZONE]
    );

    console.log(
      `   ✅ Futuras → Activas: ${futurasActivar.rowCount} inscripción(es)`
    );
    if (futurasActivar.rowCount > 0) {
      futurasActivar.rows.forEach((r) => {
        console.log(
          `      • id=${r.id} persona=${r.persona_id} servicio=${r.servicio_id} inicio=${r.fecha_inicio}`
        );
      });
    }

    // ============================================
    // 2. Activas → Inactivas (vencidas)
    // ============================================
    const vencidasInactivar = await client.query(
      `
      UPDATE inscripciones
      SET estado_inscripcion = 'inactivo'
      WHERE estado = $1
        AND estado_inscripcion = 'activo'
        AND fecha_vencimiento < TIMEZONE($2, NOW())::date
      RETURNING id, persona_id, servicio_id, fecha_vencimiento
    `,
      [ESTADO_INSCRIPCION_FILA, TIMEZONE]
    );

    console.log(
      `   ✅ Activas → Inactivas (vencidas): ${vencidasInactivar.rowCount} inscripción(es)`
    );
    if (vencidasInactivar.rowCount > 0) {
      vencidasInactivar.rows.forEach((r) => {
        console.log(
          `      • id=${r.id} persona=${r.persona_id} servicio=${r.servicio_id} venció=${r.fecha_vencimiento}`
        );
      });
    }

    // ============================================
    // 3. Sin ingresos → Inactivas
    // ============================================
    const sinIngresosInactivar = await client.query(
      `
      UPDATE inscripciones
      SET estado_inscripcion = 'inactivo'
      WHERE estado = $1
        AND estado_inscripcion = 'activo'
        AND ingresos_disponibles IS NOT NULL
        AND ingresos_disponibles = 0
      RETURNING id, persona_id, servicio_id, ingresos_disponibles
    `,
      [ESTADO_INSCRIPCION_FILA]
    );

    console.log(
      `   ✅ Sin ingresos → Inactivas: ${sinIngresosInactivar.rowCount} inscripción(es)`
    );
    if (sinIngresosInactivar.rowCount > 0) {
      sinIngresosInactivar.rows.forEach((r) => {
        console.log(
          `      • id=${r.id} persona=${r.persona_id} servicio=${r.servicio_id} ingresos=0`
        );
      });
    }

    await client.query("COMMIT");

    const fin = new Date();
    const duracionMs = fin - inicio;
    console.log(
      `✅ Actualización completada en ${duracionMs}ms. Total cambios: ${
        futurasActivar.rowCount +
        vencidasInactivar.rowCount +
        sinIngresosInactivar.rowCount
      }\n`
    );

    return {
      success: true,
      futurasActivar: futurasActivar.rowCount,
      vencidasInactivar: vencidasInactivar.rowCount,
      sinIngresosInactivar: sinIngresosInactivar.rowCount,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error al actualizar estados de inscripciones:", error);
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// PROGRAMAR CRON
// ============================================
function startInscripcionesCron() {
  const task = cron.schedule(CRON_EXPRESSION, actualizarEstadosInscripciones, {
    scheduled: true,
    timezone: TIMEZONE,
  });

  console.log(
    `🕐 Cron de inscripciones programado: "${CRON_EXPRESSION}" (${TIMEZONE})`
  );

  return task;
}

// ============================================
// EJECUCIÓN MANUAL (útil para testing)
// ============================================
async function runNow() {
  return await actualizarEstadosInscripciones();
}

module.exports = {
  startInscripcionesCron,
  actualizarEstadosInscripciones,
  runNow,
};