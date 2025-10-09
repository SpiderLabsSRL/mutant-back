const membersListService = require("../services/memberslistservice");

// Ruta de prueba
const testRoute = async (req, res) => {
  try {
    res.json({
      success: true,
      message: "Ruta de members funcionando correctamente",
      user: req.user,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error en testRoute:", error);
    res.status(500).json({
      success: false,
      message: "Error en ruta de prueba",
      error: error.message,
    });
  }
};

// Obtener miembros con paginación y filtros
const getMembers = async (req, res) => {
  try {
    console.log("Query parameters recibidos:", req.query);
    console.log("Usuario autenticado:", req.user);

    const {
      page = 1,
      limit = 20,
      searchTerm = "",
      serviceFilter = "all",
      statusFilter = "all",
      sucursalFilter = "all",
    } = req.query;

    // Validar parámetros
    if (isNaN(page) || page < 1) {
      return res.status(400).json({
        success: false,
        message: "El parámetro page debe ser un número mayor a 0",
      });
    }

    if (isNaN(limit) || limit < 1) {
      return res.status(400).json({
        success: false,
        message: "El parámetro limit debe ser un número mayor a 0",
      });
    }

    // Obtener información del usuario autenticado
    const userSucursalId = req.user.idsucursal;
    const userRol = req.user.rol;

    const result = await membersListService.getMembers(
      parseInt(page),
      parseInt(limit),
      searchTerm,
      serviceFilter,
      statusFilter,
      sucursalFilter,
      userSucursalId,
      userRol
    );

    console.log(
      `Encontrados ${result.members.length} miembros de ${result.totalCount} totales`
    );

    res.json({
      success: true,
      members: result.members,
      totalCount: result.totalCount,
    });
  } catch (error) {
    console.error("Error en getMembers controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor al obtener miembros",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Obtener todos los miembros (sin paginación)
const getAllMembers = async (req, res) => {
  try {
    console.log("Query parameters para todos los miembros:", req.query);

    const {
      searchTerm = "",
      serviceFilter = "all",
      statusFilter = "all",
      sucursalFilter = "all",
    } = req.query;

    // Obtener información del usuario autenticado
    const userSucursalId = req.user.idsucursal;
    const userRol = req.user.rol;

    const result = await membersListService.getAllMembers(
      searchTerm,
      serviceFilter,
      statusFilter,
      sucursalFilter,
      userSucursalId,
      userRol
    );

    console.log(`Encontrados ${result.length} miembros en total`);

    res.json(result);
  } catch (error) {
    console.error("Error en getAllMembers controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor al obtener todos los miembros",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Editar miembro
const editMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombres, apellidos, ci, phone, birthDate } = req.body;

    console.log("Editando miembro:", {
      id,
      nombres,
      apellidos,
      ci,
      phone,
      birthDate,
    });

    if (!nombres || !apellidos || !ci || !phone || !birthDate) {
      return res.status(400).json({
        success: false,
        message:
          "Todos los campos son obligatorios: nombres, apellidos, ci, phone, birthDate",
      });
    }

    // NUEVA VALIDACIÓN: Permitir números y letras en CI
    if (!/^[a-zA-Z0-9]+$/.test(ci)) {
      return res.status(400).json({
        success: false,
        message: "La cédula de identidad solo puede contener letras y números",
      });
    }

    // NUEVA VALIDACIÓN: Longitud entre 7 y 12 caracteres
    if (ci.length < 7 || ci.length > 12) {
      return res.status(400).json({
        success: false,
        message: "La cédula de identidad debe tener entre 7 y 12 caracteres",
      });
    }

    // NUEVA VALIDACIÓN: No puede ser solo letras
    if (!/\d/.test(ci)) {
      return res.status(400).json({
        success: false,
        message: "La cédula de identidad debe contener al menos un número",
      });
    }

    // Validar formato de teléfono
    if (!/^[\d\s\-\+\(\)]+$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "El formato del teléfono no es válido",
      });
    }

    const updatedMember = await membersListService.editMember(
      id,
      nombres,
      apellidos,
      ci,
      phone,
      birthDate
    );

    res.json({
      success: true,
      message: "Miembro actualizado exitosamente",
      member: updatedMember,
    });
  } catch (error) {
    console.error("Error en editMember controller:", error);

    // Manejar específicamente el error de CI duplicado
    if (error.message.includes("La persona ya existe")) {
      return res.status(409).json({
        success: false,
        message: error.message,
        existingPerson: error.existingPerson,
      });
    }

    if (error.message.includes("no encontrado")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error interno del servidor al editar miembro",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Eliminar miembro
const deleteMember = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("Eliminando miembro ID:", id);

    const deletedMember = await membersListService.deleteMember(id);

    res.json({
      success: true,
      message: "Miembro eliminado exitosamente",
      member: deletedMember,
    });
  } catch (error) {
    console.error("Error en deleteMember controller:", error);

    if (error.message.includes("no encontrado")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error interno del servidor al eliminar miembro",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Obtener servicios disponibles
const getAvailableServices = async (req, res) => {
  try {
    const services = await membersListService.getAvailableServices();

    res.json(services);
  } catch (error) {
    console.error("Error en getAvailableServices controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor al obtener servicios disponibles",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const getAvailableBranches = async (req, res) => {
  try {
    const branches = await membersListService.getAvailableBranches();

    res.json(branches);
  } catch (error) {
    console.error("Error en getAvailableBranches controller:", error);
    res.status(500).json({
      success: false,
      message: "Error interno del servidor al obtener sucursales disponibles",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

module.exports = {
  testRoute,
  getMembers,
  getAllMembers,
  editMember,
  deleteMember,
  getAvailableServices,
  getAvailableBranches,
};