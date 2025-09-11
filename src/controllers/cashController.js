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
    const transactions = await cashService.getTransactionsByCashBox(cashBoxId);
    res.json(transactions);
  } catch (error) {
    console.error("Error in getTransactionsByCashBox:", error);
    res.status(500).json({ error: error.message });
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