// middleware/loginmiddleware.js
const jwt = require("jsonwebtoken");
const db = require("../../db");

const authenticate = async (req, res, next) => {
  try {
    // 1. Obtener el token del header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authorization header is missing",
      });
    }

    // 2. Verificar que el header tenga el formato correcto
    const tokenParts = authHeader.split(" ");
    if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
      return res.status(401).json({
        success: false,
        message: "Authorization header format should be: Bearer <token>",
      });
    }

    const token = tokenParts[1];

    // 3. Verificar que el token no esté vacío
    if (!token || token === "null" || token === "undefined") {
      return res.status(401).json({
        success: false,
        message: "Authentication token is missing",
      });
    }

    // 4. Verificar y decodificar el token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
    }

    // 5. Verificar que el usuario existe y está activo
    const query = `
      SELECT 
        u.id as idusuario,
        u.username,
        e.id as idempleado,
        e.rol,
        e.estado as estado_empleado,
        e.sucursal_id as idsucursal,
        e.hora_ingreso,
        e.hora_salida,
        p.id as idpersona,
        p.nombres,
        p.apellidos,
        ec.caja_id as idcaja
      FROM usuarios u
      INNER JOIN empleados e ON u.empleado_id = e.id
      INNER JOIN personas p ON e.persona_id = p.id
      LEFT JOIN empleado_caja ec ON e.id = ec.empleado_id AND ec.estado = 1
      WHERE u.id = $1 AND e.estado = 1
    `;
    
    const result = await db.query(query, [decoded.id]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User not found or inactive",
      });
    }

    // 6. Adjuntar información del usuario al request
    req.user = result.rows[0];

    next();
  } catch (error) {
    console.error("Authentication error:", error);

    let errorMessage = "Authentication failed";
    if (error.name === "TokenExpiredError") {
      errorMessage = "Token expired";
    } else if (error.name === "JsonWebTokenError") {
      errorMessage = "Invalid token format";
    }

    return res.status(401).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const authorize = (requiredRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!requiredRoles.includes(req.user.rol)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    next();
  };
};

module.exports = {
  authenticate,
  authorize,
};