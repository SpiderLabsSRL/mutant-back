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
        s.nombre as sucursalNombre
      FROM usuarios u
      INNER JOIN empleados e ON u.empleado_id = e.id
      INNER JOIN personas p ON e.persona_id = p.id
      LEFT JOIN empleado_caja ec ON e.id = ec.empleado_id AND ec.estado = 1
      LEFT JOIN sucursales s ON e.sucursal_id = s.id
      WHERE u.username = $1`,
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
          'cliente' as rol,
          1 as estado_empleado
        FROM usuarios_clientes 
        WHERE username = $1`,
        [username]
      );

      if (result.rows.length === 0) {
        console.log("Usuario no encontrado");
        throw new Error("Usuario no encontrado");
      }

      user = result.rows[0];
      user.userType = 'cliente';
    } else {
      user = result.rows[0];
      user.userType = 'empleado';
    }

    console.log("Usuario encontrado:", user.username, "Tipo:", userType);

    // Verificar si el usuario está inactivo (solo para empleados)
    if (user.userType === 'empleado' && user.estado_empleado !== 1) {
      console.log("Usuario inactivo");
      throw new Error("Usuario inactivo");
    }

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.password);

    console.log("Resultado de comparación de contraseña:", isMatch);

    if (!isMatch) {
      console.log("Contraseña no coincide");
      throw new Error("Contraseña incorrecta");
    }

    // Verificar horario para empleados (excepto admin)
    if (user.userType === 'empleado' && user.rol !== 'admin') {
      const horaActualBolivia = new Date().toLocaleString("en-US", { timeZone: "America/La_Paz" });
      const ahora = new Date(horaActualBolivia);
      const horaActual = ahora.getHours() * 60 + ahora.getMinutes(); // minutos desde medianoche

      if (user.hora_ingreso && user.hora_salida) {
        const [horaIngresoHoras, horaIngresoMinutos] = user.hora_ingreso.split(':').map(Number);
        const [horaSalidaHoras, horaSalidaMinutos] = user.hora_salida.split(':').map(Number);
        
        const horaIngresoMin = horaIngresoHoras * 60 + horaIngresoMinutos;
        const horaSalidaMin = horaSalidaHoras * 60 + horaSalidaMinutos;
        
        // Permitir acceso 30 minutos antes y después del horario
        const horaIngresoPermitido = horaIngresoMin - 30;
        const horaSalidaPermitido = horaSalidaMin + 30;

        if (horaActual < horaIngresoPermitido || horaActual > horaSalidaPermitido) {
          console.log("Fuera de horario permitido");
          throw new Error("Fuera de horario laboral");
        }
      }
    }

    // Eliminar la contraseña del objeto de retorno
    delete user.password;
    delete user.estado_empleado;

    return user;
  } catch (error) {
    console.error("Error en authService:", error);
    throw error;
  }
};

module.exports = {
  authenticateUser,
};