const reportsService = require("../services/reportsService");

// ============================================
// REPORTES GENERALES
// ============================================
const getReportes = async (req, res) => {
  try {
    const { tipoFiltro, fechaEspecifica, fechaInicio, fechaFin, sucursalId } = req.query;

    const filtros = {
      tipoFiltro: tipoFiltro || "today",
      fechaEspecifica: fechaEspecifica ? new Date(fechaEspecifica) : undefined,
      fechaInicio: fechaInicio ? new Date(fechaInicio) : undefined,
      fechaFin: fechaFin ? new Date(fechaFin) : undefined,
      sucursalId: sucursalId === "all" ? null : sucursalId,
    };

    const reportes = await reportsService.obtenerReportes(filtros);
    res.json(reportes);
  } catch (error) {
    console.error("Error en reportsController:", error);
    res.status(500).json({
      error: "Error al obtener los reportes",
      detalles: error.message,
    });
  }
};

const getIngresosServicios = async (req, res) => {
  try {
    const { tipoFiltro, fechaEspecifica, fechaInicio, fechaFin, sucursalId } = req.query;

    const filtros = {
      tipoFiltro: tipoFiltro || "today",
      fechaEspecifica: fechaEspecifica ? new Date(fechaEspecifica) : undefined,
      fechaInicio: fechaInicio ? new Date(fechaInicio) : undefined,
      fechaFin: fechaFin ? new Date(fechaFin) : undefined,
      sucursalId: sucursalId === "all" ? null : sucursalId,
    };

    const ingresosServicios = await reportsService.obtenerIngresosServicios(filtros);
    res.json(ingresosServicios);
  } catch (error) {
    console.error("Error en reportsController (ingresos servicios):", error);
    res.status(500).json({
      error: "Error al obtener los ingresos por servicio",
      detalles: error.message,
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
      detalles: error.message,
    });
  }
};

// ============================================
// OBJETIVOS MENSUALES
// ============================================
const getObjetivosMensuales = async (req, res) => {
  try {
    const { sucursalId, mes } = req.query;
    const objetivos = await reportsService.obtenerObjetivosMensuales(
      sucursalId === "all" ? null : sucursalId,
      mes || null
    );
    res.json(objetivos);
  } catch (error) {
    console.error("Error en getObjetivosMensuales:", error);
    res.status(500).json({ error: error.message });
  }
};

const guardarObjetivoMensual = async (req, res) => {
  try {
    const { sucursalId, mes, objetivo } = req.body;
    const usuarioId = req.user?.id || req.usuario?.id || null;

    if (!sucursalId || !mes || !objetivo) {
      return res.status(400).json({
        error: "sucursalId, mes y objetivo son obligatorios",
      });
    }

    if (Number(objetivo) <= 0) {
      return res.status(400).json({ error: "El objetivo debe ser mayor a 0" });
    }

    const result = await reportsService.guardarObjetivoMensual(
      sucursalId,
      mes,
      Number(objetivo),
      usuarioId
    );
    res.json(result);
  } catch (error) {
    console.error("Error en guardarObjetivoMensual:", error);
    res.status(500).json({ error: error.message });
  }
};

