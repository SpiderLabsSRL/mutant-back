const employeeService = require("../services/employeeService");

exports.getBranches = async (req, res) => {
  try {
    const branches = await employeeService.getBranches();
    res.json(branches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getBoxes = async (req, res) => {
  try {
    const boxes = await employeeService.getBoxes();
    res.json(boxes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEmployees = async (req, res) => {
  try {
    const employees = await employeeService.getEmployees();
    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createEmployee = async (req, res) => {
  try {
    const employeeData = req.body;
    
    // Validaciones básicas
    if (!employeeData.nombres || !employeeData.apellidos || !employeeData.ci || 
        !employeeData.telefono || !employeeData.cargo) {
      return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    // Validar usuario y contraseña para roles administrativos
    if (['admin', 'recepcionista'].includes(employeeData.cargo)) {
      if (!employeeData.username) {
        return res.status(400).json({ message: "Usuario es obligatorio para este cargo" });
      }
      // Solo validar password si se está creando nuevo empleado
      if (!employeeData.password && req.method === 'POST') {
        return res.status(400).json({ message: "Contraseña es obligatoria para este cargo" });
      }
    }

    // Validaciones específicas para roles que requieren sucursal
    if (employeeData.cargo !== 'admin') {
      if (!employeeData.sucursal_id) {
        return res.status(400).json({ message: "Sucursal es obligatoria para este cargo" });
      }
      
      // Validar que haya al menos un horario definido
      if (!employeeData.horarios || employeeData.horarios.length === 0) {
        return res.status(400).json({ message: "Debe definir al menos un horario para este cargo" });
      }
    }

    // Validar caja solo para recepcionista
    if (employeeData.cargo === 'recepcionista' && !employeeData.caja_id) {
      return res.status(400).json({ message: "Caja es obligatoria para este cargo" });
    }

    const newEmployee = await employeeService.createEmployee(employeeData);
    res.status(201).json(newEmployee);
  } catch (error) {
    if (error.message.includes('duplicate key value violates unique constraint "personas_ci_key"')) {
      return res.status(400).json({ message: "ci_unique" });
    } else if (error.message.includes('duplicate key value violates unique constraint "usuarios_username_key"')) {
      return res.status(400).json({ message: "username_unique" });
    }
    res.status(400).json({ message: error.message });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const employeeData = req.body;
    
    // Validaciones básicas
    if (!employeeData.nombres || !employeeData.apellidos || !employeeData.ci || 
        !employeeData.telefono || !employeeData.cargo) {
      return res.status(400).json({ message: "Todos los campos son obligatorios" });
    }

    // Validar usuario para roles administrativos
    if (['admin', 'recepcionista'].includes(employeeData.cargo)) {
      if (!employeeData.username) {
        return res.status(400).json({ message: "Usuario es obligatorio para este cargo" });
      }
    }

    // Validaciones específicas para roles que requieren sucursal
    if (employeeData.cargo !== 'admin') {
      if (!employeeData.sucursal_id) {
        return res.status(400).json({ message: "Sucursal es obligatoria para este cargo" });
      }
    }

    // Validar caja solo para recepcionista
    if (employeeData.cargo === 'recepcionista' && !employeeData.caja_id) {
      return res.status(400).json({ message: "Caja es obligatoria para este cargo" });
    }

    const updatedEmployee = await employeeService.updateEmployee(id, employeeData);
    res.json(updatedEmployee);
  } catch (error) {
    if (error.message.includes('duplicate key value violates unique constraint "personas_ci_key"')) {
      return res.status(400).json({ message: "ci_unique" });
    } else if (error.message.includes('duplicate key value violates unique constraint "usuarios_username_key"')) {
      return res.status(400).json({ message: "username_unique" });
    }
    res.status(400).json({ message: error.message });
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    await employeeService.deleteEmployee(id);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.toggleEmployeeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedEmployee = await employeeService.toggleEmployeeStatus(id);
    res.json(updatedEmployee);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.registerFingerprint = async (req, res) => {
  try {
    const { id } = req.params;
    await employeeService.registerFingerprint(id);
    res.status(200).json({ message: "Huella registrada exitosamente" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};