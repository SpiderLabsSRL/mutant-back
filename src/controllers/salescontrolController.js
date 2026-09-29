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

    console.log("🔍 Filtros recibidos en sales controller:", {
      dateFilterType,
      specificDate,
      startDate,
      endDate,
      sucursal,
      empleadoId,
      page,
      pageSize,
    });

    // Validaciones
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
      specificDate: specificDate,
      startDate: startDate,
      endDate: endDate,
      sucursal: sucursal === "all" ? null : sucursal,
      empleadoId: empleadoId || null,
    };

    const pageNum = Math.max(1, parseInt(page));
    const pageSizeNum = Math.max(1, Math.min(parseInt(pageSize), 100));

    console.log(`📄 Solicitando página ${pageNum} con ${pageSizeNum} registros`);
    console.log(`📅 Filtro activo: ${filters.dateFilterType}`);

    const result = await salesService.getSales(filters, pageNum, pageSizeNum);

    console.log(
      `✅ Ventas obtenidas: ${result.sales.length} registros de página ${pageNum}`
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

    console.log("📊 Filtros recibidos para totales:", {
      dateFilterType,
      specificDate,
      startDate,
      endDate,
      sucursal,
      empleadoId,
    });

    // Validaciones
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
      specificDate: specificDate,
      startDate: startDate,
      endDate: endDate,
      sucursal: sucursal === "all" ? null : sucursal,
      empleadoId: empleadoId || null,
    };

    const totals = await salesService.getTotals(filters);

    console.log("✅ Totales calculados:", totals);

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

    console.log(`🔍 Obteniendo detalles de venta ${id} de tipo ${type}`);

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
    console.log("🔄 Obteniendo lista de sucursales para SalesControl...");
    const sucursales = await salesService.getSucursales();
    console.log(`✅ Sucursales obtenidas: ${sucursales.length}`);
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