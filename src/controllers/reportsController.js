const reportsService = require("../services/reportsService");

const getReportes = async (req, res) => {
  try {
    const {
      tipoFiltro,
      fechaEspecifica,
      fechaInicio,
      fechaFin,
      sucursalId
    } = req.query;

    const filtros = {
      tipoFiltro: tipoFiltro || 'all',
      fechaEspecifica,
      fechaInicio,
      fechaFin,
      sucursalId: sucursalId === 'all' ? null : sucursalId
    };

    const reportes = await reportsService.obtenerReportes(filtros);
    res.json(reportes);
  } catch (error) {
    console.error("Error en reportsController:", error);
    res.status(500).json({ 
      error: "Error al obtener los reportes",
      detalles: error.message 
    });
  }
};

const getSucursales = async (req, res) => {
  try {
    const sucursales = await reportsService.obtenerSucursales();
    res.json(sucursales);
  } catch (error) {
    console.error("Error en reportsController (sucursales):", error);
    res.status(500).json({ 
      error: "Error al obtener las sucursales",
      detalles: error.message 
    });
  }
};

module.exports = {
  getReportes,
  getSucursales
};