const RegisterMemberService = require("../services/RegisterMemberService");

// ============================================
// SERVICIOS POR SUCURSAL
// ============================================
exports.getServicesByBranch = async (req, res) => {
  try {
    const { sucursalId } = req.params;
    const services = await RegisterMemberService.getServicesByBranch(sucursalId);
    res.json(services);
  } catch (error) {
    console.error("Error in getServicesByBranch:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// BUSCAR PERSONAS
// ============================================
exports.searchPeople = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 3) {
      return res.json([]);
    }
    const people = await RegisterMemberService.searchPeople(q);
    res.json(people);
  } catch (error) {
    console.error("Error in searchPeople:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// SUSCRIPCIONES ACTIVAS (incluye futuras)
// ============================================
exports.getActiveSubscriptions = async (req, res) => {
  try {
    const { personaId } = req.params;
    const { sucursalId } = req.query;

    if (!sucursalId) {
      return res.status(400).json({ message: "sucursalId es requerido" });
    }

    const subscriptions = await RegisterMemberService.getActiveSubscriptions(
      personaId,
      sucursalId
    );
    res.json(subscriptions);
  } catch (error) {
    console.error("Error in getActiveSubscriptions:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// ESTADO DE CAJA
// ============================================
exports.getCashRegisterStatus = async (req, res) => {
  try {
    const { cajaId } = req.params;
    const status = await RegisterMemberService.getCashRegisterStatus(cajaId);
    res.json(status);
  } catch (error) {
    console.error("Error in getCashRegisterStatus:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// VALIDAR CUPÓN
// ============================================
exports.validateCoupon = async (req, res) => {
  try {
    const { codigo, sucursalId } = req.query;

    if (!codigo || !sucursalId) {
      return res.status(400).json({
        message: "codigo y sucursalId son requeridos",
      });
    }

    const cupon = await RegisterMemberService.validateCoupon(
      codigo,
      parseInt(sucursalId)
    );
    res.json(cupon);
  } catch (error) {
    console.error("Error in validateCoupon:", error);
    res.status(400).json({ message: error.message });
  }
};

// ============================================
// LISTAR CUPONES DISPONIBLES
// ============================================
exports.getAvailableCoupons = async (req, res) => {
  try {
    const { sucursalId } = req.params;
    const cupones = await RegisterMemberService.getAvailableCoupons(
      parseInt(sucursalId)
    );
    res.json(cupones);
  } catch (error) {
    console.error("Error in getAvailableCoupons:", error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================
// REGISTRAR MIEMBRO 
// ============================================
exports.registerMember = async (req, res) => {
  try {
    const registrationData = req.body;
    const result = await RegisterMemberService.registerMember(registrationData);
    res.json(result);
  } catch (error) {
    console.error("Error in registerMember:", error);

    if (error.message === "La persona ya existe") {
      return res.status(409).json({
        message: error.message,
        existingPerson: error.existingPerson,
      });
    }

    if (
      error.message.includes("Cupón") ||
      error.message.includes("cupón")
    ) {
      return res.status(400).json({ message: error.message });
    }

    if (
      error.message.includes("inscripción pendiente en el futuro") ||
      error.message.includes("inscripción activa")
    ) {
      return res.status(409).json({ message: error.message });
    }

    res.status(500).json({ message: error.message });
  }
};

// ============================================
// PAGOS PENDIENTES
// ============================================
exports.getPagosPendientes = async (req, res) => {
  try {
    const { personaId } = req.params;
    const pagos = await RegisterMemberService.getPagosPendientes(personaId);
    res.json(pagos);
  } catch (error) {
    console.error("Error in getPagosPendientes:", error);
    res.status(500).json({ message: error.message });
  }
};

exports.updatePagoPendiente = async (req, res) => {
  try {
    const { pagoId } = req.params;
    const { montoPagado } = req.body;

    if (!montoPagado || montoPagado <= 0) {
      return res
        .status(400)
        .json({ message: "Monto pagado debe ser mayor a 0" });
    }

    const result = await RegisterMemberService.updatePagoPendiente(
      pagoId,
      montoPagado
    );
    res.json(result);
  } catch (error) {
    console.error("Error in updatePagoPendiente:", error);
    res.status(500).json({ message: error.message });
  }
};
// ============================================
// VERIFICAR SI UNA PERSONA TIENE HUELLA
// ============================================
exports.hasFingerprint = async (req, res) => {
  try {
    const { personaId } = req.params;
    const result = await RegisterMemberService.hasFingerprint(personaId);
    res.json(result);
  } catch (error) {
    console.error("Error in hasFingerprint:", error);
    res.status(500).json({ message: error.message });
  }
};
// ============================================
// CREAR PERSONA RÁPIDAMENTE
// ============================================
exports.createPersonQuick = async (req, res) => {
  try {
    const result = await RegisterMemberService.createPersonQuick(req.body);
    res.json(result);
  } catch (error) {
    console.error("Error in createPersonQuick:", error);
    res.status(400).json({ message: error.message });
  }
};
