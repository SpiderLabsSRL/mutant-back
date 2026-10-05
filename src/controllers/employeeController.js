const employeeService = require("../services/employeeService");

// ============================================
// HELPER: Serializa errores de Postgres a mensajes legibles
// ============================================
function buildErrorResponse(error) {
  console.error("❌ Error en employeeController:", {
    message: error.message,
    code: error.code,
    detail: error.detail,
    where: error.where,
    table: error.table,
    constraint: error.constraint,
    column: error.column,
  });

  if (error.code === "23503") {
    // Foreign key violation
    return {
      status: 400,
      message: `No se puede modificar el empleado porque tiene registros asociados (${error.table || "otra tabla"}). Intenta solo desactivarlo en lugar de cambiar su rol.`,
    };
  }

  if (error.code === "23505") {
    // Unique violation
    if (error.constraint === "personas_ci_key") {
      return { status: 400, message: "ci_unique" };
    }
    if (error.constraint === "usuarios_username_key") {
      return { status: 400, message: "username_unique" };
    }
    // Fallback genérico de duplicado
    if (error.message?.includes("personas_ci_key")) {
      return { status: 400, message: "ci_unique" };
    }
    if (error.message?.includes("usuarios_username_key")) {
      return { status: 400, message: "username_unique" };
    }
    return {
      status: 400,
      message: `Valor duplicado: ${error.detail || error.message || "revisa los datos"}`,
    };
  }

  if (error.code === "42703") {
    // Column does not exist
    return {
      status: 500,
      message: `Error de esquema: la columna "${error.column || "?"}" no existe en la tabla "${error.table || "?"}".`,
    };
  }

  if (error.code === "23502") {
    // Not null violation
    return {
      status: 400,
      message: `Falta un campo obligatorio: ${error.column || "desconocido"}`,
    };
  }

  if (error.code === "22P02") {
    // Invalid text representation (ej: mandar string donde va integer)
    return {
      status: 400,
      message: `Formato de dato inválido en algún campo: ${error.message}`,
    };
  }

  // Fallback: siempre devolvemos algo
  const fallbackMessage =
    error.message && error.message.trim().length > 0
      ? error.message
      : "Error desconocido en el servidor. Revisa los logs.";

  return { status: 400, message: fallbackMessage };
}

// ============================================
// SUCURSALES
// ============================================
exports.getBranches = async (req, res) => {
  try {
    const branches = await employeeService.getBranches();
    res.json(branches);
  } catch (error) {
    console.error("Error en getBranches:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// CAJAS
// ============================================
exports.getBoxes = async (req, res) => {
  try {
    const boxes = await employeeService.getBoxes();
    res.json(boxes);
  } catch (error) {
    console.error("Error en getBoxes:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// EMPLEADOS
// ============================================
exports.getEmployees = async (req, res) => {
  try {
    const employees = await employeeService.getEmployees();
    res.json(employees);
  } catch (error) {
    console.error("Error en getEmployees:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.createEmployee = async (req, res) => {
  try {
    const employeeData = req.body;

    // Validaciones básicas
    if (
      !employeeData.nombres ||
      !employeeData.apellidos ||
      !employeeData.ci ||
      !employeeData.telefono ||
      !employeeData.cargo
    ) {
      return res
        .status(400)
        .json({ message: "Todos los campos son obligatorios" });
    }

    // Validar usuario y contraseña para roles administrativos
    if (["admin", "recepcionista"].includes(employeeData.cargo)) {
      if (!employeeData.username) {
        return res
          .status(400)
          .json({ message: "Usuario es obligatorio para este cargo" });
      }
      if (!employeeData.password && req.method === "POST") {
        return res
          .status(400)
          .json({ message: "Contraseña es obligatoria para este cargo" });
      }
    }

    // Validaciones para roles que requieren sucursal
    if (employeeData.cargo !== "admin") {
      if (!employeeData.sucursal_id) {
        return res
          .status(400)
          .json({ message: "Sucursal es obligatoria para este cargo" });
      }
      if (!employeeData.horarios || employeeData.horarios.length === 0) {
        return res
          .status(400)
          .json({ message: "Debe definir al menos un horario para este cargo" });
      }
    }

    // Validar caja solo para recepcionista
    if (employeeData.cargo === "recepcionista" && !employeeData.caja_id) {
      return res
        .status(400)
        .json({ message: "Caja es obligatoria para este cargo" });
    }

    const newEmployee = await employeeService.createEmployee(employeeData);
    res.status(201).json(newEmployee);
  } catch (error) {
    const { status, message } = buildErrorResponse(error);
    res.status(status).json({ message });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const employeeData = req.body;

    // Validaciones básicas
    if (
      !employeeData.nombres ||
      !employeeData.apellidos ||
      !employeeData.ci ||
      !employeeData.telefono ||
      !employeeData.cargo
    ) {
      return res
        .status(400)
        .json({ message: "Todos los campos son obligatorios" });
    }

    // Validar usuario para roles administrativos
    if (["admin", "recepcionista"].includes(employeeData.cargo)) {
      if (!employeeData.username) {
        return res
          .status(400)
          .json({ message: "Usuario es obligatorio para este cargo" });
      }
    }

    // Validaciones para roles que requieren sucursal
    if (employeeData.cargo !== "admin") {
      if (!employeeData.sucursal_id) {
        return res
          .status(400)
          .json({ message: "Sucursal es obligatoria para este cargo" });
      }
    }

    // Validar caja solo para recepcionista
    if (employeeData.cargo === "recepcionista" && !employeeData.caja_id) {
      return res
        .status(400)
        .json({ message: "Caja es obligatoria para este cargo" });
    }

    const updatedEmployee = await employeeService.updateEmployee(
      id,
      employeeData
    );
    res.json(updatedEmployee);
  } catch (error) {
    const { status, message } = buildErrorResponse(error);
    res.status(status).json({ message });
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    await employeeService.deleteEmployee(id);
    res.status(204).send();
  } catch (error) {
    const { status, message } = buildErrorResponse(error);
    res.status(status).json({ message });
  }
};

exports.toggleEmployeeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedEmployee = await employeeService.toggleEmployeeStatus(id);
    res.json(updatedEmployee);
  } catch (error) {
    const { status, message } = buildErrorResponse(error);
    res.status(status).json({ message });
  }
};

exports.registerFingerprint = async (req, res) => {
  try {
    const { id } = req.params;
    await employeeService.registerFingerprint(id);
    res.status(200).json({ message: "Huella registrada exitosamente" });
  } catch (error) {
    const { status, message } = buildErrorResponse(error);
    res.status(status).json({ message });
  }
};