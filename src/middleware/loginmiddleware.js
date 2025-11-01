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

    // 2. Verificar formato del header
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

    // 5. Verificar si es usuario empleado o cliente
    let user = null;
    let userType = 'empleado';
    
    // Primero buscar en usuarios (empleados)
    const userQuery = `
      SELECT 
        u.id as idusuario,
        u.username,
        e.id as idempleado,
        e.rol,
        e.estado as estado_empleado,
        e.sucursal_id as idsucursal,
        p.id as idpersona,
        p.nombres,
        p.apellidos,
        ec.caja_id as idcaja,
        s.nombre as sucursalNombre
      FROM usuarios u
      INNER JOIN empleados e ON u.empleado_id = e.id
      INNER JOIN personas p ON e.persona_id = p.id
      LEFT JOIN empleado_caja ec ON e.id = ec.empleado_id AND ec.estado = 1
      LEFT JOIN sucursales s ON e.sucursal_id = s.id
      WHERE u.id = $1 AND e.estado = 1
    `;
    
    const userResult = await db.query(userQuery, [decoded.id]);
    
    if (userResult.rows.length === 0) {
      // Si no es empleado, buscar en usuarios_clientes
      userType = 'cliente';
      const clientQuery = `
        SELECT 
          uc.id as idusuario,
          uc.username,
          'cliente' as rol
        FROM usuarios_clientes uc
        WHERE uc.id = $1
      `;
      
      const clientResult = await db.query(clientQuery, [decoded.id]);
      
      if (clientResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }
      
      user = clientResult.rows[0];
      user.userType = 'cliente';
      
      // Para clientes, buscar datos de persona basado en el username
      const personaQuery = `
        SELECT 
          p.id as idpersona,
          p.nombres,
          p.apellidos
        FROM personas p
        WHERE CONCAT(LOWER(p.nombres), '.', LOWER(p.apellidos)) = LOWER($1)
        OR CONCAT(LOWER(SPLIT_PART(p.nombres, ' ', 1)), '.', LOWER(p.apellidos)) = LOWER($1)
      `;
      
      const personaResult = await db.query(personaQuery, [user.username]);
      
      if (personaResult.rows.length > 0) {
        user.idpersona = personaResult.rows[0].idpersona;
        user.nombres = personaResult.rows[0].nombres;
        user.apellidos = personaResult.rows[0].apellidos;
      }
    } else {
      user = userResult.rows[0];
      user.userType = 'empleado';
      
      // OBTENER HORARIOS DESDE LA NUEVA TABLA horarios_empleado PARA EMPLEADOS
      if (user.rol !== 'admin') {
        const horariosQuery = `
          SELECT dia_semana, hora_ingreso, hora_salida 
          FROM horarios_empleado 
          WHERE empleado_id = $1 
          ORDER BY dia_semana
        `;
        
        const horariosResult = await db.query(horariosQuery, [user.idempleado]);
        user.horarios = horariosResult.rows;
        
        // Asignar horario principal (Lunes a Viernes) para compatibilidad
        if (user.horarios && user.horarios.length > 0) {
          const horarioPrincipal = user.horarios.find(h => h.dia_semana === 1) || user.horarios[0];
          user.hora_ingreso = horarioPrincipal.hora_ingreso;
          user.hora_salida = horarioPrincipal.hora_salida;
        }
      } else {
        // Admin no necesita horarios
        user.horarios = [];
      }
    }

    // 6. Adjuntar información del usuario al request
    req.user = user;

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