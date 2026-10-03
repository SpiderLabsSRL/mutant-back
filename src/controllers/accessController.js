const accessService = require("../services/accessService");

// ============================================
// GET ACCESS LOGS
// ============================================
exports.getAccessLogs = async (req, res) => {
  try {
    const { search, type, limit, branchId } = req.query;

    const branchIdParsed = branchId ? parseInt(branchId) : null;

    const logs = await accessService.getAccessLogs(
      search,
      type,
      limit ? parseInt(limit) : 100,
      branchIdParsed
    );
    res.json(logs);
  } catch (error) {
    console.error("Error in getAccessLogs:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// SEARCH MEMBERS
// ============================================
exports.searchMembers = async (req, res) => {
  try {
    const { search, type, branchId } = req.query;
    if (!search || search.length < 2) {
      return res
        .status(400)
        .json({ message: "Término de búsqueda debe tener al menos 2 caracteres" });
    }

    const branchIdParsed =
      branchId !== undefined && branchId !== null && branchId !== ""
        ? parseInt(branchId)
        : null;

    const members = await accessService.searchMembers(
      search,
      type,
      branchIdParsed
    );
    res.json(members);
  } catch (error) {
    console.error("Error in searchMembers:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// GET CLIENT SUBSCRIPTIONS
// ============================================
exports.getClientSubscriptions = async (req, res) => {
  try {
    const { personId } = req.params;
    const { branchId } = req.query;

    const personIdNum = Number(personId);
    if (!personId || isNaN(personIdNum) || personIdNum <= 0) {
      return res.status(400).json({
        message: "personId inválido",
        received: personId,
      });
    }

    const branchIdNum = branchId ? Number(branchId) : null;
    const branchIdValid =
      branchIdNum && !isNaN(branchIdNum) ? branchIdNum : null;

    const subscriptions = await accessService.getClientSubscriptions(
      personIdNum,
      branchIdValid
    );

    res.json(subscriptions);
  } catch (error) {
    console.error("❌ Error en getClientSubscriptions:", error);
    res.status(500).json({
      message: error.message || "Error al obtener suscripciones",
    });
  }
};

// ============================================
// REGISTER CLIENT ACCESS
// ============================================
exports.registerClientAccess = async (req, res) => {
  try {
    const { personId, serviceId, branchId, userId } = req.body;

    if (!personId || !serviceId || !branchId || !userId) {
      return res.status(400).json({
        message: "Faltan parámetros requeridos",
        received: { personId, serviceId, branchId, userId },
      });
    }

    const result = await accessService.registerClientAccess(
      parseInt(personId),
      parseInt(serviceId),
      parseInt(branchId),
      parseInt(userId)
    );
    res.json(result);
  } catch (error) {
    console.error("Error in registerClientAccess:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// REGISTER EMPLOYEE CHECK-IN
// ============================================
exports.registerEmployeeCheckIn = async (req, res) => {
  try {
    const { employeeId, branchId, userId } = req.body;

    if (!employeeId || !branchId || !userId) {
      return res.status(400).json({ message: "Faltan parámetros requeridos" });
    }

    const result = await accessService.registerEmployeeCheckIn(
      parseInt(employeeId),
      parseInt(branchId),
      parseInt(userId)
    );
    res.json(result);
  } catch (error) {
    console.error("Error in registerEmployeeCheckIn:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// REGISTER EMPLOYEE CHECK-OUT
// ============================================
exports.registerEmployeeCheckOut = async (req, res) => {
  try {
    const { employeeId, branchId, userId } = req.body;

    if (!employeeId || !branchId || !userId) {
      return res.status(400).json({ message: "Faltan parámetros requeridos" });
    }

    const result = await accessService.registerEmployeeCheckOut(
      parseInt(employeeId),
      parseInt(branchId),
      parseInt(userId)
    );
    res.json(result);
  } catch (error) {
    console.error("Error in registerEmployeeCheckOut:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// REGISTER ACCESS DENIED
// ============================================
exports.registerAccessDeniedNoSubscription = async (req, res) => {
  try {
    const { personId, branchId, userId, memberName } = req.body;

    if (!personId || !branchId || !userId) {
      return res.status(400).json({ message: "Faltan parámetros requeridos" });
    }

    const result = await accessService.registerAccessDeniedNoActiveSubscription(
      parseInt(personId),
      parseInt(branchId),
      parseInt(userId),
      memberName
    );
    res.json(result);
  } catch (error) {
    console.error("Error in registerAccessDeniedNoSubscription:", error);
    res.status(500).json({ message: error.message });
  }
};