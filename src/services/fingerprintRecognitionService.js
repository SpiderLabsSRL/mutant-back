const { query, pool } = require("../../db");

// FUNCIÓN CORREGIDA: Obtener huellas en formato SDK DigitalPersona
exports.getAllFingerprints = async () => {
  const client = await pool.connect();
  
  try {
    console.log("🔍 Obteniendo huellas en FORMATO SDK DIGITALPERSONA...");

    // CONSULTA QUE MANTIENE EL FORMATO ORIGINAL
    const result = await client.query(`
      SELECT 
        p.id as persona_id,
        p.nombres,
        p.apellidos,
        p.ci,
        p.telefono,
        -- CRÍTICO: Obtener los datos EXACTAMENTE como se guardaron (formato SDK)
        CONVERT_FROM(p.huella_digital, 'UTF8') as huella_digital,
        LENGTH(p.huella_digital) as data_size,
        e.id as empleado_id,
        e.rol,
        e.sucursal_id,
        s.nombre as sucursal_nombre,
        CASE 
          WHEN e.id IS NOT NULL THEN 'empleado' 
          ELSE 'cliente' 
        END as tipo,
        (
          SELECT COUNT(*) 
          FROM inscripciones i 
          WHERE i.persona_id = p.id 
          AND i.estado = 1 
          AND i.fecha_vencimiento >= CURRENT_DATE
        ) as inscripciones_activas
      FROM personas p
      LEFT JOIN empleados e ON p.id = e.persona_id AND e.estado = 1
      LEFT JOIN sucursales s ON e.sucursal_id = s.id
      WHERE p.huella_digital IS NOT NULL 
        AND LENGTH(p.huella_digital) > 0
      ORDER BY p.nombres, p.apellidos
    `);

    console.log(`📋 ${result.rows.length} huellas encontradas en formato SDK`);

    // VALIDAR Y PREPARAR DATOS EN FORMATO SDK
    const fingerprints = result.rows.map(row => {
      // Verificar que existan datos en formato SDK
      if (!row.huella_digital || row.huella_digital.length === 0) {
        console.warn(`⚠️ Huella vacía para: ${row.nombres} ${row.apellidos}`);
        return null;
      }

      console.log(`🔍 Huella ${row.nombres}:`, {
        tamaño: row.data_size,
        formato: 'sdk_digitalpersona',
        inicio_datos: row.huella_digital.substring(0, 100)
      });

      return {
        persona_id: row.persona_id,
        nombres: row.nombres,
        apellidos: row.apellidos,
        ci: row.ci,
        telefono: row.telefono,
        huella_digital: row.huella_digital, // FORMATO SDK ORIGINAL
        data_size: parseInt(row.data_size) || 0,
        empleado_id: row.empleado_id,
        rol: row.rol,
        sucursal_id: row.sucursal_id,
        sucursal_nombre: row.sucursal_nombre,
        tipo: row.tipo,
        inscripciones_activas: row.inscripciones_activas || 0,
        formato: 'sdk_digitalpersona_raw' // INDICAR FORMATO
      };
    }).filter(Boolean);

    console.log(`✅ ${fingerprints.length} huellas preparadas en formato SDK DigitalPersona`);

    return fingerprints;

  } catch (error) {
    console.error('❌ Error obteniendo huellas SDK:', error);
    throw new Error(`Error al obtener huellas: ${error.message}`);
  } finally {
    client.release();
  }
};

// FUNCIÓN ALTERNATIVA para PostgreSQL sin CONVERT_FROM
exports.getAllFingerprintsRaw = async () => {
  const client = await pool.connect();
  
  try {
    console.log("🔍 Obteniendo huellas en formato RAW SDK...");

    const result = await client.query(`
      SELECT 
        p.id as persona_id,
        p.nombres,
        p.apellidos,
        p.ci,
        p.telefono,
        -- Alternativa: usar ENCODE pero mantener formato
        ENCODE(p.huella_digital, 'escape') as huella_digital,
        LENGTH(p.huella_digital) as data_size,
        e.id as empleado_id,
        e.rol,
        e.sucursal_id,
        s.nombre as sucursal_nombre,
        CASE 
          WHEN e.id IS NOT NULL THEN 'empleado' 
          ELSE 'cliente' 
        END as tipo,
        (
          SELECT COUNT(*) 
          FROM inscripciones i 
          WHERE i.persona_id = p.id 
          AND i.estado = 1 
          AND i.fecha_vencimiento >= CURRENT_DATE
        ) as inscripciones_activas
      FROM personas p
      LEFT JOIN empleados e ON p.id = e.persona_id AND e.estado = 1
      LEFT JOIN sucursales s ON e.sucursal_id = s.id
      WHERE p.huella_digital IS NOT NULL 
        AND LENGTH(p.huella_digital) > 0
      ORDER BY p.nombres, p.apellidos
    `);

    console.log(`📋 ${result.rows.length} huellas RAW SDK obtenidas`);

    const fingerprints = result.rows.map(row => ({
      persona_id: row.persona_id,
      nombres: row.nombres,
      apellidos: row.apellidos,
      ci: row.ci,
      telefono: row.telefono,
      huella_digital: row.huella_digital, // Mantener formato original
      data_size: parseInt(row.data_size) || 0,
      empleado_id: row.empleado_id,
      rol: row.rol,
      sucursal_id: row.sucursal_id,
      sucursal_nombre: row.sucursal_nombre,
      tipo: row.tipo,
      inscripciones_activas: row.inscripciones_activas || 0,
      formato: 'sdk_digitalpersona_raw'
    }));

    // Log de diagnóstico
    fingerprints.forEach((fp, index) => {
      console.log(`🔍 Huella RAW ${index + 1}:`, {
        persona: `${fp.nombres} ${fp.apellidos}`,
        tamaño: fp.data_size,
        formato: fp.formato,
        inicio_datos: fp.huella_digital ? `${fp.huella_digital.substring(0, 50)}...` : 'VACÍA'
      });
    });

    return fingerprints;

  } catch (error) {
    console.error('❌ Error obteniendo huellas RAW SDK:', error);
    throw error;
  } finally {
    client.release();
  }
};