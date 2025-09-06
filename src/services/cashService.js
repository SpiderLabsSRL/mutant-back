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