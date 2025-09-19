const salesService = require("../services/salescontrolService");

const getSales = async (req, res) => {
  try {
    const { 
      dateFilterType, 
      specificDate, 
      startDate, 
      endDate, 
      sucursal,
      empleadoId
    } = req.query;
    
    const filters = {
      dateFilterType,
      specificDate,
      startDate,
      endDate,
      sucursal,
      empleadoId
    };
    
    const sales = await salesService.getSales(filters);
    res.json(sales);
  } catch (error) {
    console.error("Error in getSales controller:", error);
    res.status(500).json({ error: error.message });
  }
};

const getSucursales = async (req, res) => {
  try {
    const sucursales = await salesService.getSucursales();
    res.json(sucursales);
  } catch (error) {
    console.error("Error in getSucursales controller:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getSales,
  getSucursales
};