const { query, pool } = require("../../db");
const bcrypt = require("bcrypt");

exports.getBranches = async () => {
  const result = await query(
    "SELECT id, nombre, estado FROM sucursales WHERE estado = 1 ORDER BY nombre"
  );
  return result.rows;
};

exports.getBoxes = async () => {
  const result = await query(
    "SELECT id, nombre, sucursal_id, estado FROM cajas WHERE estado = 1 ORDER BY nombre"
  );
  return result.rows;
};

exports.getEmployees = async () => {
  const result = await query(`
    SELECT 
      e.id,
      e.persona_id,
      p.nombres,
      p.apellidos,
      p.ci,
      p.telefono,
      e.rol,
      e.sucursal_id,
      s.nombre as sucursal_nombre,
      ec.caja_id,
      c.nombre as caja_nombre,
      e.hora_ingreso,
      e.hora_salida,
      e.estado,
      (p.huella_digital IS NOT NULL AND LENGTH(p.huella_digital) > 0) as tiene_huella,
      u.username
    FROM empleados e
    INNER JOIN personas p ON e.persona_id = p.id
    LEFT JOIN sucursales s ON e.sucursal_id = s.id
    LEFT JOIN empleado_caja ec ON e.id = ec.empleado_id AND ec.estado = 1
    LEFT JOIN cajas c ON ec.caja_id = c.id
    LEFT JOIN usuarios u ON e.id = u.empleado_id
    WHERE e.estado IN (0, 1)
    ORDER BY p.nombres, p.apellidos
  `);
  return result.rows;
};

