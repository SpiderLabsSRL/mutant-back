// services/loginservice.js
const { query } = require("../../db");
const bcrypt = require("bcrypt");

const authenticateUser = async (username, password) => {
  try {
    console.log(`Autenticando usuario: ${username}`);

    // Primero buscar en usuarios (empleados)
    let result = await query(
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
        ec.caja_id as idcaja,
        s.nombre as sucursalNombre  -- Nuevo campo
      FROM usuarios u
      INNER JOIN empleados e ON u.empleado_id = e.id
      INNER JOIN personas p ON e.persona_id = p.id
      LEFT JOIN empleado_caja ec ON e.id = ec.empleado_id AND ec.estado = 1
      LEFT JOIN sucursales s ON e.sucursal_id = s.id  -- Join para obtener nombre de sucursal
      WHERE u.username = $1 AND e.estado = 1`,
      [username]
    );

    let user = null;
    let userType = 'empleado';

    if (result.rows.length === 0) {
      // Si no es empleado, buscar en usuarios_clientes
      userType = 'cliente';
      result = await query(
        `SELECT 
          id as idusuario,
          username,
          password_hash as password,
          'cliente' as rol
        FROM usuarios_clientes 
        WHERE username = $1`,
        [username]
      );

      if (result.rows.length === 0) {
        console.log("Usuario no encontrado");
        return null;
      }

      user = result.rows[0];
      user.userType = 'cliente';
    } else {
      user = result.rows[0];
      user.userType = 'empleado';
    }

    console.log("Usuario encontrado:", user.username, "Tipo:", userType);

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