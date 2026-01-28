const membersListService = require("../services/memberslistservice");

// Obtener miembros con paginación
const getMembers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      searchTerm = "",
      serviceFilter = "all",
      statusFilter = "all",
      sucursalFilter = "all",
    } = req.query;

    console.log("Controlador getMembers - Parámetros recibidos:", {
      page,
      limit,
      searchTerm,
      serviceFilter,
      statusFilter,
      sucursalFilter,
      userSucursalId: req.user?.sucursal_id,
      userRol: req.user?.rol,
    });

    // Validar parámetros de paginación
    const pageNum = parseInt(page) || 1;
    const limitNum = 10; // Fijo en 10
    const search = searchTerm || "";
    const service = serviceFilter || "all";
    const status = statusFilter || "all";
    const sucursal = sucursalFilter || "all";

    const result = await membersListService.getMembers(
      pageNum,
      limitNum,
      search,
      service,
      status,
      sucursal,
      req.user?.sucursal_id,
      req.user?.rol
    );

    console.log("Resultado de getMembers:", {
      totalCount: result.totalCount,
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      itemsPerPage: result.itemsPerPage,
      membersCount: result.members.length,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error en getMembers controller:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener miembros",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// Obtener todos los miembros para exportar (sin paginación)
const getAllMembers = async (req, res) => {
  try {
    const {
      searchTerm = "",
      serviceFilter = "all",
      statusFilter = "all",
      sucursalFilter = "all",
    } = req.query;

    console.log("Controlador getAllMembers - Parámetros recibidos:", {
      searchTerm,
      serviceFilter,
      statusFilter,
      sucursalFilter,
      userSucursalId: req.user?.sucursal_id,
      userRol: req.user?.rol,
    });

    const members = await membersListService.getAllMembers(
      searchTerm || "",
      serviceFilter || "all",
      statusFilter || "all",
      sucursalFilter || "all",
      req.user?.sucursal_id,
      req.user?.rol
    );

    console.log("Resultado de getAllMembers:", {
      membersCount: members.length,
    });

    res.json(members);
  } catch (error) {
    console.error("Error en getAllMembers controller:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener todos los miembros",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// Editar miembro
const editMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombres, apellidos, ci, phone, birthDate } = req.body;

    console.log("Controlador editMember - Datos recibidos:", {
      id,
      nombres,
      apellidos,
      ci,
      phone,
      birthDate,
      userRol: req.user?.rol,
    });

    // Validar datos requeridos
    if (!nombres || !apellidos || !ci || !phone || !birthDate) {
      return res.status(400).json({
        success: false,
        message: "Todos los campos son requeridos",
      });
    }

    const result = await membersListService.editMember(
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
      data: result,
    });
  } catch (error) {
    console.error("Error en editMember controller:", error);

    if (error.message.includes("La persona ya existe")) {
      return res.status(409).json({
        success: false,
        message: error.message,
        existingPerson: error.existingPerson,
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || "Error al editar miembro",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// Eliminar miembro
const deleteMember = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("Controlador deleteMember - ID recibido:", {
      id,
      userRol: req.user?.rol,
    });

    const result = await membersListService.deleteMember(id);

    res.json({
      success: true,
      message: "Miembro eliminado exitosamente",
      data: result,
    });
  } catch (error) {
    console.error("Error en deleteMember controller:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al eliminar miembro",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// Obtener servicios disponibles
const getAvailableServices = async (req, res) => {
  try {
    console.log("Controlador getAvailableServices - Usuario:", req.user);

    const services = await membersListService.getAvailableServices();

    res.json(services);
  } catch (error) {
    console.error("Error en getAvailableServices controller:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener servicios disponibles",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// Obtener sucursales disponibles
const getAvailableBranches = async (req, res) => {
  try {
    console.log("Controlador getAvailableBranches - Usuario:", req.user);

    const branches = await membersListService.getAvailableBranches();

    res.json(branches);
  } catch (error) {
    console.error("Error en getAvailableBranches controller:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener sucursales disponibles",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// Ruta de prueba
const testRoute = async (req, res) => {
  res.json({
    success: true,
    message: "Ruta de prueba funcionando",
    timestamp: new Date().toISOString(),
  });
};

module.exports = {
  getMembers,
  getAllMembers,
  editMember,
  deleteMember,
  getAvailableServices,
  getAvailableBranches,
  testRoute,
};