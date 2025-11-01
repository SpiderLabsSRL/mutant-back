const authService = require("../services/loginservice");
const { generateToken } = require("../utils/jwtUtils");

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Usuario y contraseña son requeridos",
      });
    }

    const user = await authService.authenticateUser(username, password);

    // Preparar datos según el tipo de usuario
    let userResponse = {};
    
    if (user.userType === 'empleado') {
      // Obtener horario principal para compatibilidad
      let horarioPrincipal = null;
      if (user.horarios && user.horarios.length > 0) {
        // Buscar horario de lunes a viernes (dia_semana = 1) como principal
        const horarioLV = user.horarios.find(h => h.dia_semana === 1);
        if (horarioLV) {
          horarioPrincipal = horarioLV;
        } else {
          // Si no tiene horario de lunes a viernes, usar el primero disponible
          horarioPrincipal = user.horarios[0];
        }
      }

      userResponse = {
        idpersona: user.idpersona,
        idempleado: user.idempleado,
        idusuario: user.idusuario,
        idcaja: user.idcaja,
        idsucursal: user.idsucursal,
        rol: user.rol,
        hora_ingreso: horarioPrincipal ? horarioPrincipal.hora_ingreso : null,
        hora_salida: horarioPrincipal ? horarioPrincipal.hora_salida : null,
        nombres: user.nombres,
        apellidos: user.apellidos,
        username: user.username,
        userType: user.userType,
        sucursalNombre: user.sucursalNombre,
        horarios: user.horarios // Enviar todos los horarios
      };
    } else {
      userResponse = {
        idusuario: user.idusuario,
        idpersona: user.idpersona,
        nombres: user.nombres,
        apellidos: user.apellidos,
        username: user.username,
        rol: user.rol,
        userType: user.userType
      };
    }

    // Generar token
    const token = generateToken({
      id: user.idusuario,
      username: user.username,
      role: user.rol,
      userType: user.userType
    });

    res.json({
      success: true,
      message: "Autenticación exitosa",
      token,
      user: userResponse,
      expiresIn: "8h",
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(401).json({
      success: false,
      message: error.message,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const verifyToken = (req, res) => {
  res.json({
    success: true,
    user: req.user,
  });
};

module.exports = {
  login,
  verifyToken,
};