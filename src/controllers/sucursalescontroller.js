// src/controllers/sucursalescontroller.js
const { query } = require("../../db");

const getSucursalesActivas = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, nombre, estado 
       FROM sucursales 
       WHERE estado = 1 
       ORDER BY nombre ASC`
    );
    res.json({ success: true, sucursales: result.rows });
  } catch (error) {
    console.error("Error en getSucursalesActivas:", error);
    res.status(500).json({ success: false, message: "Error al obtener sucursales" });
  }
};

const getSucursalById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT id, nombre, estado FROM sucursales WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Sucursal no encontrada" });
    }
    res.json({ success: true, sucursal: result.rows[0] });
  } catch (error) {
    console.error("Error en getSucursalById:", error);
    res.status(500).json({ success: false, message: "Error al obtener sucursal" });
  }
};

module.exports = {
  getSucursalesActivas,
  getSucursalById,
};