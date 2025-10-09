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

exports.getTransactionsByCashRegisterAndUser = async (req, res) => {
  try {
    const { idCaja } = req.params;
    const { idUsuario } = req.query;
    
    if (!idUsuario) {
      return res.status(400).json({ error: "ID de usuario requerido" });
    }
    
    const transactions = await newtransactionService.getTransactionsByCashRegisterAndUser(
      parseInt(idCaja),
      parseInt(idUsuario)
    );
    res.json(transactions);
  } catch (error) {
    console.error("Error in getTransactionsByCashRegisterAndUser:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.createTransaction = async (req, res) => {
  try {
    const { tipo, descripcion, monto, caja_id, usuario_id } = req.body;
    
    if (!usuario_id) {
      return res.status(400).json({ error: "ID de usuario requerido" });
    }
    
    const transaction = await newtransactionService.createTransaction({
      tipo,
      descripcion,
      monto: parseFloat(monto),
      idCaja: parseInt(caja_id),
      idUsuario: parseInt(usuario_id)
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

exports.openCashRegister = async (req, res) => {
  try {
    const { caja_id, monto_inicial, usuario_id, descripcion } = req.body;
    
    if (!caja_id || monto_inicial === undefined || !usuario_id) {
      return res.status(400).json({ error: "Datos incompletos para abrir la caja" });
    }
    
    const result = await newtransactionService.openCashRegister(
      parseInt(caja_id),
      parseFloat(monto_inicial),
      parseInt(usuario_id),
      descripcion
    );
    
    res.status(201).json(result);
  } catch (error) {
    console.error("Error in openCashRegister:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.closeCashRegister = async (req, res) => {
  try {
    const { caja_id, monto_final, usuario_id, descripcion } = req.body;
    
    if (!caja_id || monto_final === undefined || !usuario_id) {
      return res.status(400).json({ error: "Datos incompletos para cerrar la caja" });
    }
    
    const result = await newtransactionService.closeCashRegister(
      parseInt(caja_id),
      parseFloat(monto_final),
      parseInt(usuario_id),
      descripcion
    );
    
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in closeCashRegister:", error);
    res.status(500).json({ error: error.message });
  }
};