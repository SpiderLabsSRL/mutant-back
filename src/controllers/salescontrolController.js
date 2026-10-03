// backend/controllers/salescontrolController.js
const salesService = require("../services/salescontrolService");
const { query } = require("../../db");

// ============================================
// HELPER: Obtener sucursal_id del usuario logueado
// ============================================
async function resolveUserSucursalId(req) {
  if (req.user?.sucursal_id) {
    return Number(req.user.sucursal_id);
  }

  const empleadoId = req.user?.idempleado || req.user?.empleado_id;
  const usuarioId = req.user?.idusuario || req.user?.id;

  try {
    if (empleadoId) {
      const r = await query(
        `SELECT sucursal_id FROM empleados WHERE id = $1 AND estado = 1`,
        [empleadoId]
      );
      if (r.rows.length > 0) return r.rows[0].sucursal_id;
    }

    if (usuarioId) {
      const r = await query(
        `SELECT e.sucursal_id 
         FROM usuarios u 
         INNER JOIN empleados e ON u.empleado_id = e.id 
         WHERE u.id = $1 AND e.estado = 1`,
        [usuarioId]
      );
      if (r.rows.length > 0) return r.rows[0].sucursal_id;
    }
  } catch (err) {
    console.error("Error resolviendo sucursal_id:", err);
  }

  return null;
}

// ============================================
// GET SALES
// ============================================
const getSales = async (req, res) => {
  try {
    const {
      dateFilterType = "today",
      specificDate,
      startDate,
      endDate,
      sucursal,
      empleadoId,
      page = 1,
      pageSize = 20,
    } = req.query;

    if (dateFilterType === "range") {
      if (!startDate || !endDate) {
        return res.status(400).json({
          error:
            "Para rango de fechas, debe especificar fecha inicio y fecha fin",
        });
      }
      if (new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({
          error: "La fecha inicio no puede ser mayor a la fecha fin",
        });
      }
    }

    if (dateFilterType === "specific" && !specificDate) {
      return res.status(400).json({
        error: "Para fecha específica, debe seleccionar una fecha",
      });
    }

    const filters = {
      dateFilterType: dateFilterType || "today",
      specificDate: specificDate || null,
      startDate: startDate || null,
      endDate: endDate || null,
      sucursal: sucursal === "all" || !sucursal ? null : sucursal,
      empleadoId: empleadoId || null,
    };

    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSizeNum = Math.max(1, Math.min(parseInt(pageSize) || 20, 5000));

    // ✅ Resolver sucursal del usuario (a prueba de balas)
    const userSucursalId = await resolveUserSucursalId(req);

    const result = await salesService.getSales(
      filters,
      pageNum,
      pageSizeNum,
      userSucursalId,
      req.user?.rol
    );

    res.json({
      sales: result.sales,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("❌ Error in getSales controller:", error);
    res.status(500).json({
      error: error.message || "Error al obtener las ventas",
      details:
        process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// ============================================
// GET TOTALS
// ============================================
const getTotals = async (req, res) => {
  try {
    const {
      dateFilterType = "today",
      specificDate,
      startDate,
      endDate,
      sucursal,
      empleadoId,
    } = req.query;

    if (dateFilterType === "range") {
      if (!startDate || !endDate) {
        return res.status(400).json({
          error:
            "Para rango de fechas, debe especificar fecha inicio y fecha fin",
        });
      }
      if (new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({
          error: "La fecha inicio no puede ser mayor a la fecha fin",
        });
      }
    }

    if (dateFilterType === "specific" && !specificDate) {
      return res.status(400).json({
        error: "Para fecha específica, debe seleccionar una fecha",
      });
    }

    const filters = {
      dateFilterType: dateFilterType || "today",
      specificDate: specificDate || null,
      startDate: startDate || null,
      endDate: endDate || null,
      sucursal: sucursal === "all" || !sucursal ? null : sucursal,
      empleadoId: empleadoId || null,
    };

    const userSucursalId = await resolveUserSucursalId(req);

    const totals = await salesService.getTotals(
      filters,
      userSucursalId,
      req.user?.rol
    );
    res.json(totals);
  } catch (error) {
    console.error("❌ Error in getTotals controller:", error);
    res.status(500).json({
      error: error.message || "Error al calcular los totales",
      details:
        process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// ============================================
// GET SALE DETAILS
// ============================================
const getSaleDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query;

    if (!id || !type) {
      return res
        .status(400)
        .json({ error: "ID y tipo de venta son requeridos" });
    }

    const details = await salesService.getSaleDetails(id, type);
    res.json(details);
  } catch (error) {
    console.error("❌ Error in getSaleDetails controller:", error);
    res.status(500).json({
      error: error.message || "Error al obtener los detalles de la venta",
      details:
        process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// ============================================
// GET SUCURSALES
// ============================================
const getSucursales = async (req, res) => {
  try {
    const sucursales = await salesService.getSucursales();
    res.json(sucursales);
  } catch (error) {
    console.error("❌ Error in getSucursales controller:", error);
    res.status(500).json({
      error: error.message || "Error al obtener las sucursales",
      details:
        process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

module.exports = {
  getSales,
  getTotals,
  getSaleDetails,
  getSucursales,
};