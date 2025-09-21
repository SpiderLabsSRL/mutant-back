const accessService = require("../services/accessService");

exports.getAccessLogs = async (req, res) => {
  try {
    const { search, type, limit, branchId } = req.query;
    
    // Convertir branchId a número si existe
    const parsedBranchId = branchId ? parseInt(branchId) : undefined;
    
    const logs = await accessService.getAccessLogs(
      search, 
      type, 
      limit ? parseInt(limit) : 100,
      parsedBranchId
    );
    res.json(logs);
  } catch (error) {
    console.error("Error in getAccessLogs:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.searchMembers = async (req, res) => {
  try {
    const { search, type, branchId } = req.query;
    if (!search || search.length < 2) {
      return res.status(400).json({ message: "Término de búsqueda debe tener al menos 2 caracteres" });
    }
    
    // Convertir branchId a número si existe
    const parsedBranchId = branchId ? parseInt(branchId) : undefined;
    
    const members = await accessService.searchMembers(search, type, parsedBranchId);
    res.json(members);
  } catch (error) {
    console.error("Error in searchMembers:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.registerClientAccess = async (req, res) => {
  try {
    const { personId, serviceId, branchId, userId } = req.body;
    
    if (!personId || !serviceId || !branchId || !userId) {
      return res.status(400).json({ message: "Faltan parámetros requeridos" });
    }
    
    const result = await accessService.registerClientAccess(personId, serviceId, branchId, userId);
    res.json(result);
  } catch (error) {
    console.error("Error in registerClientAccess:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.registerEmployeeCheckIn = async (req, res) => {
  try {
    const { employeeId, branchId, userId } = req.body;
    
    if (!employeeId || !branchId || !userId) {
      return res.status(400).json({ message: "Faltan parámetros requeridos" });
    }
    
    const result = await accessService.registerEmployeeCheckIn(employeeId, branchId, userId);
    res.json(result);
  } catch (error) {
    console.error("Error in registerEmployeeCheckIn:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.registerEmployeeCheckOut = async (req, res) => {
  try {
    const { employeeId, branchId, userId } = req.body;
    
    if (!employeeId || !branchId || !userId) {
      return res.status(400).json({ message: "Faltan parámetros requeridos" });
    }
    
    const result = await accessService.registerEmployeeCheckOut(employeeId, branchId, userId);
    res.json(result);
  } catch (error) {
    console.error("Error in registerEmployeeCheckOut:", error);
    res.status(500).json({ message: error.message });
  }
};