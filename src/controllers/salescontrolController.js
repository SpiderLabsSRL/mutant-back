// backend/controllers/salescontrolController.js
const salesService = require("../services/salescontrolService");

const getSales = async (req, res) => {
  try {
    const {
      dateFilterType,
      specificDate,
      startDate,
      endDate,
      sucursal,
      empleadoId,
    } = req.query;

    console.log("🔍 Filtros recibidos en sales controller:", {
      dateFilterType,
      specificDate,
      startDate,
      endDate,
      sucursal,
      empleadoId,
    });

    const filters = {
      dateFilterType,
      specificDate,
      startDate,
      endDate,
      sucursal: sucursal === "all" ? null : sucursal,
      empleadoId,
    };

    const sales = await salesService.getSales(filters);

    console.log(`✅ Ventas obtenidas: ${sales.length} registros`);

    // Convertir strings a números
    const processedSales = sales.map((sale) => ({
      ...sale,
      id: sale.id.toString(),
      subtotal: parseFloat(sale.subtotal) || 0,
      descuento: parseFloat(sale.descuento) || 0,
      total: parseFloat(sale.total) || 0,
      efectivo: sale.efectivo ? parseFloat(sale.efectivo) : 0,
      qr: sale.qr ? parseFloat(sale.qr) : 0,
      fecha: new Date(sale.fecha).toLocaleString("es-BO", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    }));

    res.json(processedSales);
  } catch (error) {
    console.error("❌ Error in getSales controller:", error);
    res.status(500).json({
      error: error.message || "Error al obtener las ventas",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

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
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

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
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

module.exports = {
  getSales,
  getSaleDetails,
  getSucursales,
};
