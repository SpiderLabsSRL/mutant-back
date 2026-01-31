const cashService = require("../services/cashService");

exports.getBranches = async (req, res) => {
  try {
    const branches = await cashService.getBranches();
    res.json(branches);
  } catch (error) {
    console.error("Error in getBranches:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getCashBoxesByBranch = async (req, res) => {
  try {
    const { branchId } = req.params;
    const cashBoxes = await cashService.getCashBoxesByBranch(branchId);
    res.json(cashBoxes);
  } catch (error) {
    console.error("Error in getCashBoxesByBranch:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getCashBoxStatus = async (req, res) => {
  try {
    const { cashBoxId } = req.params;
    const status = await cashService.getCashBoxStatus(cashBoxId);
    res.json(status);
  } catch (error) {
    console.error("Error in getCashBoxStatus:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTransactionsByCashBox = async (req, res) => {
  try {
    const { cashBoxId } = req.params;
    const {
      dateFilterType,
      specificDate,
      startDate,
      endDate,
      page = 1,
      pageSize = 20,
    } = req.query;

    console.log("🔍 Filtros recibidos en getTransactionsByCashBox:", {
      cashBoxId,
      dateFilterType,
      specificDate,
      startDate,
      endDate,
      page,
      pageSize,
    });

    // Preparar filtros
    const filters = {
      dateFilterType,
      specificDate,
      startDate,
      endDate,
    };

    // Validar página
    const pageNum = Math.max(1, parseInt(page));
    const pageSizeNum = Math.max(1, Math.min(parseInt(pageSize), 100));

    console.log(`📄 Solicitando página ${pageNum} con ${pageSizeNum} registros`);

    const result = await cashService.getTransactionsByCashBox(
      cashBoxId,
      filters,
      pageNum,
      pageSizeNum
    );

    console.log(`✅ Transacciones obtenidas: ${result.transactions.length} registros de página ${pageNum}`);

    res.json({
      transactions: result.transactions,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Error in getTransactionsByCashBox:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTransactionTotals = async (req, res) => {
  try {
    const {
      cashBoxId,
      dateFilterType,
      specificDate,
      startDate,
      endDate,
    } = req.query;

    console.log("📊 Filtros recibidos para totales de transacciones:", {
      cashBoxId,
      dateFilterType,
      specificDate,
      startDate,
      endDate,
    });

    // Preparar filtros
    const filters = {
      dateFilterType,
      specificDate,
      startDate,
      endDate,
    };

    console.log("📊 Calculando totales de transacciones con filtros:", filters);

    // Llamar al servicio para obtener totales
    const totals = await cashService.getTransactionTotals(cashBoxId, filters);

    console.log("✅ Totales de transacciones calculados:", totals);

    res.json(totals);
  } catch (error) {
    console.error("❌ Error in getTransactionTotals:", error);
    res.status(500).json({
      error: error.message || "Error al calcular los totales de transacciones",
    });
  }
};

exports.getLactobarTransactions = async (req, res) => {
  try {
    const { branchId } = req.params;
    const transactions = await cashService.getLactobarTransactionsByBranch(branchId);
    res.json(transactions);
  } catch (error) {
    console.error("Error in getLactobarTransactions:", error);
    res.status(500).json({ error: error.message });
  }
};