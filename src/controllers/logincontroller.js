// controllers/logincontroller.js
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

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas",
      });
    }

    // Generar token con los datos del usuario
    const token = generateToken({
      id: user.idusuario,
      username: user.username,
      role: user.rol,
      sucursalId: user.idsucursal
    });

    // Preparar datos de usuario para la respuesta
    const userResponse = {
      idpersona: user.idpersona,
      idempleado: user.idempleado,
      idusuario: user.idusuario,
      idcaja: user.idcaja,
      idsucursal: user.idsucursal,
      rol: user.rol,
      hora_ingreso: user.hora_ingreso,
      hora_salida: user.hora_salida,
      nombres: user.nombres,
      apellidos: user.apellidos,
      username: user.username
    };

    res.json({
      success: true,
      message: "Autenticación exitosa",
      token,
      user: userResponse,
      expiresIn: "8h",
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
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