// backend/controllers/salescontrolController.js
const salesService = require("../services/salescontrolService");
const { query } = require("../../db");

// ============================================
// HELPER: Obtener sucursal_id del usuario logueado
// ============================================
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

// ============================================
// ✅ HELPER: Obtener empleado_id real del usuario logueado
//    (por si en algún momento se necesita)
// ============================================
async function resolveUserEmpleadoId(req) {
  const usuarioId = req.user?.idusuario || req.user?.id;

  if (!usuarioId) {
    return null;
  }

  try {
    const r = await query(
      `SELECT empleado_id FROM usuarios WHERE id = $1 LIMIT 1`,
      [usuarioId]
    );

    if (r.rows.length > 0 && r.rows[0].empleado_id) {
      return Number(r.rows[0].empleado_id);
    }

    const personaId = req.user?.idpersona || req.user?.persona_id;
    if (personaId) {
      const r2 = await query(
        `SELECT id FROM empleados 
         WHERE persona_id = $1 AND estado = 1 
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

// ============================================
// ✅ HELPER: Obtener el idusuario "efectivo" para forzar ventas
//    El servicio de ventas filtra por `usuario_id` (columna `id` de la
//    tabla `usuarios`), NO por `empleado_id`. Por eso aquí devolvemos
//    el idusuario del JWT (o el que se resuelva desde el empleado).
// ============================================
async function resolveUsuarioIdForzado(req) {
  // 1) Preferimos el idusuario directo del JWT
  const usuarioId = req.user?.idusuario || req.user?.id;
  if (usuarioId) return Number(usuarioId);

  // 2) Fallback: resolver por empleado/persona
  const empleadoId = await resolveUserEmpleadoId(req);
  if (empleadoId) {
    try {
      const r = await query(
        `SELECT id FROM usuarios WHERE empleado_id = $1 LIMIT 1`,
        [empleadoId]
      );
      if (r.rows.length > 0) return Number(r.rows[0].id);
    } catch (err) {
      console.error("Error resolviendo usuario por empleado:", err);
    }
  }

  return null;
}

// ============================================
// HELPER: Normaliza el rol a minúsculas
// ============================================
function normalizeRol(rol) {
  return (rol || "").toString().toLowerCase().trim();
}

// ============================================
// GET SALES
// ============================================
const getSales = async (req, res) => {
  try {
    const {
      dateFilterType = "today",
      specificDate,
      startDate,
      endDate,
      sucursal,
      empleadoId,
      page = 1,
      pageSize = 20,
    } = req.query;

    if (dateFilterType === "range") {
      if (!startDate || !endDate) {
        return res.status(400).json({
          error:
            "Para rango de fechas, debe especificar fecha inicio y fecha fin",
        });
      }
      if (new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({
          error: "La fecha inicio no puede ser mayor a la fecha fin",
        });
      }
    }

    if (dateFilterType === "specific" && !specificDate) {
      return res.status(400).json({
        error: "Para fecha específica, debe seleccionar una fecha",
      });
    }

    const userSucursalId = await resolveUserSucursalId(req);
    const userRol = normalizeRol(req.user?.rol);

    // ==========================================================
    // ✅ FIX: El servicio filtra por `usuario_id`. Forzamos
    //    el filtro al `idusuario` del recepcionista logueado.
    // ==========================================================
    let empleadoIdEfectivo = empleadoId || null;

    if (userRol === "recepcionista") {
      const usuarioIdForzado = await resolveUsuarioIdForzado(req);

      if (!usuarioIdForzado) {
        console.warn(
          "⚠️ Recepcionista sin usuario_id resoluble. Devolviendo vacío."
        );
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

      empleadoIdEfectivo = usuarioIdForzado.toString();
      console.log(
        `🔒 Recepcionista forzado a usuarioId=${empleadoIdEfectivo} (rol=${userRol})`
      );
    }

    const filters = {
      dateFilterType: dateFilterType || "today",
      specificDate: specificDate || null,
      startDate: startDate || null,
      endDate: endDate || null,
      sucursal: sucursal === "all" || !sucursal ? null : sucursal,
      empleadoId: empleadoIdEfectivo,
    };

    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSizeNum = Math.max(1, Math.min(parseInt(pageSize) || 20, 5000));

    const result = await salesService.getSales(
      filters,
      pageNum,
      pageSizeNum,
      userSucursalId,
      userRol
    );

    res.json({
      sales: result.sales,
      pagination: result.pagination,
    });
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
    const {
      dateFilterType = "today",
      specificDate,
      startDate,
      endDate,
      sucursal,
      empleadoId,
    } = req.query;

    if (dateFilterType === "range") {
      if (!startDate || !endDate) {
        return res.status(400).json({
          error:
            "Para rango de fechas, debe especificar fecha inicio y fecha fin",
        });
      }
      if (new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({
          error: "La fecha inicio no puede ser mayor a la fecha fin",
        });
      }
    }

    if (dateFilterType === "specific" && !specificDate) {
      return res.status(400).json({
        error: "Para fecha específica, debe seleccionar una fecha",
      });
    }

    const userSucursalId = await resolveUserSucursalId(req);
    const userRol = normalizeRol(req.user?.rol);

    // ==========================================================
    // ✅ FIX: mismo criterio que en getSales
    // ==========================================================
    let empleadoIdEfectivo = empleadoId || null;

    if (userRol === "recepcionista") {
      const usuarioIdForzado = await resolveUsuarioIdForzado(req);

      if (!usuarioIdForzado) {
        console.warn(
          "⚠️ Recepcionista sin usuario_id resoluble. Totales en cero."
        );
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

      empleadoIdEfectivo = usuarioIdForzado.toString();
      console.log(
        `🔒 Recepcionista (totales) forzado a usuarioId=${empleadoIdEfectivo}`
      );
    }

    const filters = {
      dateFilterType: dateFilterType || "today",
      specificDate: specificDate || null,
      startDate: startDate || null,
      endDate: endDate || null,
      sucursal: sucursal === "all" || !sucursal ? null : sucursal,
      empleadoId: empleadoIdEfectivo,
    };

    const totals = await salesService.getTotals(
      filters,
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

module.exports = {
  getSales,
  getTotals,
  getSaleDetails,
  getSucursales,
};