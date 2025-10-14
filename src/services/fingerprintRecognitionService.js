const { query, pool } = require("../../db");

exports.recognizeFingerprint = async (recognitionData) => {
  const { fingerprint_data, format, quality, size } = recognitionData;
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    console.log("🔍 Iniciando reconocimiento AVANZADO de huella...", {
      format: format,
      size: size || 'N/A',
      quality: quality
    });

    // 1. Procesar la huella entrante (datos RAW)
    let processedIncomingData = fingerprint_data;
    
    console.log(`📥 Datos recibidos - Longitud: ${processedIncomingData.length} caracteres`);
    
    // Verificar que los datos sean válidos
    if (!processedIncomingData || processedIncomingData.length < 100) {
      throw new Error("Datos de huella insuficientes o inválidos");
    }

    // Si es base64, convertirlo a buffer
    let incomingBuffer;
    try {
      incomingBuffer = Buffer.from(processedIncomingData, 'base64');
      console.log(`📦 Buffer creado - Tamaño: ${incomingBuffer.length} bytes`);
    } catch (error) {
      console.error("❌ Error creando buffer:", error);
      throw new Error("Error procesando datos de huella: formato inválido");
    }

    // 2. Generar hash único de la huella entrante
    console.log("🔧 Generando hash para huella entrante...");
    const crypto = require('crypto');
    const incomingHash = crypto.createHash('sha256').update(incomingBuffer).digest('hex');
    
    console.log(`📊 Hash generado: ${incomingHash.substring(0, 16)}...`);

    // 3. Obtener todas las huellas registradas
    const allFingerprints = await client.query(`
      SELECT 
        p.id as persona_id,
        p.nombres,
        p.apellidos,
        p.ci,
        p.telefono,
        p.huella_digital,
        e.id as empleado_id,
        e.rol,
        e.sucursal_id,
        s.nombre as sucursal_nombre,
        CASE 
          WHEN e.id IS NOT NULL THEN 'empleado' 
          ELSE 'cliente' 
        END as tipo
      FROM personas p
      LEFT JOIN empleados e ON p.id = e.persona_id AND e.estado = 1
      LEFT JOIN sucursales s ON e.sucursal_id = s.id
      WHERE p.huella_digital IS NOT NULL 
        AND LENGTH(p.huella_digital) > 0
        AND p.huella_digital IS DISTINCT FROM DECODE('', 'escape')
      ORDER BY p.nombres, p.apellidos
    `);

    console.log(`📋 ${allFingerprints.rows.length} huellas encontradas en la base de datos`);

    if (allFingerprints.rows.length === 0) {
      await client.query('COMMIT');
      return {
        success: false,
        confidence: 0,
        message: "No hay huellas registradas en el sistema",
        timestamp: new Date().toISOString()
      };
    }

    // 4. COMPARACIÓN DIRECTA POR HASH Y DATOS RAW
    let bestMatch = null;
    let highestSimilarity = 0;
    const SIMILARITY_THRESHOLD = 85;

    console.log("🔍 Iniciando comparación directa de datos RAW...");

    for (const storedFingerprint of allFingerprints.rows) {
      try {
        console.log(`\n🔄 Comparando con: ${storedFingerprint.nombres} ${storedFingerprint.apellidos}`);
        
        // Obtener datos RAW almacenados
        const storedBuffer = storedFingerprint.huella_digital;
        
        if (!storedBuffer || storedBuffer.length === 0) {
          console.log(`   ⚠️  Datos vacíos para ${storedFingerprint.nombres}`);
          continue;
        }

        // Generar hash de los datos almacenados
        const storedHash = crypto.createHash('sha256').update(storedBuffer).digest('hex');
        console.log(`   🔑 Hash almacenado: ${storedHash.substring(0, 16)}...`);

        // Comparación 1: Hash exacto (100% coincidencia)
        if (incomingHash === storedHash) {
          console.log(`   🎯 COINCIDENCIA EXACTA POR HASH - 100%`);
          highestSimilarity = 100;
          bestMatch = storedFingerprint;
          break; // Coincidencia perfecta, salir del loop
        }

        // Comparación 2: Comparación de buffers (para datos similares)
        let similarity = 0;
        
        // Comparar tamaño primero
        const sizeSimilarity = calculateSizeSimilarity(incomingBuffer.length, storedBuffer.length);
        
        // Comparar contenido byte por byte (muestra representativa)
        const contentSimilarity = calculateContentSimilarity(incomingBuffer, storedBuffer);
        
        // Calcular similitud total
        similarity = (sizeSimilarity * 0.3) + (contentSimilarity * 0.7);
        
        console.log(`   📊 Similitud con ${storedFingerprint.nombres}: ${similarity.toFixed(2)}% (tamaño: ${sizeSimilarity.toFixed(2)}%, contenido: ${contentSimilarity.toFixed(2)}%)`);

        if (similarity > highestSimilarity) {
          highestSimilarity = similarity;
          bestMatch = storedFingerprint;
          console.log(`   🏆 Nueva mejor coincidencia: ${similarity.toFixed(2)}%`);
        }
      } catch (error) {
        console.error(`   ❌ Error comparando con ${storedFingerprint.nombres}:`, error.message);
        continue;
      }
    }

    console.log(`\n📈 RESUMEN DE COMPARACIÓN:`);
    console.log(`   Mejor coincidencia: ${bestMatch ? `${bestMatch.nombres} ${bestMatch.apellidos}` : 'Ninguna'}`);
    console.log(`   Mejor similitud: ${highestSimilarity.toFixed(2)}%`);
    console.log(`   Umbral requerido: ${SIMILARITY_THRESHOLD}%`);

    // 5. Verificar si encontramos una coincidencia válida
    if (!bestMatch || highestSimilarity < SIMILARITY_THRESHOLD) {
      await client.query('COMMIT');
      const bestMatchName = bestMatch ? `${bestMatch.nombres} ${bestMatch.apellidos}` : 'Nadie';
      return {
        success: false,
        confidence: Math.round(highestSimilarity),
        message: `Huella no reconocida. Mejor coincidencia: ${bestMatchName} (${highestSimilarity.toFixed(2)}%) - Se requiere ${SIMILARITY_THRESHOLD}%`,
        timestamp: new Date().toISOString()
      };
    }

    // 6. Preparar respuesta exitosa
    const result = {
      success: true,
      persona: {
        id: bestMatch.persona_id,
        nombres: bestMatch.nombres,
        apellidos: bestMatch.apellidos,
        ci: bestMatch.ci,
        telefono: bestMatch.telefono,
        tipo: bestMatch.tipo
      },
      confidence: Math.round(highestSimilarity),
      message: "Huella reconocida exitosamente",
      timestamp: new Date().toISOString()
    };

    if (bestMatch.tipo === 'empleado' && bestMatch.empleado_id) {
      result.empleado = {
        id: bestMatch.empleado_id,
        rol: bestMatch.rol,
        sucursal_id: bestMatch.sucursal_id,
        sucursal_nombre: bestMatch.sucursal_nombre
      };
    }

    // Contar inscripciones activas para clientes
    if (bestMatch.tipo === 'cliente') {
      const inscripcionesResult = await client.query(`
        SELECT COUNT(*) as activas 
        FROM inscripciones 
        WHERE persona_id = $1 
        AND estado = 1 
        AND fecha_vencimiento >= CURRENT_DATE
      `, [bestMatch.persona_id]);
      
      result.cliente = {
        id: bestMatch.persona_id,
        inscripciones_activas: parseInt(inscripcionesResult.rows[0].activas) || 0
      };
    }

    await client.query('COMMIT');

    console.log("✅ Reconocimiento EXITOSO:", {
      persona: `${result.persona.nombres} ${result.persona.apellidos}`,
      confidence: result.confidence,
      tipo: result.persona.tipo
    });

    return result;

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en reconocimiento de huella:', error);
    throw new Error(`Error al reconocer huella: ${error.message}`);
  } finally {
    client.release();
  }
};

// Función para calcular similitud de tamaño
function calculateSizeSimilarity(size1, size2) {
  const diff = Math.abs(size1 - size2);
  const maxSize = Math.max(size1, size2, 1);
  return Math.max(0, 100 - (diff / maxSize) * 100);
}

// Función para calcular similitud de contenido
function calculateContentSimilarity(buffer1, buffer2) {
  const sampleSize = Math.min(1000, buffer1.length, buffer2.length);
  let matchingBytes = 0;
  
  for (let i = 0; i < sampleSize; i++) {
    if (buffer1[i] === buffer2[i]) {
      matchingBytes++;
    }
  }
  
  return (matchingBytes / sampleSize) * 100;
}