exports.createEmployee = async (employeeData) => {
  const {
    nombres,
    apellidos,
    ci,
    telefono,
    cargo,
    sucursal_id,
    caja_id,
    horarioIngreso,
    horarioSalida,
    username,
    password
  } = employeeData;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const personaResult = await client.query(
      `INSERT INTO personas (nombres, apellidos, ci, telefono) 
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [nombres, apellidos, ci, telefono]
    );
    const personaId = personaResult.rows[0].id;

    const empleadoResult = await client.query(
      `INSERT INTO empleados (persona_id, rol, sucursal_id, hora_ingreso, hora_salida, estado) 
       VALUES ($1, $2, $3, $4, $5, 1) RETURNING id`,
      [personaId, cargo, cargo === "admin" ? null : sucursal_id, 
       cargo === "admin" ? null : horarioIngreso, cargo === "admin" ? null : horarioSalida]
    );
    const empleadoId = empleadoResult.rows[0].id;

    if (caja_id && cargo === "recepcionista") {
      await client.query(
        `INSERT INTO empleado_caja (empleado_id, caja_id, estado) 
         VALUES ($1, $2, 1)`,
        [empleadoId, caja_id]
      );
    }

    if (username && password && ['admin', 'recepcionista'].includes(cargo)) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await client.query(
        `INSERT INTO usuarios (username, password_hash, empleado_id) 
         VALUES ($1, $2, $3)`,
        [username, hashedPassword, empleadoId]
      );
    }

    await client.query('COMMIT');

    const newEmployee = await this.getEmployeeById(empleadoId);
    return newEmployee;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

exports.updateEmployee = async (id, employeeData) => {
  const {
    nombres,
    apellidos,
    ci,
    telefono,
    cargo,
    sucursal_id,
    caja_id,
    horarioIngreso,
    horarioSalida,
    username,
    password
  } = employeeData;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const empleadoResult = await client.query(
      'SELECT persona_id FROM empleados WHERE id = $1',
      [id]
    );
    
    if (empleadoResult.rows.length === 0) {
      throw new Error('Empleado no encontrado');
    }
    
    const personaId = empleadoResult.rows[0].persona_id;

    await client.query(
      `UPDATE personas SET nombres = $1, apellidos = $2, ci = $3, telefono = $4 
       WHERE id = $5`,
      [nombres, apellidos, ci, telefono, personaId]
    );

    await client.query(
      `UPDATE empleados SET rol = $1, sucursal_id = $2, hora_ingreso = $3, hora_salida = $4 
       WHERE id = $5`,
      [cargo, cargo === "admin" ? null : sucursal_id, 
       cargo === "admin" ? null : horarioIngreso, cargo === "admin" ? null : horarioSalida, id]
    );

    if (cargo === "recepcionista" && caja_id) {
      const asignacionExistente = await client.query(
        'SELECT id FROM empleado_caja WHERE empleado_id = $1 AND estado = 1',
        [id]
      );

      if (asignacionExistente.rows.length > 0) {
        await client.query(
          'UPDATE empleado_caja SET caja_id = $1 WHERE empleado_id = $2 AND estado = 1',
          [caja_id, id]
        );
      } else {
        await client.query(
          `INSERT INTO empleado_caja (empleado_id, caja_id, estado) 
           VALUES ($1, $2, 1)`,
          [id, caja_id]
        );
      }
    } else {
      await client.query(
        'UPDATE empleado_caja SET estado = 0 WHERE empleado_id = $1',
        [id]
      );
    }

    if (['admin', 'recepcionista'].includes(cargo)) {
      const usuarioExistente = await client.query(
        'SELECT id FROM usuarios WHERE empleado_id = $1',
        [id]
      );

      if (usuarioExistente.rows.length > 0) {
        if (password) {
          const hashedPassword = await bcrypt.hash(password, 10);
          await client.query(
            'UPDATE usuarios SET username = $1, password_hash = $2 WHERE empleado_id = $3',
            [username, hashedPassword, id]
          );
        } else {
          await client.query(
            'UPDATE usuarios SET username = $1 WHERE empleado_id = $2',
            [username, id]
          );
        }
      } else if (username && password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await client.query(
          `INSERT INTO usuarios (username, password_hash, empleado_id) 
           VALUES ($1, $2, $3)`,
          [username, hashedPassword, id]
        );
      }
    } else {
      await client.query(
        'DELETE FROM usuarios WHERE empleado_id = $1',
        [id]
      );
    }

    await client.query('COMMIT');

    const updatedEmployee = await this.getEmployeeById(id);
    return updatedEmployee;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

exports.deleteEmployee = async (id) => {
  const result = await query(
    'UPDATE empleados SET estado = 2 WHERE id = $1 RETURNING id',
    [id]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Empleado no encontrado');
  }
};

exports.toggleEmployeeStatus = async (id) => {
  const result = await query(
    `UPDATE empleados 
     SET estado = CASE WHEN estado = 1 THEN 0 ELSE 1 END 
     WHERE id = $1 
     RETURNING id, estado`,
    [id]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Empleado no encontrado');
  }
  
  const updatedEmployee = await this.getEmployeeById(id);
  return updatedEmployee;
};

// REEMPLAZA solo la función registerFingerprint en tu employeeService.js:

// FUNCIÓN CORREGIDA: Guardar datos EXACTAMENTE como vienen del frontend
// REEMPLAZA solo la función registerFingerprint en employeeService.js:

exports.registerFingerprint = async (employeeId, fingerprintData) => {
  const { fingerprint_data, format, quality, timestamp, attempt, size, samples_count } = fingerprintData;
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const empleadoResult = await client.query(
      'SELECT persona_id FROM empleados WHERE id = $1',
      [employeeId]
    );
    
    if (empleadoResult.rows.length === 0) {
      throw new Error('Empleado no encontrado');
    }
    
    const personaId = empleadoResult.rows[0].persona_id;

    if (quality < 60) {
      throw new Error(`Calidad de huella insuficiente: ${quality}%. Se requiere mínimo 60%.`);
    }

    console.log(`💾 Guardando datos biométricos para empleado ${employeeId}:`, {
      calidad: quality,
      intento: attempt,
      formato: format,
      tamaño_recibido: size,
      muestras: samples_count,
      timestamp: timestamp
    });

    // VALIDACIÓN CRÍTICA: Verificar que los datos sean base64 válido
    if (!fingerprint_data || fingerprint_data.length === 0) {
      throw new Error("Los datos de huella están vacíos o son inválidos");
    }

    // VERIFICAR FORMATO BASE64
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(fingerprint_data)) {
      throw new Error("Los datos de huella no están en formato base64 válido");
    }

    console.log(`📥 Datos recibidos - Longitud: ${fingerprint_data.length} caracteres, Inicio: ${fingerprint_data.substring(0, 30)}...`);

    // CRÍTICO: Convertir base64 a Buffer SIN MODIFICACIONES
    let huellaBuffer;
    try {
      huellaBuffer = Buffer.from(fingerprint_data, 'base64');
      console.log(`💾 Buffer creado desde base64 - Tamaño: ${huellaBuffer.length} bytes`);
      
      // Validación del buffer
      if (huellaBuffer.length === 0) {
        throw new Error("Buffer vacío después de la conversión base64");
      }
      
      console.log(`🔍 Verificación buffer - Primeros bytes: ${huellaBuffer.subarray(0, 10).join(', ')}`);
      
    } catch (bufferError) {
      console.error(`❌ Error creando buffer desde base64: ${bufferError.message}`);
      throw new Error(`Error procesando datos base64: ${bufferError.message}`);
    }

    // GUARDAR EN BASE DE DATOS
    console.log(`💾 Guardando en BD - Tamaño buffer: ${huellaBuffer.length} bytes`);

    const updateResult = await client.query(
      `UPDATE personas 
       SET huella_digital = $1
       WHERE id = $2
       RETURNING id`,
      [huellaBuffer, personaId]
    );

    if (updateResult.rows.length === 0) {
      throw new Error("No se pudo actualizar el registro de la persona");
    }

    await client.query('COMMIT');

    console.log(`✅ Datos guardados exitosamente para persona_id: ${personaId}`);
    console.log(`📊 Resumen del guardado:`, {
      employeeId: employeeId,
      personaId: personaId,
      calidad: quality,
      intento: attempt,
      tamañoBuffer: huellaBuffer.length,
      tamañoOriginal: size,
      formato: format,
      timestamp: timestamp
    });

    // VERIFICAR ALMACENAMIENTO
    const verificationResult = await client.query(
      'SELECT LENGTH(huella_digital) as stored_size FROM personas WHERE id = $1',
      [personaId]
    );

    const storedSize = verificationResult.rows[0]?.stored_size || 0;
    console.log(`🔍 Verificación post-guardado - Tamaño en BD: ${storedSize} bytes`);

    return {
      success: true,
      employeeId: employeeId,
      personaId: personaId,
      quality: quality,
      attempt: attempt,
      bufferSize: huellaBuffer.length,
      storedSize: storedSize,
      originalSize: size,
      samplesCount: samples_count,
      timestamp: timestamp,
      verified: storedSize > 0
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en registerFingerprint:', error);
    throw new Error(`Error al registrar datos biométricos: ${error.message}`);
  } finally {
    client.release();
  }
};

// FUNCIÓN NUEVA: Verificar datos de huella guardados
exports.verifyFingerprintStorage = async (employeeId) => {
  try {
    const result = await query(`
      SELECT 
        p.id as persona_id,
        p.nombres,
        p.apellidos,
        p.ci,
        LENGTH(p.huella_digital) as huella_size,
        (p.huella_digital IS NOT NULL AND LENGTH(p.huella_digital) > 0) as tiene_huella
      FROM personas p
      INNER JOIN empleados e ON p.id = e.persona_id
      WHERE e.id = $1
    `, [employeeId]);
    
    if (result.rows.length === 0) {
      throw new Error('Empleado no encontrado');
    }
    
    const persona = result.rows[0];
    
    console.log(`🔍 Verificación de huella para ${persona.nombres} ${persona.apellidos}:`, {
      persona_id: persona.persona_id,
      tiene_huella: persona.tiene_huella,
      tamaño_huella: persona.huella_size
    });
    
    return {
      success: true,
      persona: {
        id: persona.persona_id,
        nombres: persona.nombres,
        apellidos: persona.apellidos,
        ci: persona.ci
      },
      fingerprint: {
        exists: persona.tiene_huella,
        size: persona.huella_size
      },
      message: persona.tiene_huella 
        ? `Huella almacenada correctamente (${persona.huella_size} bytes)`
        : "No se encontró huella almacenada"
    };
  } catch (error) {
    console.error('❌ Error verificando almacenamiento de huella:', error);
    throw error;
  }
};

exports.getEmployeeById = async (id) => {
  const result = await query(`
    SELECT 
      e.id,
      e.persona_id,
      p.nombres,
      p.apellidos,
      p.ci,
      p.telefono,
      e.rol,
      e.sucursal_id,
      s.nombre as sucursal_nombre,
      ec.caja_id,
      c.nombre as caja_nombre,
      e.hora_ingreso,
      e.hora_salida,
      e.estado,
      (p.huella_digital IS NOT NULL AND LENGTH(p.huella_digital) > 0) as tiene_huella,
      u.username
    FROM empleados e
    INNER JOIN personas p ON e.persona_id = p.id
    LEFT JOIN sucursales s ON e.sucursal_id = s.id
    LEFT JOIN empleado_caja ec ON e.id = ec.empleado_id AND ec.estado = 1
    LEFT JOIN cajas c ON ec.caja_id = c.id
    LEFT JOIN usuarios u ON e.id = u.empleado_id
    WHERE e.id = $1
  `, [id]);
  
  if (result.rows.length === 0) {
    throw new Error('Empleado no encontrado');
  }
  
  return result.rows[0];
};