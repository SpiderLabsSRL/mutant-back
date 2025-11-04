const accessService = require("../services/accessService");

exports.getAccessLogs = async (req, res) => {
  try {
    const { search, type, limit, branchId } = req.query;
    
    const logs = await accessService.getAccessLogs(
      search, 
      type, 
      limit ? parseInt(limit) : 100,
      parseInt(branchId)
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
    
    const members = await accessService.searchMembers(search, type, parseInt(branchId));
    res.json(members);
  } catch (error) {
    console.error("Error in searchMembers:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.registerClientAccess = async (req, res) => {
  try {
    const { personId, serviceId, branchId, userId } = req.body;
    
    console.log("Datos recibidos para acceso:", { personId, serviceId, branchId, userId });
    
    if (!personId || !serviceId || !branchId || !userId) {
      return res.status(400).json({ 
        message: "Faltan parámetros requeridos",
        received: { personId, serviceId, branchId, userId }
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