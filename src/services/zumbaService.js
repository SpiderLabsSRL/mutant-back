const { query, pool } = require("../../db");

// ============================================
// GET INSTRUCTORS — Solo rol 'zumba', filtrado por sucursal
// ============================================
exports.getInstructors = async (branchId = null) => {
  const conditions = [
    `e.rol = 'zumba'`,
    `e.estado = 1`, // empleados activos
    `p.estado = 1`, // personas activas ← CAMBIO CLAVE
  ];

  const params = [];

  if (branchId) {
    params.push(branchId);
    conditions.push(`e.sucursal_id = $${params.length}`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  console.log("🔍 getInstructors:", { branchId, whereClause, params });

  const result = await query(
    `
    SELECT 
      e.id AS id,
      CONCAT(p.nombres, ' ', p.apellidos) AS nombre,
      e.rol,
      e.sucursal_id
    FROM empleados e
    INNER JOIN personas p ON e.persona_id = p.id
    ${whereClause}
    ORDER BY p.nombres, p.apellidos
    `,
    params
  );

  console.log(`✅ Instructores encontrados: ${result.rows.length}`);

  return result.rows.map((r) => ({
    id: r.id.toString(),
    nombre: r.nombre,
    rol: r.rol,
  }));
};

// ============================================
// GET REPORTS
// ============================================
exports.getReports = async ({ dateFrom, dateTo, instructorId } = {}) => {
  const conditions = [];
  const params = [];
  let paramCount = 0;

  if (dateFrom) {
    paramCount++;
    conditions.push(`rz.fecha >= $${paramCount}::date`);
    params.push(dateFrom);
  }

  if (dateTo) {
    paramCount++;
    conditions.push(`rz.fecha <= $${paramCount}::date`);
    params.push(dateTo);
  }

  if (instructorId) {
    paramCount++;
    conditions.push(`rz.instructor_id = $${paramCount}`);
    params.push(instructorId);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await query(
    `
    SELECT 
      rz.id,
      TO_CHAR(rz.fecha, 'YYYY-MM-DD') AS fecha,
      rz.instructor_id,
      CONCAT(pi.nombres, ' ', pi.apellidos) AS instructor_nombre,
      rz.numero_personas,
      rz.registrado_por_id,
      CONCAT(pr.nombres, ' ', pr.apellidos) AS registrado_por_nombre,
      TO_CHAR(rz.registrado_en, 'YYYY-MM-DD"T"HH24:MI:SS') AS registrado_en
    FROM reportes_zumba rz
    INNER JOIN empleados ei ON rz.instructor_id = ei.id
    INNER JOIN personas pi ON ei.persona_id = pi.id
    LEFT JOIN empleados er ON rz.registrado_por_id = er.id
    LEFT JOIN personas pr ON er.persona_id = pr.id
    ${whereClause}
    ORDER BY rz.fecha DESC
    `,
    params
  );

  return result.rows.map((r) => ({
    id: r.id.toString(),
    fecha: r.fecha,
    instructorId: r.instructor_id.toString(),
    instructorNombre: r.instructor_nombre,
    numeroPersonas: r.numero_personas,
    registradoPor: r.registrado_por_nombre || "Sistema",
    registradoEn: r.registrado_en,
  }));
};

// ============================================
// GET REPORT BY DATE
// ============================================
exports.getReportByDate = async (fecha) => {
  const result = await query(
    `
    SELECT 
      rz.id,
      TO_CHAR(rz.fecha, 'YYYY-MM-DD') AS fecha,
      rz.instructor_id,
      CONCAT(pi.nombres, ' ', pi.apellidos) AS instructor_nombre,
      rz.numero_personas,
      rz.registrado_por_id,
      CONCAT(pr.nombres, ' ', pr.apellidos) AS registrado_por_nombre,
      TO_CHAR(rz.registrado_en, 'YYYY-MM-DD"T"HH24:MI:SS') AS registrado_en
    FROM reportes_zumba rz
    INNER JOIN empleados ei ON rz.instructor_id = ei.id
    INNER JOIN personas pi ON ei.persona_id = pi.id
    LEFT JOIN empleados er ON rz.registrado_por_id = er.id
    LEFT JOIN personas pr ON er.persona_id = pr.id
    WHERE rz.fecha = $1::date
    `,
    [fecha]
  );

  if (result.rows.length === 0) return null;

  const r = result.rows[0];
  return {
    id: r.id.toString(),
    fecha: r.fecha,
    instructorId: r.instructor_id.toString(),
    instructorNombre: r.instructor_nombre,
    numeroPersonas: r.numero_personas,
    registradoPor: r.registrado_por_nombre || "Sistema",
    registradoEn: r.registrado_en,
  };
};

// ============================================
// SAVE REPORT (upsert) — valida solo rol 'zumba'
// ============================================
exports.saveReport = async ({
  fecha,
  instructorId,
  numeroPersonas,
  registradoPorId,
}) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Validar que el instructor sea de zumba y esté activo
    const instructorResult = await client.query(
      `
      SELECT e.id, e.rol
      FROM empleados e
      INNER JOIN personas p ON e.persona_id = p.id
      WHERE e.id = $1
        AND e.estado = 1
        AND p.estado = 1
        AND e.rol = 'zumba'
      `,
      [instructorId]
    );

    if (instructorResult.rows.length === 0) {
      throw new Error("Instructor de zumba no encontrado o no válido");
    }

    const upsertResult = await client.query(
      `
      INSERT INTO reportes_zumba 
        (fecha, instructor_id, numero_personas, registrado_por_id, registrado_en, updated_at)
      VALUES ($1::date, $2, $3, $4, TIMEZONE('America/La_Paz', NOW()), TIMEZONE('America/La_Paz', NOW()))
      ON CONFLICT (fecha) 
      DO UPDATE SET
        instructor_id = EXCLUDED.instructor_id,
        numero_personas = EXCLUDED.numero_personas,
        registrado_por_id = EXCLUDED.registrado_por_id,
        updated_at = TIMEZONE('America/La_Paz', NOW())
      RETURNING id
      `,
      [fecha, instructorId, numeroPersonas, registradoPorId || null]
    );

    await client.query("COMMIT");

    return await exports.getReportByDate(fecha);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error en saveReport service:", error);
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// DELETE REPORT
// ============================================
exports.deleteReport = async (id) => {
  const result = await query(
    `DELETE FROM reportes_zumba WHERE id = $1 RETURNING id`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new Error("Reporte no encontrado");
  }

  return { success: true };
};

// ============================================
// GET STATS
// ============================================
exports.getStats = async ({ dateFrom, dateTo } = {}) => {
  const conditions = [];
  const params = [];
  let paramCount = 0;

  if (dateFrom) {
    paramCount++;
    conditions.push(`rz.fecha >= $${paramCount}::date`);
    params.push(dateFrom);
  }

  if (dateTo) {
    paramCount++;
    conditions.push(`rz.fecha <= $${paramCount}::date`);
    params.push(dateTo);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const generalResult = await query(
    `
    SELECT 
      COUNT(*) AS total_clases,
      COALESCE(SUM(numero_personas), 0) AS total_participantes,
      COALESCE(ROUND(AVG(numero_personas)), 0) AS promedio_participantes
    FROM reportes_zumba rz
    ${whereClause}
    `,
    params
  );

  const topInstructorResult = await query(
    `
    SELECT 
      rz.instructor_id,
      CONCAT(p.nombres, ' ', p.apellidos) AS instructor_nombre,
      COUNT(*) AS cantidad_clases
    FROM reportes_zumba rz
    INNER JOIN empleados e ON rz.instructor_id = e.id
    INNER JOIN personas p ON e.persona_id = p.id
    ${whereClause}
    GROUP BY rz.instructor_id, p.nombres, p.apellidos
    ORDER BY cantidad_clases DESC
    LIMIT 1
    `,
    params
  );

  const general = generalResult.rows[0] || {
    total_clases: 0,
    total_participantes: 0,
    promedio_participantes: 0,
  };

  const topInstructor = topInstructorResult.rows[0] || null;

  return {
    totalClasses: parseInt(general.total_clases) || 0,
    totalParticipants: parseInt(general.total_participantes) || 0,
    averageParticipants: parseInt(general.promedio_participantes) || 0,
    topInstructor: topInstructor ? topInstructor.instructor_nombre : "",
    topInstructorCount: topInstructor
      ? parseInt(topInstructor.cantidad_clases)
      : 0,
  };
};