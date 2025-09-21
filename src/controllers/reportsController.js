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
      tipoFiltro: tipoFiltro || 'today',
      fechaEspecifica: fechaEspecifica ? new Date(fechaEspecifica) : undefined,
      fechaInicio: fechaInicio ? new Date(fechaInicio) : undefined,
      fechaFin: fechaFin ? new Date(fechaFin) : undefined,
      sucursalId: sucursalId === 'all' ? null : sucursalId
    };

    console.log('Filtros recibidos en controller:', filtros);

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

// Nuevo endpoint para ingresos por servicio
const getIngresosServicios = async (req, res) => {
  try {
    const {
      tipoFiltro,
      fechaEspecifica,
      fechaInicio,
      fechaFin,
      sucursalId
    } = req.query;

    const filtros = {
      tipoFiltro: tipoFiltro || 'today',
      fechaEspecifica: fechaEspecifica ? new Date(fechaEspecifica) : undefined,
      fechaInicio: fechaInicio ? new Date(fechaInicio) : undefined,
      fechaFin: fechaFin ? new Date(fechaFin) : undefined,
      sucursalId: sucursalId === 'all' ? null : sucursalId
    };

    console.log('Filtros recibidos para ingresos servicios:', filtros);

    const ingresosServicios = await reportsService.obtenerIngresosServicios(filtros);
    res.json(ingresosServicios);
  } catch (error) {
    console.error("Error en reportsController (ingresos servicios):", error);
    res.status(500).json({ 
      error: "Error al obtener los ingresos por servicio",
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
  getSucursales,
  getIngresosServicios 
};