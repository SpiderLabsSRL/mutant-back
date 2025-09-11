const { query } = require("../../db");

exports.getBranches = async () => {
  const result = await query(
    "SELECT id, nombre, estado FROM sucursales WHERE estado = 1 ORDER BY nombre"
  );
  return result.rows;
};

exports.getCashBoxesByBranch = async (branchId) => {
  const result = await query(
    "SELECT id, nombre, sucursal_id, estado FROM cajas WHERE sucursal_id = $1 AND estado = 1 ORDER BY nombre",
    [branchId]
  );
  return result.rows;
};

exports.getCashBoxStatus = async (cashBoxId) => {
  try {
    // Consulta para obtener el monto_final del último registro (mayor ID) de la caja
    const result = await query(
      `SELECT monto_final 
       FROM estado_caja 
       WHERE caja_id = $1 
       ORDER BY id DESC 
       LIMIT 1`,
      [cashBoxId]
    );
    
    if (result.rows.length === 0) {
      return { monto_final: "0" };
    }
    
    return result.rows[0];
  } catch (error) {
    console.error("Error al consultar estado_caja:", error);
    return { monto_final: "0" };
  }
};

exports.getTransactionsByCashBox = async (cashBoxId) => {
  const result = await query(
    `SELECT id, caja_id, tipo, descripcion, monto, fecha, usuario_id 
     FROM transacciones_caja 
     WHERE caja_id = $1 
     ORDER BY fecha DESC`,
    [cashBoxId]
  );
  return result.rows;
};

exports.getLactobarTransactionsByBranch = async (branchId) => {
  const result = await query(
    `SELECT tc.id, tc.caja_id, tc.tipo, tc.descripcion, tc.monto, tc.fecha, tc.usuario_id 
     FROM transacciones_caja tc
     JOIN cajas c ON tc.caja_id = c.id
     WHERE c.sucursal_id = $1 AND c.nombre ILIKE '%lactobar%'
     ORDER BY tc.fecha DESC`,
    [branchId]
  );
  return result.rows;
};