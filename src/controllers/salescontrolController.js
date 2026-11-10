// backend/controllers/salescontrolController.js
const salesService = require("../services/salescontrolService");
const { query } = require("../../db");

// ============================================
// HELPERS
// ============================================
async function resolveUserSucursalId(req) {
  if (req.user?.idsucursal) {
    return Number(req.user.idsucursal);
  }
  const empleadoId = req.user?.idempleado || req.user?.empleado_id;
  const usuarioId = req.user?.idusuario || req.user?.id;

  try {
    if (empleadoId) {
      const r = await query(
        `SELECT sucursal_id FROM empleados WHERE id = $1::int AND estado = 1`,
        [empleadoId]
      );
      if (r.rows.length > 0) return r.rows[0].sucursal_id;
    }
    if (usuarioId) {
      const r = await query(
        `SELECT e.sucursal_id 
         FROM usuarios u 
         INNER JOIN empleados e ON u.empleado_id = e.id 
         WHERE u.id = $1::int AND e.estado = 1`,
        [usuarioId]
      );
      if (r.rows.length > 0) return r.rows[0].sucursal_id;
    }
  } catch (err) {
    console.error("Error resolviendo sucursal_id:", err);
  }
  return null;
}

async function resolveUserEmpleadoId(req) {
  const usuarioId = req.user?.idusuario || req.user?.id;
  if (!usuarioId) return null;

  try {
    const r = await query(
      `SELECT empleado_id FROM usuarios WHERE id = $1::int LIMIT 1`,
      [usuarioId]
    );
    if (r.rows.length > 0 && r.rows[0].empleado_id) {
      return Number(r.rows[0].empleado_id);
    }
    const personaId = req.user?.idpersona || req.user?.persona_id;
    if (personaId) {
      const r2 = await query(
        `SELECT id FROM empleados 
         WHERE persona_id = $1::int AND estado = 1 
         LIMIT 1`,
        [personaId]
      );
      if (r2.rows.length > 0) return Number(r2.rows[0].id);
    }
    return null;
  } catch (err) {
    console.error("❌ Error en resolveUserEmpleadoId:", err);
    return null;
  }
}

async function resolveUsuarioIdForzado(req) {
  const usuarioId = req.user?.idusuario || req.user?.id;
  if (usuarioId) return Number(usuarioId);

  const empleadoId = await resolveUserEmpleadoId(req);
  if (empleadoId) {
    try {
      const r = await query(
        `SELECT id FROM usuarios WHERE empleado_id = $1::int LIMIT 1`,
        [empleadoId]
      );
      if (r.rows.length > 0) return Number(r.rows[0].id);
    } catch (err) {
      console.error("Error resolviendo usuario por empleado:", err);
    }
  }
  return null;
}

function normalizeRol(rol) {
  return (rol || "").toString().toLowerCase().trim();
}

function buildFiltersFromQuery(query) {
  const {
    dateFilterType = "today",
    specificDate,
    startDate,
    endDate,
    sucursal,
    empleadoId,
    metodoPago,
    tipo,
  } = query;

  return {
    dateFilterType: dateFilterType || "today",
    specificDate: specificDate || null,
    startDate: startDate || null,
    endDate: endDate || null,
    sucursal: sucursal === "all" || !sucursal ? null : sucursal,
    empleadoId: empleadoId === "all" || !empleadoId ? null : empleadoId,
    metodoPago: metodoPago === "all" || !metodoPago ? null : metodoPago,
    tipo: tipo === "servicio" ? "servicio" : "producto",
  };
}

function validateFilters(filters) {
  if (filters.dateFilterType === "range") {
    if (!filters.startDate || !filters.endDate) {
      return "Para rango de fechas, debe especificar fecha inicio y fecha fin";
    }
    if (new Date(filters.startDate) > new Date(filters.endDate)) {
      return "La fecha inicio no puede ser mayor a la fecha fin";
    }
  }
  if (filters.dateFilterType === "specific" && !filters.specificDate) {
    return "Para fecha específica, debe seleccionar una fecha";
  }
  return null;
}

