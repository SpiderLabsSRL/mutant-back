const { query, pool } = require("../../db");

exports.getTransactions = async () => {
  const result = await query(`
    SELECT 
      tc.id as idtransaccion,
      tc.tipo,
      tc.descripcion,
      tc.monto,
      tc.fecha,
      tc.caja_id,
      tc.usuario_id,
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

exports.getTransactionsByCashRegisterAndUser = async (idCaja, idUsuario) => {
  const result = await query(
    `
    SELECT 
      tc.id as idtransaccion,
      tc.tipo,
      tc.descripcion,
      tc.monto,
      tc.fecha,
      tc.caja_id,
      tc.usuario_id,
      c.nombre as nombre_caja,
      CONCAT(p.nombres, ' ', p.apellidos) as nombre_usuario
    FROM transacciones_caja tc
    INNER JOIN cajas c ON tc.caja_id = c.id
    INNER JOIN usuarios u ON tc.usuario_id = u.id
    INNER JOIN empleados e ON u.empleado_id = e.id
    INNER JOIN personas p ON e.persona_id = p.id
    WHERE tc.caja_id = $1 
      AND tc.usuario_id = $2
      AND tc.fecha::date = (NOW() AT TIME ZONE 'America/La_Paz')::date
    ORDER BY tc.fecha DESC
  `,
    [idCaja, idUsuario]
  );
  return result.rows;
};

exports.createTransaction = async ({ tipo, descripcion, monto, idCaja, idUsuario }) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Obtener el último estado de caja
    const estadoCajaQuery = `
      SELECT id, estado, monto_final
      FROM estado_caja 
      WHERE caja_id = $1 
      ORDER BY id DESC 
      LIMIT 1
    `;
    
    const estadoCajaResult = await client.query(estadoCajaQuery, [idCaja]);
    
    if (estadoCajaResult.rows.length === 0) {
      throw new Error("No se encontró estado de caja para esta caja");
    }
    
    const estadoCajaActual = estadoCajaResult.rows[0];
    
    if (estadoCajaActual.estado !== 'abierta') {
      throw new Error("La caja no está abierta para realizar transacciones");
    }
    
    const estado_caja_id = estadoCajaActual.id;
    
    // 2. Insertar transacción con zona horaria
    const result = await client.query(
      `
      INSERT INTO transacciones_caja (tipo, descripcion, monto, fecha, caja_id, estado_caja_id, usuario_id)
      VALUES ($1, $2, $3, TIMEZONE('America/La_Paz', NOW()), $4, $5, $6)
      RETURNING *
      `,
      [tipo, descripcion, monto, idCaja, estado_caja_id, idUsuario]
    );

    // 3. Actualizar monto final en estado_caja
    if (tipo === 'ingreso') {
      await client.query(
        `UPDATE estado_caja SET monto_final = monto_final + $1 WHERE id = $2`,
        [monto, estado_caja_id]
      );
    } else if (tipo === 'egreso') {
      await client.query(
        `UPDATE estado_caja SET monto_final = monto_final - $1 WHERE id = $2`,
        [monto, estado_caja_id]
      );
    }

    // 4. Obtener información completa de la transacción
    const transactionResult = await client.query(
      `
      SELECT 
        tc.id as idtransaccion,
        tc.tipo,
        tc.descripcion,
        tc.monto,
        tc.fecha,
        tc.caja_id,
        tc.usuario_id,
        c.nombre as nombre_caja,
        CONCAT(p.nombres, ' ', p.apellidos) as nombre_usuario
      FROM transacciones_caja tc
      INNER JOIN cajas c ON tc.caja_id = c.id
      INNER JOIN usuarios u ON tc.usuario_id = u.id
      INNER JOIN empleados e ON u.empleado_id = e.id
      INNER JOIN personas p ON e.persona_id = p.id
      WHERE tc.id = $1
      `,
      [result.rows[0].id]
    );

    await client.query('COMMIT');
    return transactionResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error in createTransaction service:", error);
    throw error;
  } finally {
    client.release();
  }
};

exports.getCashRegisterStatus = async (idCaja) => {
  const result = await query(
    `
    SELECT 
      ec.id as idestado_caja,
      ec.caja_id,
      ec.estado,
      ec.monto_inicial,
      ec.monto_final,
      ec.usuario_id,
      c.nombre as nombre_caja
    FROM estado_caja ec
    INNER JOIN cajas c ON ec.caja_id = c.id
    WHERE ec.caja_id = $1
    ORDER BY ec.id DESC
    LIMIT 1
  `,
    [idCaja]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

exports.getAssignedCashRegister = async (idUsuario) => {
  try {
    // Obtener el empleado_id del usuario
    const userResult = await query(
      `
      SELECT empleado_id FROM usuarios WHERE id = $1
    `,
      [idUsuario]
    );

    if (userResult.rows.length === 0) {
      throw new Error("Usuario no encontrado");
    }

    const empleadoId = userResult.rows[0].empleado_id;

    // Obtener la caja asignada al empleado
    const cashRegisterResult = await query(
      `
      SELECT caja_id 
      FROM empleado_caja 
      WHERE empleado_id = $1 AND estado = 1
      LIMIT 1
    `,
      [empleadoId]
    );

    if (cashRegisterResult.rows.length === 0) {
      throw new Error("No se encontró caja asignada para el empleado");
    }

    return cashRegisterResult.rows[0].caja_id;
  } catch (error) {
    console.error("Error in getAssignedCashRegister:", error);
    throw error;
  }
};

exports.openCashRegister = async (caja_id, monto_inicial, usuario_id, descripcion) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Verificar si ya existe un estado abierto para esta caja
    const estadoActualQuery = `
      SELECT estado FROM estado_caja 
      WHERE caja_id = $1 
      ORDER BY id DESC 
      LIMIT 1
    `;
    
    const estadoActualResult = await client.query(estadoActualQuery, [caja_id]);
    
    if (estadoActualResult.rows.length > 0 && estadoActualResult.rows[0].estado === 'abierta') {
      throw new Error("La caja ya está abierta");
    }
    
    // Crear nuevo estado de caja con zona horaria
    const estadoCajaResult = await client.query(
      `
      INSERT INTO estado_caja (caja_id, estado, monto_inicial, monto_final, usuario_id)
      VALUES ($1, 'abierta', $2, $2, $3)
      RETURNING id
      `,
      [caja_id, monto_inicial, usuario_id]
    );
    
    const estado_caja_id = estadoCajaResult.rows[0].id;
    
    // Crear transacción de apertura con zona horaria
    await client.query(
      `
      INSERT INTO transacciones_caja (caja_id, estado_caja_id, tipo, descripcion, monto, fecha, usuario_id)
      VALUES ($1, $2, 'apertura', $3, $4, TIMEZONE('America/La_Paz', NOW()), $5)
      `,
      [caja_id, estado_caja_id, descripcion || `Apertura de caja con Bs. ${monto_inicial.toFixed(2)}`, monto_inicial, usuario_id]
    );
    
    await client.query('COMMIT');
    return { success: true, message: "Caja abierta correctamente" };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error in openCashRegister service:", error);
    throw error;
  } finally {
    client.release();
  }
};

exports.closeCashRegister = async (caja_id, monto_final, usuario_id, descripcion) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Obtener el último estado de caja
    const estadoCajaQuery = `
      SELECT id, monto_final, estado
      FROM estado_caja 
      WHERE caja_id = $1 
      ORDER BY id DESC 
      LIMIT 1
    `;
    
    const estadoCajaResult = await client.query(estadoCajaQuery, [caja_id]);
    
    if (estadoCajaResult.rows.length === 0) {
      throw new Error("No se encontró estado de caja para esta caja");
    }
    
    const estadoCajaActual = estadoCajaResult.rows[0];
    
    if (estadoCajaActual.estado !== 'abierta') {
      throw new Error("La caja no está abierta");
    }
    
    const estado_caja_id = estadoCajaActual.id;
    
    // Actualizar estado de caja a cerrado (PERMITIMOS CUALQUIER MONTO)
    await client.query(
      `
      UPDATE estado_caja 
      SET estado = 'cerrada', monto_final = $1
      WHERE id = $2
      `,
      [monto_final, estado_caja_id]
    );
    
    // Crear transacción de cierre con zona horaria
    await client.query(
      `
      INSERT INTO transacciones_caja (caja_id, estado_caja_id, tipo, descripcion, monto, fecha, usuario_id)
      VALUES ($1, $2, 'cierre', $3, $4, TIMEZONE('America/La_Paz', NOW()), $5)
      `,
      [caja_id, estado_caja_id, descripcion || `Cierre de caja con Bs. ${monto_final.toFixed(2)}`, monto_final, usuario_id]
    );
    
    await client.query('COMMIT');
    return { success: true, message: "Caja cerrada correctamente" };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Error in closeCashRegister service:", error);
    throw error;
  } finally {
    client.release();
  }
};