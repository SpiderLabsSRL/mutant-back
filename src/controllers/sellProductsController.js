// src/controllers/sellProductsController.js
const sellProductsService = require("../services/sellProductsService");

// ============================================
// 🔒 LOCK EN MEMORIA contra doble venta
// ============================================
const salesInFlight = new Map(); // userId -> timestamp de inicio
const IN_FLIGHT_TTL_MS = 30_000;

const cleanupInFlight = () => {
  const now = Date.now();
  for (const [userId, startedAt] of salesInFlight.entries()) {
    if (now - startedAt > IN_FLIGHT_TTL_MS) {
      salesInFlight.delete(userId);
    }
  }
};

// ============================================
// GET PRODUCTS
// ============================================
const getProducts = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ error: "ID de usuario válido requerido" });
    }

    const products = await sellProductsService.getProducts(userId);
    res.json(products);
  } catch (error) {
    console.error("Error en getProducts:", error);

    if (error.message.includes("Usuario no encontrado")) {
      return res.status(404).json({
        error: "Usuario no encontrado. Por favor, inicie sesión nuevamente.",
      });
    }

    res.status(500).json({
      error: error.message || "Error interno del servidor al obtener productos",
    });
  }
};

// ============================================
// GET CASH REGISTER STATUS
// ============================================
const getCashRegisterStatus = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ error: "ID de usuario válido requerido" });
    }

    const status = await sellProductsService.getCashRegisterStatus(userId);
    res.json(status);
  } catch (error) {
    console.error("Error en getCashRegisterStatus:", error);

    if (error.message.includes("Usuario no encontrado")) {
      return res.status(404).json({
        error: "Usuario no encontrado. Por favor, inicie sesión nuevamente.",
      });
    }

    if (error.message.includes("No hay caja activa")) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({
      error:
        error.message ||
        "Error interno del servidor al obtener estado de caja",
    });
  }
};

// ============================================
// VALIDATE COUPON
// ============================================
const validateCoupon = async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    const { codigo } = req.query;

    if (!userId || isNaN(userId)) {
      return res.status(400).json({ error: "ID de usuario válido requerido" });
    }

    if (!codigo) {
      return res.status(400).json({ error: "Código de cupón requerido" });
    }

    const cupon = await sellProductsService.validateCoupon(userId, codigo);
    res.json(cupon);
  } catch (error) {
    console.error("Error en validateCoupon:", error);
    res.status(400).json({ error: error.message });
  }
};

// ============================================
// PROCESS SALE — SIN client_sale_id, con lock en memoria
// ============================================
const processSale = async (req, res) => {
  const startedAt = Date.now();

  try {
    const userId = parseInt(req.query.userId);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ error: "ID de usuario válido requerido" });
    }

    const saleData = req.body;

    if (
      !saleData.productos ||
      !Array.isArray(saleData.productos) ||
      saleData.productos.length === 0
    ) {
      return res
        .status(400)
        .json({ error: "La venta debe incluir al menos un producto" });
    }

    if (typeof saleData.total !== "number" || saleData.total < 0) {
      return res
        .status(400)
        .json({ error: "El total de la venta no puede ser negativo" });
    }

    // 🔒 Limpiar locks viejos
    cleanupInFlight();

    // 🔒 ¿Ya hay una venta de este usuario en proceso?
    if (salesInFlight.has(userId)) {
      console.warn("[processSale] Doble submit bloqueado", {
        userId,
        inFlightSince: salesInFlight.get(userId),
      });
      return res.status(409).json({
        error:
          "Ya hay una venta en proceso. Espera a que termine antes de reintentar.",
        code: "SALE_IN_PROGRESS",
      });
    }

    // 🔒 Adquirir lock
    salesInFlight.set(userId, Date.now());

    console.log("[processSale] INICIO", {
      startedAt,
      userId,
      total: saleData.total,
      items: saleData.productos.length,
      forma_pago: saleData.forma_pago,
    });

    const result = await sellProductsService.processSale(userId, saleData);

    console.log("[processSale] FIN", {
      duration_ms: Date.now() - startedAt,
      userId,
      idventa: result.idventa,
    });

    res.json(result);
  } catch (error) {
    console.error("[processSale] ERROR", {
      duration_ms: Date.now() - startedAt,
      message: error.message,
    });

    if (
      error.message.includes("stock insuficiente") ||
      error.message.includes("Stock insuficiente")
    ) {
      return res.status(400).json({ error: error.message });
    }

    if (
      error.message.includes("caja no está abierta") ||
      error.message.includes("No hay caja activa")
    ) {
      return res.status(400).json({ error: error.message });
    }

    if (
      error.message.includes("Usuario no encontrado") ||
      error.message.includes("Error de autenticación")
    ) {
      return res.status(401).json({
        error: "Error de autenticación. Por favor, inicie sesión nuevamente.",
      });
    }

    if (error.message.includes("Producto no encontrado")) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes("Cupón") || error.message.includes("cupón")) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({
      error:
        error.message || "Error interno del servidor al procesar la venta",
    });
  } finally {
    const userId = parseInt(req.query.userId);
    if (!isNaN(userId)) {
      salesInFlight.delete(userId);
    }
  }
};

module.exports = {
  getProducts,
  getCashRegisterStatus,
  validateCoupon,
  processSale,
};