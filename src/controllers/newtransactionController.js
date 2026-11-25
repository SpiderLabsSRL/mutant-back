// src/controllers/newtransactionController.js
const newtransactionService = require("../services/newtransactionService");

// ============================================
// GET ALL TRANSACTIONS
// ============================================
exports.getTransactions = async (req, res) => {
  try {
    const transactions = await newtransactionService.getTransactions();
    res.json(transactions);
  } catch (error) {
    console.error("Error in getTransactions:", error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// GET TRANSACTIONS BY CASH REGISTER AND USER
// ============================================
exports.getTransactionsByCashRegisterAndUser = async (req, res) => {
  try {
    const { idCaja } = req.params;
    const { idUsuario } = req.query;

    if (!idUsuario) {
      return res.status(400).json({ error: "ID de usuario requerido" });
    }

    const transactions =
      await newtransactionService.getTransactionsByCashRegisterAndUser(
        parseInt(idCaja),
        parseInt(idUsuario)
      );
    res.json(transactions);
  } catch (error) {
    console.error("Error in getTransactionsByCashRegisterAndUser:", error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// CREATE TRANSACTION
// ============================================
exports.createTransaction = async (req, res) => {
  try {
    const { tipo, descripcion, monto, caja_id, usuario_id, metodo } = req.body;

    if (!usuario_id) {
      return res.status(400).json({ error: "ID de usuario requerido" });
    }

    if (!tipo || !["ingreso", "egreso"].includes(tipo)) {
      return res
        .status(400)
        .json({ error: "Tipo inválido. Debe ser 'ingreso' o 'egreso'" });
    }

    const metodoFinal = metodo || "efectivo";
    if (!["efectivo", "qr"].includes(metodoFinal)) {
      return res
        .status(400)
        .json({ error: "Método inválido. Debe ser 'efectivo' o 'qr'" });
    }

    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      return res.status(400).json({ error: "El monto debe ser mayor a 0" });
    }

    const transaction = await newtransactionService.createTransaction({
      tipo,
      descripcion,
      monto: montoNum,
      idCaja: parseInt(caja_id),
      idUsuario: parseInt(usuario_id),
      metodo: metodoFinal,
    });

    res.status(201).json(transaction);
  } catch (error) {
    console.error("Error in createTransaction:", error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// GET CASH REGISTER STATUS
// ============================================
exports.getCashRegisterStatus = async (req, res) => {
  try {
    const { idCaja } = req.params;
    const status = await newtransactionService.getCashRegisterStatus(
      parseInt(idCaja)
    );
    res.json(status);
  } catch (error) {
    console.error("Error in getCashRegisterStatus:", error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// GET ASSIGNED CASH REGISTER
// Recibe idUsuario (obligatorio) y sucursalId (opcional, para admin)
// ============================================
exports.getAssignedCashRegister = async (req, res) => {
  try {
    const { idUsuario, sucursalId } = req.query;

    if (!idUsuario) {
      return res.status(400).json({ error: "ID de usuario requerido" });
    }

    const idCaja = await newtransactionService.getAssignedCashRegister(
      parseInt(idUsuario),
      sucursalId ? parseInt(sucursalId) : null
    );
    res.json({ idCaja });
  } catch (error) {
    console.error("Error in getAssignedCashRegister:", error);
    res.status(500).json({
      error: error.message,
      details:
        "El usuario no tiene una caja asignada o ocurrió un error interno",
    });
  }
};

// ============================================
// OPEN CASH REGISTER
// ============================================
exports.openCashRegister = async (req, res) => {
  try {
    const { caja_id, monto_inicial, usuario_id, descripcion, monto_qr } =
      req.body;

    if (!caja_id || monto_inicial === undefined || !usuario_id) {
      return res
        .status(400)
        .json({ error: "Datos incompletos para abrir la caja" });
    }

    const result = await newtransactionService.openCashRegister(
      parseInt(caja_id),
      parseFloat(monto_inicial),
      parseInt(usuario_id),
      descripcion,
      monto_qr === undefined || monto_qr === null || monto_qr === ""
        ? null
        : parseFloat(monto_qr)
    );

    res.status(201).json(result);
  } catch (error) {
    console.error("Error in openCashRegister:", error);
    res.status(500).json({ error: error.message });
  }
};

// ============================================
// CLOSE CASH REGISTER
// ============================================
exports.closeCashRegister = async (req, res) => {
  try {
    const { caja_id, monto_final, usuario_id, descripcion, monto_qr } =
      req.body;

    if (!caja_id || monto_final === undefined || !usuario_id) {
      return res
        .status(400)
        .json({ error: "Datos incompletos para cerrar la caja" });
    }

    const result = await newtransactionService.closeCashRegister(
      parseInt(caja_id),
      parseFloat(monto_final),
      parseInt(usuario_id),
      descripcion,
      monto_qr === undefined || monto_qr === null || monto_qr === ""
        ? null
        : parseFloat(monto_qr)
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in closeCashRegister:", error);
    res.status(500).json({ error: error.message });
  }
};