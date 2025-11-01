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
      e.estado,
      (p.huella_digital IS NOT NULL) as tiene_huella,
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
  
  // Obtener horarios para cada empleado
  const employeesWithHorarios = await Promise.all(
    result.rows.map(async (employee) => {
      const horariosResult = await query(
        `SELECT dia_semana, hora_ingreso, hora_salida 
         FROM horarios_empleado 
         WHERE empleado_id = $1 
         ORDER BY dia_semana`,
        [employee.id]
      );
      
      return {
        ...employee,
        horarios: horariosResult.rows
      };
    })
  );
  
  return employeesWithHorarios;
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
    horarios,
    username,
    password
  } = employeeData;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Crear persona
    const personaResult = await client.query(
      `INSERT INTO personas (nombres, apellidos, ci, telefono) 
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [nombres, apellidos, ci, telefono]
    );
    const personaId = personaResult.rows[0].id;

    // 2. Crear empleado (para admin, sucursal_id es null)
    const empleadoResult = await client.query(
      `INSERT INTO empleados (persona_id, rol, sucursal_id, estado) 
       VALUES ($1, $2, $3, 1) RETURNING id`,
      [personaId, cargo, cargo === "admin" ? null : sucursal_id]
    );
    const empleadoId = empleadoResult.rows[0].id;

    // 3. Asignar caja solo para recepcionista
    if (caja_id && cargo === "recepcionista") {
      await client.query(
        `INSERT INTO empleado_caja (empleado_id, caja_id, estado) 
         VALUES ($1, $2, 1)`,
        [empleadoId, caja_id]
      );
    }

    // 4. Crear horarios si no es admin y hay horarios definidos
    if (cargo !== "admin" && horarios && horarios.length > 0) {
      for (const horario of horarios) {
        if (horario.hora_ingreso && horario.hora_salida) {
          await client.query(
            `INSERT INTO horarios_empleado (empleado_id, dia_semana, hora_ingreso, hora_salida) 
             VALUES ($1, $2, $3, $4)`,
            [empleadoId, horario.dia_semana, horario.hora_ingreso, horario.hora_salida]
          );
        }
      }
    }

    // 5. Crear usuario si es necesario (para admin y recepcionista)
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
    horarios,
    username,
    password
  } = employeeData;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Obtener el persona_id del empleado
    const empleadoResult = await client.query(
      'SELECT persona_id FROM empleados WHERE id = $1',
      [id]
    );
    
    if (empleadoResult.rows.length === 0) {
      throw new Error('Empleado no encontrado');
    }
    
    const personaId = empleadoResult.rows[0].persona_id;

    // 2. Actualizar persona
    await client.query(
      `UPDATE personas SET nombres = $1, apellidos = $2, ci = $3, telefono = $4 
       WHERE id = $5`,
      [nombres, apellidos, ci, telefono, personaId]
    );

    // 3. Actualizar empleado (para admin, sucursal_id es null)
    await client.query(
      `UPDATE empleados SET rol = $1, sucursal_id = $2 WHERE id = $3`,
      [cargo, cargo === "admin" ? null : sucursal_id, id]
    );

    // 4. Manejar asignación de caja (solo para recepcionista)
    if (cargo === "recepcionista" && caja_id) {
      // Verificar si ya existe una asignación
      const asignacionExistente = await client.query(
        'SELECT id FROM empleado_caja WHERE empleado_id = $1 AND estado = 1',
        [id]
      );

      if (asignacionExistente.rows.length > 0) {
        // Actualizar asignación existente
        await client.query(
          'UPDATE empleado_caja SET caja_id = $1 WHERE empleado_id = $2 AND estado = 1',
          [caja_id, id]
        );
      } else {
        // Crear nueva asignación
        await client.query(
          `INSERT INTO empleado_caja (empleado_id, caja_id, estado) 
           VALUES ($1, $2, 1)`,
          [id, caja_id]
        );
      }
    } else {
      // Eliminar asignación de caja si el cargo ya no es recepcionista
      await client.query(
        'UPDATE empleado_caja SET estado = 0 WHERE empleado_id = $1',
        [id]
      );
    }

    // 5. Manejar horarios (solo para roles que no son admin)
    if (cargo !== "admin") {
      // Eliminar horarios existentes
      await client.query(
        'DELETE FROM horarios_empleado WHERE empleado_id = $1',
        [id]
      );

      // Insertar nuevos horarios
      if (horarios && horarios.length > 0) {
        for (const horario of horarios) {
          if (horario.hora_ingreso && horario.hora_salida) {
            await client.query(
              `INSERT INTO horarios_empleado (empleado_id, dia_semana, hora_ingreso, hora_salida) 
               VALUES ($1, $2, $3, $4)`,
              [id, horario.dia_semana, horario.hora_ingreso, horario.hora_salida]
            );
          }
        }
      }
    } else {
      // Eliminar horarios si el cargo cambia a admin
      await client.query(
        'DELETE FROM horarios_empleado WHERE empleado_id = $1',
        [id]
      );
    }

    // 6. Manejar usuario (para admin y recepcionista)
    if (['admin', 'recepcionista'].includes(cargo)) {
      // Verificar si ya existe un usuario
      const usuarioExistente = await client.query(
        'SELECT id FROM usuarios WHERE empleado_id = $1',
        [id]
      );

      if (usuarioExistente.rows.length > 0) {
        // Actualizar usuario existente
        if (password) {
          const hashedPassword = await bcrypt.hash(password, 10);
          await client.query(
            'UPDATE usuarios SET username = $1, password_hash = $2 WHERE empleado_id = $3',
            [username, hashedPassword, id]
          );
        } else {
          // Solo actualizar username si no se cambia la contraseña
          await client.query(
            'UPDATE usuarios SET username = $1 WHERE empleado_id = $2',
            [username, id]
          );
        }
      } else if (username && password) {
        // Crear nuevo usuario
        const hashedPassword = await bcrypt.hash(password, 10);
        await client.query(
          `INSERT INTO usuarios (username, password_hash, empleado_id) 
           VALUES ($1, $2, $3)`,
          [username, hashedPassword, id]
        );
      }
    } else {
      // Eliminar usuario si el cargo ya no requiere acceso
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

exports.registerFingerprint = async (id) => {
  const empleadoResult = await query(
    'SELECT persona_id FROM empleados WHERE id = $1',
    [id]
  );
  
  if (empleadoResult.rows.length === 0) {
    throw new Error('Empleado no encontrado');
  }
  
  const personaId = empleadoResult.rows[0].persona_id;
  
  // Simular registro de huella
  await query(
    'UPDATE personas SET huella_digital = $1 WHERE id = $2',
    [Buffer.from('simulated_fingerprint_data'), personaId]
  );
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
      e.estado,
      (p.huella_digital IS NOT NULL) as tiene_huella,
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
  
  // Obtener horarios del empleado
  const horariosResult = await query(
    `SELECT dia_semana, hora_ingreso, hora_salida 
     FROM horarios_empleado 
     WHERE empleado_id = $1 
     ORDER BY dia_semana`,
    [id]
  );
  
  return {
    ...result.rows[0],
    horarios: horariosResult.rows
  };
};