// VERIFICA que tu fingerprintRecognitionService.js tenga esto:

const { query, pool } = require("../../db");

// SOLO obtener huellas - NO comparar
exports.getAllFingerprints = async () => {
  const client = await pool.connect();
  
  try {
    console.log("🔍 Obteniendo todas las huellas registradas...");

    // CONSULTA CORREGIDA: Usar formato consistente
    const result = await client.query(`
      SELECT 
        p.id as persona_id,
        p.nombres,
        p.apellidos,
        p.ci,
        p.telefono,
        -- CRÍTICO: Convertir bytea a base64 de manera consistente
        ENCODE(p.huella_digital, 'base64') as huella_digital,
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
        AND p.huella_digital IS DISTINCT FROM DECODE('', 'escape')
      ORDER BY p.nombres, p.apellidos
    `);

    console.log(`📋 ${result.rows.length} huellas encontradas en la base de datos`);

    // VALIDACIÓN CRÍTICA: Verificar formato de cada huella
    const fingerprints = result.rows.map((row, index) => {
      const huellaData = row.huella_digital;
      
      // Verificar que los datos sean base64 válido
      if (!huellaData || typeof huellaData !== 'string') {
        console.error(`❌ Huella ${index + 1} tiene datos inválidos:`, {
          persona: `${row.nombres} ${row.apellidos}`,
          tipo: typeof huellaData
        });
        return null;
      }

      // Verificar formato base64
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(huellaData)) {
        console.error(`❌ Huella ${index + 1} no está en base64 válido:`, {
          persona: `${row.nombres} ${row.apellidos}`,
          length: huellaData.length,
          preview: huellaData.substring(0, 30)
        });
        return null;
      }

      return {
        ...row,
        huella_digital: huellaData, // Mantener base64
        data_size: parseInt(row.data_size) || 0,
        formato_verificado: true
      };
    }).filter(Boolean); // Filtrar huellas inválidas

    console.log(`✅ ${fingerprints.length} huellas válidas después de validación`);

    // Log para verificar formato
    if (fingerprints.length > 0) {
      const sample = fingerprints[0];
      console.log(`🔍 Ejemplo huella válida:`, {
        persona: `${sample.nombres} ${sample.apellidos}`,
        tamaño: sample.data_size,
        formato: 'base64',
        inicio_datos: sample.huella_digital.substring(0, 30) + '...'
      });
    }

    return fingerprints;

  } catch (error) {
    console.error('❌ Error obteniendo huellas:', error);
    throw new Error(`Error al obtener huellas: ${error.message}`);
  } finally {
    client.release();
  }
};

// NUEVA función para diagnóstico de formato
exports.getFingerprintFormatDiagnostic = async () => {
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT 
        p.id,
        p.nombres,
        p.apellidos,
        LENGTH(p.huella_digital) as raw_size,
        LENGTH(ENCODE(p.huella_digital, 'base64')) as base64_size,
        SUBSTRING(ENCODE(p.huella_digital, 'base64') FROM 1 FOR 30) as base64_preview,
        (p.huella_digital IS NOT NULL AND LENGTH(p.huella_digital) > 0) as has_data
      FROM personas p
      WHERE p.huella_digital IS NOT NULL
      LIMIT 5
    `);

    return result.rows;
  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
    throw error;
  } finally {
    client.release();
  }
};