const eliminarObjetivoMensual = async (req, res) => {
  try {
    const { sucursalId, mes } = req.params;

    if (!sucursalId || !mes) {
      return res.status(400).json({ error: "sucursalId y mes son obligatorios" });
    }

    await reportsService.eliminarObjetivoMensual(sucursalId, mes);
    res.json({ success: true });
  } catch (error) {
    console.error("Error en eliminarObjetivoMensual:", error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// VENTAS REALES / RESUMEN / DESGLOSE
// ============================================
const getVentasRealesPorMes = async (req, res) => {
  try {
    const { sucursalId } = req.query;
    const ventas = await reportsService.obtenerVentasRealesPorMes(
      sucursalId === "all" ? null : sucursalId
    );
    res.json(ventas);
  } catch (error) {
    console.error("Error en getVentasRealesPorMes:", error);
    res.status(500).json({ error: error.message });
  }
};

const getResumenPorSucursal = async (req, res) => {
  try {
    const { tipoFiltro, fechaEspecifica, fechaInicio, fechaFin, sucursalId } = req.query;

    const filtros = {
      tipoFiltro: tipoFiltro || "thisMonth",
      fechaEspecifica: fechaEspecifica ? new Date(fechaEspecifica) : undefined,
      fechaInicio: fechaInicio ? new Date(fechaInicio) : undefined,
      fechaFin: fechaFin ? new Date(fechaFin) : undefined,
      sucursalId: sucursalId === "all" ? null : sucursalId,
    };

    const resumen = await reportsService.obtenerResumenPorSucursal(filtros);
    res.json(resumen);
  } catch (error) {
    console.error("Error en getResumenPorSucursal:", error);
    res.status(500).json({ error: error.message });
  }
};

const getDesglosePagos = async (req, res) => {
  try {
    const { tipoFiltro, fechaEspecifica, fechaInicio, fechaFin, sucursalId } = req.query;

    const filtros = {
      tipoFiltro: tipoFiltro || "thisMonth",
      fechaEspecifica: fechaEspecifica ? new Date(fechaEspecifica) : undefined,
      fechaInicio: fechaInicio ? new Date(fechaInicio) : undefined,
      fechaFin: fechaFin ? new Date(fechaFin) : undefined,
      sucursalId: sucursalId === "all" ? null : sucursalId,
    };

    const desglose = await reportsService.obtenerDesglosePagos(filtros);
    res.json(desglose);
  } catch (error) {
    console.error("Error en getDesglosePagos:", error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// DESGLOSE DE PRODUCTOS Y SERVICIOS
// ============================================
const getDesgloseProductos = async (req, res) => {
  try {
    const { tipoFiltro, fechaEspecifica, fechaInicio, fechaFin, sucursalId } = req.query;

    const filtros = {
      tipoFiltro: tipoFiltro || "thisMonth",
      fechaEspecifica: fechaEspecifica ? new Date(fechaEspecifica) : undefined,
      fechaInicio: fechaInicio ? new Date(fechaInicio) : undefined,
      fechaFin: fechaFin ? new Date(fechaFin) : undefined,
      sucursalId: sucursalId === "all" ? null : sucursalId,
    };

    const desglose = await reportsService.obtenerDesgloseProductos(filtros);
    res.json(desglose);
  } catch (error) {
    console.error("Error en getDesgloseProductos:", error);
    res.status(500).json({ error: error.message });
  }
};

const getDesgloseServicios = async (req, res) => {
  try {
    const { tipoFiltro, fechaEspecifica, fechaInicio, fechaFin, sucursalId } = req.query;

    const filtros = {
      tipoFiltro: tipoFiltro || "thisMonth",
      fechaEspecifica: fechaEspecifica ? new Date(fechaEspecifica) : undefined,
      fechaInicio: fechaInicio ? new Date(fechaInicio) : undefined,
      fechaFin: fechaFin ? new Date(fechaFin) : undefined,
      sucursalId: sucursalId === "all" ? null : sucursalId,
    };

    const desglose = await reportsService.obtenerDesgloseServicios(filtros);
    res.json(desglose);
  } catch (error) {
    console.error("Error en getDesgloseServicios:", error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// MOVIMIENTOS DE STOCK
// ============================================
const getMovimientosStock = async (req, res) => {
  try {
    const { fechaInicio, fechaFin, sucursalId } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ error: "fechaInicio y fechaFin son obligatorios" });
    }

    const movimientos = await reportsService.obtenerMovimientosStock(
      fechaInicio,
      fechaFin,
      sucursalId === "all" ? null : sucursalId
    );
    res.json(movimientos);
  } catch (error) {
    console.error("Error en getMovimientosStock:", error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// INSCRIPCIONES AGRUPADAS
// ============================================
const getInscripcionesAgrupadas = async (req, res) => {
  try {
    const { fechaInicio, fechaFin, servicioId, sucursalId } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ error: "fechaInicio y fechaFin son obligatorios" });
    }

    const inscripciones = await reportsService.obtenerInscripcionesAgrupadas(
      fechaInicio,
      fechaFin,
      servicioId === "all" ? null : servicioId,
      sucursalId === "all" ? null : sucursalId
    );
    res.json(inscripciones);
  } catch (error) {
    console.error("Error en getInscripcionesAgrupadas:", error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// LISTAS PARA FILTROS
// ============================================
const getProductosDisponibles = async (req, res) => {
  try {
    const productos = await reportsService.obtenerProductosDisponibles();
    res.json(productos);
  } catch (error) {
    console.error("Error en getProductosDisponibles:", error);
    res.status(500).json({ error: error.message });
  }
};

const getServiciosDisponibles = async (req, res) => {
  try {
    const servicios = await reportsService.obtenerServiciosDisponibles();
    res.json(servicios);
  } catch (error) {
    console.error("Error en getServiciosDisponibles:", error);
    res.status(500).json({ error: error.message });
  }
};
// ============================================
// REPORTE DE EMPLEADOS
// ============================================
const getEmpleadosReporte = async (req, res) => {
  try {
    const { sucursalId } = req.query;
    const empleados = await reportsService.obtenerEmpleadosReporte(
      sucursalId === "all" ? null : sucursalId
    );
    res.json(empleados);
  } catch (error) {
    console.error("Error en getEmpleadosReporte:", error);
    res.status(500).json({ error: error.message });
  }
};

const getAtrasosEmpleados = async (req, res) => {
  try {
    const { mes, sucursalId } = req.query;

    if (!mes) {
      return res.status(400).json({ error: "El mes es obligatorio (YYYY-MM)" });
    }

    const atrasos = await reportsService.obtenerAtrasosEmpleados(
      mes,
      sucursalId === "all" ? null : sucursalId
    );
    res.json(atrasos);
  } catch (error) {
    console.error("Error en getAtrasosEmpleados:", error);
    res.status(500).json({ error: error.message });
  }
};

const getPagosInformativos = async (req, res) => {
  try {
    const { mes, sucursalId } = req.query;

    if (!mes) {
      return res.status(400).json({ error: "El mes es obligatorio (YYYY-MM)" });
    }

    const pagos = await reportsService.obtenerPagosInformativos(
      mes,
      sucursalId === "all" ? null : sucursalId
    );
    res.json(pagos);
  } catch (error) {
    console.error("Error en getPagosInformativos:", error);
    res.status(500).json({ error: error.message });
  }
};

const actualizarSueldoEmpleado = async (req, res) => {
  try {
    const { id } = req.params;
    const { sueldoBase, comision } = req.body;

    await reportsService.actualizarSueldoEmpleado(id, sueldoBase, comision);
    res.json({ success: true });
  } catch (error) {
    console.error("Error en actualizarSueldoEmpleado:", error);
    res.status(500).json({ error: error.message });
  }
};

const getReportesZumba = async (req, res) => {
  try {
    const { mes, instructorId } = req.query;

    if (!mes) {
      return res.status(400).json({ error: "El mes es obligatorio (YYYY-MM)" });
    }

    const reportes = await reportsService.obtenerReportesZumba(mes, instructorId);
    res.json(reportes);
  } catch (error) {
    console.error("Error en getReportesZumba:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getReportes,
  getSucursales,
  getIngresosServicios,
  getObjetivosMensuales,
  guardarObjetivoMensual,
  eliminarObjetivoMensual,
  getVentasRealesPorMes,
  getResumenPorSucursal,
  getDesglosePagos,
  getDesgloseProductos,
  getDesgloseServicios,
  getMovimientosStock,
  getInscripcionesAgrupadas,
  getProductosDisponibles,
  getServiciosDisponibles,
  getEmpleadosReporte,
  getAtrasosEmpleados,
  getPagosInformativos,
  actualizarSueldoEmpleado,
  getReportesZumba,
};