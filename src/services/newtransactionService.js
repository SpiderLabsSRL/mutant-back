const { query, pool } = require("../../db");

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
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Obtener el último estado de caja para el monto inicial
    const lastCashStatus = await client.query(`
      SELECT id as estado_caja_id, monto_final 
      FROM estado_caja 
      WHERE caja_id = $1 
      ORDER BY id DESC 
      LIMIT 1
    `, [idCaja]);
    
    const montoInicial = lastCashStatus.rows.length > 0 ? lastCashStatus.rows[0].monto_final : 0;
    const estadoCajaIdExistente = lastCashStatus.rows.length > 0 ? lastCashStatus.rows[0].estado_caja_id : null;
    
    // Calcular el nuevo monto final según el tipo de transacción
    let montoFinal = parseFloat(montoInicial);
    if (tipo === 'ingreso' || tipo === 'apertura') {
      montoFinal += parseFloat(monto);
    } else if (tipo === 'egreso') {
      montoFinal -= parseFloat(monto);
    } else if (tipo === 'cierre') {
      montoFinal = parseFloat(monto);
    }
    
    // Crear nuevo estado de caja
    const estadoCajaResult = await client.query(`
      INSERT INTO estado_caja (caja_id, estado, monto_inicial, monto_final, usuario_id)
      VALUES ($1, 'abierta', $2, $3, $4)
      RETURNING id
    `, [idCaja, montoInicial, montoFinal, idUsuario]);
    
    const nuevoEstadoCajaId = estadoCajaResult.rows[0].id;
    
    // Registrar transacción de caja con referencia al estado_caja
    const transactionResult = await client.query(`
      INSERT INTO transacciones_caja (caja_id, estado_caja_id, tipo, descripcion, monto, fecha, usuario_id)
      VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      RETURNING id
    `, [idCaja, nuevoEstadoCajaId, tipo, descripcion, monto, idUsuario]);
    
    // Si había un estado de caja anterior, actualizarlo a cerrado
    if (estadoCajaIdExistente) {
      await client.query(`
        UPDATE estado_caja SET estado = 'cerrada' WHERE id = $1
      `, [estadoCajaIdExistente]);
    }
    
    // Obtener información completa de la transacción
    const completeTransactionResult = await client.query(`
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
    `, [transactionResult.rows[0].id]);
    
    await client.query('COMMIT');
    
    return completeTransactionResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error in createTransaction service:", error);
    throw new Error(error.message || "Error al crear la transacción");
  } finally {
    client.release();
  }
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