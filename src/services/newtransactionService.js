const { query } = require("../../db");

exports.getTransactions = async () => {
  const result = await query(`
    SELECT 
      tc.id as idtransaccion,
      tc.tipo,
      tc.descripcion,
      tc.monto,
      tc.fecha,
      tc.caja_id as idcaja,
      tc.usuario_id as idusuario,
      c.nombre as nombre_caja,
      CONCAT(p.nombres, ' ', p.apellidos) as nombre_usuario
    FROM transacciones_caja tc
    INNER JOIN cajas c ON tc.caja_id = c.id
    INNER JOIN usuarios u ON tc.usuario_id = u.id
    INNER JOIN empleados e ON u.empleado_id = e.id
    INNER JOIN personas p ON e.persona_id = p.id
    ORDER BY tc.fecha DESC
  `);
  return result.rows;
};

exports.getTransactionsByCashRegister = async (idCaja) => {
  const result = await query(`
    SELECT 
      tc.id as idtransaccion,
      tc.tipo,
      tc.descripcion,
      tc.monto,
      tc.fecha,
      tc.caja_id as idcaja,
      tc.usuario_id as idusuario,
      c.nombre as nombre_caja,
      CONCAT(p.nombres, ' ', p.apellidos) as nombre_usuario
    FROM transacciones_caja tc
    INNER JOIN cajas c ON tc.caja_id = c.id
    INNER JOIN usuarios u ON tc.usuario_id = u.id
    INNER JOIN empleados e ON u.empleado_id = e.id
    INNER JOIN personas p ON e.persona_id = p.id
    WHERE tc.caja_id = $1
    ORDER BY tc.fecha DESC
  `, [idCaja]);
  return result.rows;
};

exports.createTransaction = async ({ tipo, descripcion, monto, idCaja, idUsuario }) => {
  const result = await query(`
    INSERT INTO transacciones_caja (tipo, descripcion, monto, fecha, caja_id, usuario_id)
    VALUES ($1, $2, $3, NOW(), $4, $5)
    RETURNING *
  `, [tipo, descripcion, monto, idCaja, idUsuario]);
  
  // Obtener información completa de la transacción
  const transactionResult = await query(`
    SELECT 
      tc.id as idtransaccion,
      tc.tipo,
      tc.descripcion,
      tc.monto,
      tc.fecha,
      tc.caja_id as idcaja,
      tc.usuario_id as idusuario,
      c.nombre as nombre_caja,
      CONCAT(p.nombres, ' ', p.apellidos) as nombre_usuario
    FROM transacciones_caja tc
    INNER JOIN cajas c ON tc.caja_id = c.id
    INNER JOIN usuarios u ON tc.usuario_id = u.id
    INNER JOIN empleados e ON u.empleado_id = e.id
    INNER JOIN personas p ON e.persona_id = p.id
    WHERE tc.id = $1
  `, [result.rows[0].id]);
  
  return transactionResult.rows[0];
};

exports.getCashRegisterStatus = async (idCaja) => {
  const result = await query(`
    SELECT 
      ec.id as idestado_caja,
      ec.caja_id as idcaja,
      ec.estado,
      ec.monto_inicial,
      ec.monto_final,
      ec.usuario_id as idusuario,
      c.nombre as nombre_caja
    FROM estado_caja ec
    INNER JOIN cajas c ON ec.caja_id = c.id
    WHERE ec.caja_id = $1
    ORDER BY ec.id DESC
    LIMIT 1
  `, [idCaja]);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0];
};

exports.getAssignedCashRegister = async (idUsuario) => {
  try {
    // Obtener el empleado_id del usuario
    const userResult = await query(`
      SELECT empleado_id FROM usuarios WHERE id = $1
    `, [idUsuario]);
    
    if (userResult.rows.length === 0) {
      throw new Error("Usuario no encontrado");
    }
    
    const empleadoId = userResult.rows[0].empleado_id;
    
    // Obtener la caja asignada al empleado
    const cashRegisterResult = await query(`
      SELECT caja_id 
      FROM empleado_caja 
      WHERE empleado_id = $1 AND estado = 1
      LIMIT 1
    `, [empleadoId]);
    
    if (cashRegisterResult.rows.length === 0) {
      throw new Error("No se encontró caja asignada para el empleado");
    }
    
    return cashRegisterResult.rows[0].caja_id;
  } catch (error) {
    console.error("Error in getAssignedCashRegister:", error);
    throw error;
  }
};