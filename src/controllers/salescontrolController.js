// backend/controllers/salescontrolController.js
const salesService = require("../services/salescontrolService");

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
    // ⚠️ Subimos el límite a 5000 porque el frontend pide 1000
    const pageSizeNum = Math.max(1, Math.min(parseInt(pageSize) || 20, 5000));

    const result = await salesService.getSales(filters, pageNum, pageSizeNum);

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

    const totals = await salesService.getTotals(filters);
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