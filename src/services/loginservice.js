// services/loginservice.js
const { query } = require("../../db");
const bcrypt = require("bcrypt");

const authenticateUser = async (username, password) => {
  try {
    console.log(`Autenticando usuario: ${username}`);

    // Consulta para obtener usuario con toda la información necesaria
    const result = await query(
      `SELECT 
        u.id as idusuario,
        u.username,
        u.password_hash as password,
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
      WHERE u.username = $1 AND e.estado = 1`,
      [username]
    );

    if (result.rows.length === 0) {
      console.log("Usuario no encontrado");
      return null;
    }

    const user = result.rows[0];
    console.log("Usuario encontrado:", user.username);

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.password);

    console.log("Resultado de comparación de contraseña:", isMatch);

    if (!isMatch) {
      console.log("Contraseña no coincide");
      return null;
    }

    // Eliminar la contraseña del objeto de retorno
    delete user.password;

    return user;
  } catch (error) {
    console.error("Error en authService:", error);
    throw error;
  }
};

module.exports = {
  authenticateUser,
};