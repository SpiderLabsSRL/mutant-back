const { query } = require("../../db");
const bcrypt = require("bcrypt");

exports.getBranches = async () => {
  const result = await query(
    "SELECT id, nombre, estado FROM sucursales WHERE estado = 1 ORDER BY nombre"
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
      e.hora_ingreso,
      e.hora_salida,
      e.estado,
      (p.huella_digital IS NOT NULL) as tiene_huella,
      u.username
    FROM empleados e
    INNER JOIN personas p ON e.persona_id = p.id
    INNER JOIN sucursales s ON e.sucursal_id = s.id
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
    horarioIngreso,
    horarioSalida,
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

    // 2. Crear empleado
    const empleadoResult = await client.query(
      `INSERT INTO empleados (persona_id, rol, sucursal_id, hora_ingreso, hora_salida, estado) 
       VALUES ($1, $2, $3, $4, $5, 1) RETURNING id`,
      [personaId, cargo, sucursal_id, horarioIngreso, horarioSalida]
    );
    const empleadoId = empleadoResult.rows[0].id;

    // 3. Crear usuario si es necesario (para roles administrativos)
    if (username && password && ['admin', 'recepcionista'].includes(cargo)) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await client.query(
        `INSERT INTO usuarios (username, password_hash, empleado_id) 
         VALUES ($1, $2, $3)`,
        [username, hashedPassword, empleadoId]
      );
    }

    await client.query('COMMIT');

    // Obtener el empleado recién creado
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
    horarioIngreso,
    horarioSalida,
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

    // 3. Actualizar empleado
    await client.query(
      `UPDATE empleados SET rol = $1, sucursal_id = $2, hora_ingreso = $3, hora_salida = $4 
       WHERE id = $5`,
      [cargo, sucursal_id, horarioIngreso, horarioSalida, id]
    );

    // 4. Manejar usuario (eliminar existente y crear nuevo si es necesario)
    await client.query(
      'DELETE FROM usuarios WHERE empleado_id = $1',
      [id]
    );

    if (username && password && ['admin', 'recepcionista'].includes(cargo)) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await client.query(
        `INSERT INTO usuarios (username, password_hash, empleado_id) 
         VALUES ($1, $2, $3)`,
        [username, hashedPassword, id]
      );
    }

    await client.query('COMMIT');

    // Obtener el empleado actualizado
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
  // Esta función simularía el registro de huella en un sistema real
  // En una implementación real, se conectaría con el dispositivo de huellas
  
  // Simulamos el registro actualizando la base de datos
  const empleadoResult = await query(
    'SELECT persona_id FROM empleados WHERE id = $1',
    [id]
  );
  
  if (empleadoResult.rows.length === 0) {
    throw new Error('Empleado no encontrado');
  }
  
  const personaId = empleadoResult.rows[0].persona_id;
  
  // En un sistema real, aquí se almacenaría el template de la huella
  await query(
    'UPDATE personas SET huella_digital = $1 WHERE id = $2',
    [Buffer.from('simulated_fingerprint_data'), personaId]
  );
};

// Función auxiliar para obtener un empleado por ID
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
      e.hora_ingreso,
      e.hora_salida,
      e.estado,
      (p.huella_digital IS NOT NULL) as tiene_huella,
      u.username
    FROM empleados e
    INNER JOIN personas p ON e.persona_id = p.id
    INNER JOIN sucursales s ON e.sucursal_id = s.id
    LEFT JOIN usuarios u ON e.id = u.empleado_id
    WHERE e.id = $1
  `, [id]);
  
  if (result.rows.length === 0) {
    throw new Error('Empleado no encontrado');
  }
  
  return result.rows[0];
};