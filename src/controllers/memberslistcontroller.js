// server/controllers/memberslistcontroller.js
const membersListService = require("../services/memberslistservice");
const { query } = require("../../db");

async function resolveUserSucursalId(req) {
  if (req.user?.sucursal_id) {
    return Number(req.user.sucursal_id);
  }

  const empleadoId = req.user?.idempleado || req.user?.empleado_id;
  const usuarioId = req.user?.idusuario || req.user?.id;

  try {
    if (empleadoId) {
      const r = await query(
        `SELECT sucursal_id FROM empleados WHERE id = $1 AND estado = 1`,
        [empleadoId]
      );
      if (r.rows.length > 0) return r.rows[0].sucursal_id;
    }

    if (usuarioId) {
      const r = await query(
        `SELECT e.sucursal_id 
         FROM usuarios u 
         INNER JOIN empleados e ON u.empleado_id = e.id 
         WHERE u.id = $1 AND e.estado = 1`,
        [usuarioId]
      );
      if (r.rows.length > 0) return r.rows[0].sucursal_id;
    }
  } catch (err) {
    console.error("Error resolviendo sucursal_id:", err);
  }

  return null;
}

const getMembers = async (req, res) => {
  try {
    const {
      page = 1,
      searchTerm = "",
      serviceFilter = "all",
      statusFilter = "all",
      sucursalFilter = "all",
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = 10;
    const search = searchTerm || "";
    const service = serviceFilter || "all";
    const status = statusFilter || "all";
    const sucursal = sucursalFilter || "all";

    const userSucursalId = await resolveUserSucursalId(req);

    const result = await membersListService.getMembers(
      pageNum,
      limitNum,
      search,
      service,
      status,
      sucursal,
      userSucursalId,
      req.user?.rol
    );

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

const getAllMembers = async (req, res) => {
  try {
    const {
      searchTerm = "",
      serviceFilter = "all",
      statusFilter = "all",
      sucursalFilter = "all",
    } = req.query;

    const userSucursalId = await resolveUserSucursalId(req);

    const members = await membersListService.getAllMembers(
      searchTerm || "",
      serviceFilter || "all",
      statusFilter || "all",
      sucursalFilter || "all",
      userSucursalId,
      req.user?.rol
    );

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

// ✅ editMember: ya no recibe ni actualiza birthDate
const editMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombres, apellidos, ci, phone } = req.body;

    console.log("Controlador editMember - Datos recibidos:", {
      id,
      nombres,
      apellidos,
      ci,
      phone,
      userRol: req.user?.rol,
    });

    if (!nombres || !apellidos || !ci || !phone) {
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
      phone
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

const deleteMember = async (req, res) => {
  try {
    const { id } = req.params;

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

const getAvailableServices = async (req, res) => {
  try {
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

const getAvailableBranches = async (req, res) => {
  try {
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

const testRoute = async (req, res) => {
  res.json({
    success: true,
    message: "Ruta de prueba funcionando",
    timestamp: new Date().toISOString(),
  });
};

const updateInscriptionDates = async (req, res) => {
  try {
    const { id } = req.params;
    const { serviceName, startDate, expirationDate } = req.body;

    if (!serviceName || !startDate || !expirationDate) {
      return res.status(400).json({
        success: false,
        message: "serviceName, startDate y expirationDate son requeridos",
      });
    }

    const usuarioId = req.user?.idusuario || req.user?.id;
    const sucursalId = await resolveUserSucursalId(req);

    if (!usuarioId) {
      return res.status(401).json({
        success: false,
        message: "No se pudo identificar al usuario autenticado",
      });
    }

    const result = await membersListService.updateInscriptionDates(
      id,
      serviceName,
      startDate,
      expirationDate,
      { usuarioId, sucursalId }
    );

    res.json({
      success: true,
      message: "Fechas actualizadas exitosamente",
      data: result,
    });
  } catch (error) {
    console.error("Error en updateInscriptionDates controller:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Error al actualizar fechas",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

module.exports = {
  getMembers,
  getAllMembers,
  editMember,
  deleteMember,
  updateInscriptionDates,
  getAvailableServices,
  getAvailableBranches,
  testRoute,
};