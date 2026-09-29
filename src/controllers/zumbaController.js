const zumbaService = require("../services/zumbaService");

// ============================================
// GET INSTRUCTORS
// ============================================
exports.getInstructors = async (req, res) => {
  try {
    // branchId opcional: ?branchId=2
    const branchId = req.query.branchId ? parseInt(req.query.branchId) : null;

    const instructores = await zumbaService.getInstructors(branchId);
    res.json(instructores);
  } catch (error) {
    console.error("Error en getInstructors:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener instructores",
    });
  }
};

// ============================================
// GET REPORTS
// ============================================
exports.getReports = async (req, res) => {
  try {
    const { dateFrom, dateTo, instructorId } = req.query;

    const reports = await zumbaService.getReports({
      dateFrom,
      dateTo,
      instructorId: instructorId ? parseInt(instructorId) : null,
    });

    res.json(reports);
  } catch (error) {
    console.error("Error en getReports:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener reportes",
    });
  }
};

// ============================================
// GET REPORT BY DATE
// ============================================
exports.getReportByDate = async (req, res) => {
  try {
    const { date } = req.params;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Fecha requerida",
      });
    }

    const report = await zumbaService.getReportByDate(date);
    res.json(report);
  } catch (error) {
    console.error("Error en getReportByDate:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener el reporte",
    });
  }
};

// ============================================
// SAVE REPORT
// ============================================
exports.saveReport = async (req, res) => {
  try {
    const { fecha, instructorId, numeroPersonas, registradoPorId } = req.body;

    if (!fecha || !instructorId || numeroPersonas === undefined) {
      return res.status(400).json({
        success: false,
        message: "fecha, instructorId y numeroPersonas son requeridos",
      });
    }

    if (numeroPersonas < 0) {
      return res.status(400).json({
        success: false,
        message: "numeroPersonas debe ser mayor o igual a 0",
      });
    }

    const report = await zumbaService.saveReport({
      fecha,
      instructorId: parseInt(instructorId),
      numeroPersonas: parseInt(numeroPersonas),
      registradoPorId: registradoPorId ? parseInt(registradoPorId) : null,
    });

    res.status(201).json(report);
  } catch (error) {
    console.error("Error en saveReport:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al guardar el reporte",
    });
  }
};

// ============================================
// DELETE REPORT
// ============================================
exports.deleteReport = async (req, res) => {
  try {
    const { id } = req.params;

    await zumbaService.deleteReport(parseInt(id));
    res.status(204).send();
  } catch (error) {
    console.error("Error en deleteReport:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al eliminar el reporte",
    });
  }
};

// ============================================
// GET STATS
// ============================================
exports.getStats = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;

    const stats = await zumbaService.getStats({ dateFrom, dateTo });
    res.json(stats);
  } catch (error) {
    console.error("Error en getStats:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener estadísticas",
    });
  }
};