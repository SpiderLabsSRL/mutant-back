const newtransactionService = require("../services/newtransactionService");

exports.getTransactions = async (req, res) => {
  try {
    const transactions = await newtransactionService.getTransactions();
    res.json(transactions);
  } catch (error) {
    console.error("Error in getTransactions:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTransactionsByCashRegister = async (req, res) => {
  try {
    const { idCaja } = req.params;
    const transactions = await newtransactionService.getTransactionsByCashRegister(parseInt(idCaja));
    res.json(transactions);
  } catch (error) {
    console.error("Error in getTransactionsByCashRegister:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.createTransaction = async (req, res) => {
  try {
    const { tipo, descripcion, monto, id_caja, id_usuario } = req.body;
    
    if (!id_usuario) {
      return res.status(400).json({ error: "ID de usuario requerido" });
    }
    
    const transaction = await newtransactionService.createTransaction({
      tipo,
      descripcion,
      monto: parseFloat(monto),
      idCaja: parseInt(id_caja),
      idUsuario: parseInt(id_usuario)
    });
    
    res.status(201).json(transaction);
  } catch (error) {
    console.error("Error in createTransaction:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getCashRegisterStatus = async (req, res) => {
  try {
    const { idCaja } = req.params;
    const status = await newtransactionService.getCashRegisterStatus(parseInt(idCaja));
    res.json(status);
  } catch (error) {
    console.error("Error in getCashRegisterStatus:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getAssignedCashRegister = async (req, res) => {
  try {
    const { idUsuario } = req.query;
    
    if (!idUsuario) {
      return res.status(400).json({ error: "ID de usuario requerido" });
    }
    
    const idCaja = await newtransactionService.getAssignedCashRegister(parseInt(idUsuario));
    res.json({ idCaja });
  } catch (error) {
    console.error("Error in getAssignedCashRegister:", error);
    res.status(500).json({ 
      error: error.message,
      details: "El usuario no tiene una caja asignada o ocurrió un error interno"
    });
  }
};