async function resolveEmpleadoIdForzado(req, filters) {
  const userRol = normalizeRol(req.user?.rol);
  let empleadoIdEfectivo = filters.empleadoId;

  if (userRol === "recepcionista") {
    const usuarioIdForzado = await resolveUsuarioIdForzado(req);
    empleadoIdEfectivo = usuarioIdForzado ? usuarioIdForzado.toString() : null;
  }

  return { empleadoIdEfectivo, userRol };
}

// ============================================
// GET SALES
// ============================================
const getSales = async (req, res) => {
  try {
    const filters = buildFiltersFromQuery(req.query);
    const validationError = validateFilters(filters);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const userSucursalId = await resolveUserSucursalId(req);
    const { empleadoIdEfectivo, userRol } = await resolveEmpleadoIdForzado(
      req,
      filters
    );

    if (userRol === "recepcionista" && !empleadoIdEfectivo) {
      return res.json({
        sales: [],
        pagination: {
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
        },
      });
    }

    const finalFilters = { ...filters, empleadoId: empleadoIdEfectivo };

    const pageNum = Math.max(1, parseInt(req.query.page) || 1);
    const pageSizeNum = Math.max(
      1,
      Math.min(parseInt(req.query.pageSize) || 20, 200)
    );

    const result = await salesService.getSales(
      finalFilters,
      pageNum,
      pageSizeNum,
      userSucursalId,
      userRol
    );

    res.json({ sales: result.sales, pagination: result.pagination });
  } catch (error) {
    console.error("❌ Error in getSales controller:", error);
    res.status(500).json({
      error: error.message || "Error al obtener las ventas",
      details:
        process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// ============================================
// GET TOTALS
// ============================================
const getTotals = async (req, res) => {
  try {
    const filters = buildFiltersFromQuery(req.query);
    const validationError = validateFilters(filters);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const userSucursalId = await resolveUserSucursalId(req);
    const { empleadoIdEfectivo, userRol } = await resolveEmpleadoIdForzado(
      req,
      filters
    );

    if (userRol === "recepcionista" && !empleadoIdEfectivo) {
      return res.json({
        totalGeneral: 0,
        efectivoGeneral: 0,
        qrGeneral: 0,
        totalProductos: 0,
        efectivoProductos: 0,
        qrProductos: 0,
        totalServicios: 0,
        efectivoServicios: 0,
        qrServicios: 0,
      });
    }

    const finalFilters = { ...filters, empleadoId: empleadoIdEfectivo };
    const totals = await salesService.getTotals(
      finalFilters,
      userSucursalId,
      userRol
    );
    res.json(totals);
  } catch (error) {
    console.error("❌ Error in getTotals controller:", error);
    res.status(500).json({
      error: error.message || "Error al calcular los totales",
      details:
        process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// ============================================
// GET RESUMEN DETALLADO
// ============================================
const getResumen = async (req, res) => {
  try {
    const filters = buildFiltersFromQuery(req.query);
    const validationError = validateFilters(filters);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const userSucursalId = await resolveUserSucursalId(req);
    const { empleadoIdEfectivo, userRol } = await resolveEmpleadoIdForzado(
      req,
      filters
    );

    if (userRol === "recepcionista" && !empleadoIdEfectivo) {
      return res.json({
        productos: {
          items: [],
          totalGeneral: 0,
          totalEfectivo: 0,
          totalQr: 0,
        },
        servicios: {
          items: [],
          totalGeneral: 0,
          totalEfectivo: 0,
          totalQr: 0,
        },
      });
    }

    const finalFilters = { ...filters, empleadoId: empleadoIdEfectivo };
    const resumen = await salesService.getResumen(
      finalFilters,
      userSucursalId,
      userRol
    );
    res.json(resumen);
  } catch (error) {
    console.error("❌ Error in getResumen controller:", error);
    res.status(500).json({
      error: error.message || "Error al calcular el resumen",
      details:
        process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// ============================================
// GET SALE DETAILS
// ============================================
const getSaleDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query;

    if (!id || !type) {
      return res
        .status(400)
        .json({ error: "ID y tipo de venta son requeridos" });
    }

    const details = await salesService.getSaleDetails(id, type);
    res.json(details);
  } catch (error) {
    console.error("❌ Error in getSaleDetails controller:", error);
    res.status(500).json({
      error: error.message || "Error al obtener los detalles de la venta",
      details:
        process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// ============================================
// GET SUCURSALES
// ============================================
const getSucursales = async (req, res) => {
  try {
    const sucursales = await salesService.getSucursales();
    res.json(sucursales);
  } catch (error) {
    console.error("❌ Error in getSucursales controller:", error);
    res.status(500).json({
      error: error.message || "Error al obtener las sucursales",
      details:
        process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// ============================================
// GET EMPLEADOS (solo recepcionistas)
// ============================================
const getEmpleados = async (req, res) => {
  try {
    const userRol = normalizeRol(req.user?.rol);
    const esAdminGlobal = userRol === "admin" || userRol === "superadmin";

    let sucursalFiltro =
      req.query.sucursal && req.query.sucursal !== "all"
        ? req.query.sucursal
        : null;

    if (!esAdminGlobal) {
      const userSucursalId = await resolveUserSucursalId(req);
      if (userSucursalId) {
        sucursalFiltro = userSucursalId.toString();
      }
    }

    const empleados = await salesService.getEmpleados(sucursalFiltro);
    res.json(empleados);
  } catch (error) {
    console.error("❌ Error in getEmpleados controller:", error);
    res.status(500).json({
      error: error.message || "Error al obtener los empleados",
      details:
        process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// ============================================
// ANULAR VENTA
// ============================================
const anularVenta = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query;

    if (!id) return res.status(400).json({ error: "ID de venta requerido" });

    if (type !== "producto" && type !== "servicio") {
      return res.status(400).json({
        error: "Tipo de venta inválido. Debe ser 'producto' o 'servicio'",
      });
    }

    const userRol = normalizeRol(req.user?.rol);

    if (userRol !== "admin") {
      return res.status(403).json({
        error: `Solo un administrador puede anular ventas (rol detectado: "${
          userRol || "vacío"
        }")`,
      });
    }

    const usuarioId = await resolveUsuarioIdForzado(req);
    if (!usuarioId) {
      return res
        .status(401)
        .json({ error: "No se pudo resolver el usuario actual" });
    }

    const userSucursalId = await resolveUserSucursalId(req);

    const result = await salesService.anularVenta(id, type, {
      usuarioId,
      rol: userRol,
      sucursalId: userSucursalId,
    });

    res.json(result);
  } catch (error) {
    console.error("❌ Error in anularVenta controller:", error);

    const status =
      error.statusCode ||
      (error.message?.includes("Solo se pueden anular") ? 400 : 500);

    res.status(status).json({
      error: error.message || "Error al anular la venta",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// ============================================
// ANULAR PAGO PENDIENTE
// ============================================
const anularPagoPendiente = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) return res.status(400).json({ error: "ID de pago requerido" });

    const userRol = normalizeRol(req.user?.rol);
    if (userRol !== "admin") {
      return res.status(403).json({
        error: `Solo un administrador puede anular pagos (rol detectado: "${
          userRol || "vacío"
        }")`,
      });
    }

    const usuarioId = await resolveUsuarioIdForzado(req);
    if (!usuarioId) {
      return res
        .status(401)
        .json({ error: "No se pudo resolver el usuario actual" });
    }

    const result = await salesService.anularPagoPendiente(id, {
      usuarioId,
      rol: userRol,
    });

    res.json(result);
  } catch (error) {
    console.error("❌ Error in anularPagoPendiente controller:", error);

    const status =
      error.statusCode || (error.message?.includes("no existe") ? 404 : 500);

    res.status(status).json({
      error: error.message || "Error al anular el pago",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

module.exports = {
  getSales,
  getTotals,
  getResumen,
  getSaleDetails,
  getSucursales,
  getEmpleados,
  anularVenta,
  anularPagoPendiente,
};