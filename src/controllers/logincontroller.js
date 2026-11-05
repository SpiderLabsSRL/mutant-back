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

    let userResponse = {};
    
    if (user.userType === 'empleado') {
      let horarioPrincipal = null;
      if (user.horarios && user.horarios.length > 0) {
        const horarioLV = user.horarios.find(h => h.dia_semana === 1);
        if (horarioLV) {
          horarioPrincipal = horarioLV;
        } else {
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
        horarios: user.horarios
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

// ============================================
// LOGIN CON HUELLA DACTILAR
// ============================================
const loginWithFingerprint = async (req, res) => {
  try {
    const { ci } = req.body;

    if (!ci) {
      return res.status(400).json({
        success: false,
        message: "Se requiere el CI para autenticación por huella",
      });
    }

    const user = await authService.authenticateByFingerprint(ci);

    let horarioPrincipal = null;
    if (user.horarios && user.horarios.length > 0) {
      const horarioLV = user.horarios.find(h => h.dia_semana === 1);
      horarioPrincipal = horarioLV || user.horarios[0];
    }

    const userResponse = {
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
      horarios: user.horarios
    };

    const token = generateToken({
      id: user.idusuario,
      username: user.username,
      role: user.rol,
      userType: user.userType
    });

    res.json({
      success: true,
      message: "Autenticación por huella exitosa",
      token,
      user: userResponse,
      expiresIn: "8h",
    });
  } catch (error) {
    console.error("Error en loginWithFingerprint:", error);
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
  loginWithFingerprint,
  verifyToken,
};