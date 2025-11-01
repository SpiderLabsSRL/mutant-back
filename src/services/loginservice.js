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
      
      // Asegurarnos de que tenemos el nombre de la sucursal
      if (!user.sucursalNombre && user.idsucursal) {
        const sucursalResult = await query(
          "SELECT nombre FROM sucursales WHERE id = $1",
          [user.idsucursal]
        );
        if (sucursalResult.rows.length > 0) {
          user.sucursalNombre = sucursalResult.rows[0].nombre;
        }
      }

      // OBTENER HORARIOS DESDE LA NUEVA TABLA horarios_empleado
      if (user.rol !== 'admin') {
        const horariosResult = await query(
          `SELECT dia_semana, hora_ingreso, hora_salida 
           FROM horarios_empleado 
           WHERE empleado_id = $1 
           ORDER BY dia_semana`,
          [user.idempleado]
        );
        
        user.horarios = horariosResult.rows;
        console.log("Horarios encontrados para", user.username + ":", user.horarios);
      } else {
        // Para admin, no necesita horarios
        user.horarios = [];
      }
    }

    console.log("Usuario encontrado:", user.username, "Tipo:", userType, "Sucursal:", user.sucursalNombre);

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

    // VERIFICAR HORARIO PARA EMPLEADOS (EXCEPTO ADMIN) - LÓGICA CORREGIDA
    if (user.userType === 'empleado' && user.rol !== 'admin') {
      const horaActualBolivia = new Date().toLocaleString("en-US", { timeZone: "America/La_Paz" });
      const ahora = new Date(horaActualBolivia);
      const diaSemanaActual = ahora.getDay() === 0 ? 7 : ahora.getDay(); // Domingo=7, Lunes=1, etc.
      const horaActual = ahora.getHours() * 60 + ahora.getMinutes(); // minutos desde medianoche

      console.log("Día de la semana actual:", diaSemanaActual);
      console.log("Hora actual (minutos):", horaActual);
      console.log("Horarios del usuario:", user.horarios);

      // Buscar horario para el día actual
      const horarioHoy = user.horarios.find(h => h.dia_semana === diaSemanaActual);
      
      if (horarioHoy && horarioHoy.hora_ingreso && horarioHoy.hora_salida) {
        const [horaIngresoHoras, horaIngresoMinutos] = horarioHoy.hora_ingreso.split(':').map(Number);
        const [horaSalidaHoras, horaSalidaMinutos] = horarioHoy.hora_salida.split(':').map(Number);
        
        const horaIngresoMin = horaIngresoHoras * 60 + horaIngresoMinutos;
        const horaSalidaMin = horaSalidaHoras * 60 + horaSalidaMinutos;
        
        // Permitir acceso 30 minutos antes y después del horario
        const horaIngresoPermitido = horaIngresoMin - 30;
        const horaSalidaPermitido = horaSalidaMin + 30;

        console.log("Horario hoy - Ingreso:", horaIngresoMin, "Salida:", horaSalidaMin);
        console.log("Límites - Ingreso:", horaIngresoPermitido, "Salida:", horaSalidaPermitido);

        if (horaActual < horaIngresoPermitido || horaActual > horaSalidaPermitido) {
          console.log("Fuera de horario permitido");
          throw new Error("Fuera de horario laboral. Su horario para hoy es: " + 
                         horarioHoy.hora_ingreso + " - " + horarioHoy.hora_salida);
        }
        
        console.log("Dentro del horario permitido");
      } else {
        console.log("No tiene horario definido para hoy o horario incompleto");
        
        // NUEVA LÓGICA: Si no tiene horario específico para hoy, usar horario de Lunes a Viernes
        const horarioLV = user.horarios.find(h => h.dia_semana === 1); // Lunes a Viernes
        
        if (horarioLV && horarioLV.hora_ingreso && horarioLV.hora_salida) {
          console.log("Usando horario de Lunes a Viernes:", horarioLV);
          
          const [horaIngresoHoras, horaIngresoMinutos] = horarioLV.hora_ingreso.split(':').map(Number);
          const [horaSalidaHoras, horaSalidaMinutos] = horarioLV.hora_salida.split(':').map(Number);
          
          const horaIngresoMin = horaIngresoHoras * 60 + horaIngresoMinutos;
          const horaSalidaMin = horaSalidaHoras * 60 + horaSalidaMinutos;
          
          // Permitir acceso 30 minutos antes y después del horario
          const horaIngresoPermitido = horaIngresoMin - 30;
          const horaSalidaPermitido = horaSalidaMin + 30;

          console.log("Horario L-V - Ingreso:", horaIngresoMin, "Salida:", horaSalidaMin);
          console.log("Límites L-V - Ingreso:", horaIngresoPermitido, "Salida:", horaSalidaPermitido);

          if (horaActual < horaIngresoPermitido || horaActual > horaSalidaPermitido) {
            console.log("Fuera de horario L-V permitido");
            throw new Error("Fuera de horario laboral. Su horario es: " + 
                           horarioLV.hora_ingreso + " - " + horarioLV.hora_salida);
          }
          
          console.log("Dentro del horario L-V permitido");
        } else {
          // Si no tiene ningún horario definido
          console.log("No tiene horarios definidos");
          throw new Error("No tiene horarios laborales definidos en el sistema");
        }
      }
    } else if (user.userType === 'empleado' && user.rol === 'admin') {
      console.log("Usuario admin - sin verificación de horario");
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