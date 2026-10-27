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

      // Obtener horarios para enviar al frontend (solo para información, no para bloquear login)
      if (user.rol !== 'admin') {
        const horariosResult = await query(
          `SELECT dia_semana, hora_ingreso, hora_salida 
           FROM horarios_empleado 
           WHERE empleado_id = $1 
           ORDER BY dia_semana`,
          [user.idempleado]
        );
        
        user.horarios = horariosResult.rows;
      } else {
        // Para admin, no necesita horarios
        user.horarios = [];
      }
    }

    // Verificar si el usuario está inactivo (solo para empleados)
    if (user.userType === 'empleado' && user.estado_empleado !== 1) {
      throw new Error("Usuario inactivo");
    }

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      throw new Error("Contraseña incorrecta");
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

// ============================================
// AUTENTICACIÓN POR HUELLA (EMPLEADOS)
// ============================================
const authenticateByFingerprint = async (ci) => {
  try {
    console.log(`Autenticando por huella con CI: ${ci}`);

    const normalizedCi = String(ci || "").trim();

    if (!normalizedCi) {
      throw new Error("CI no proporcionado por el lector");
    }

    // 1. Buscar al empleado por CI (tolerante a formatos)
    const queryEmployee = `
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
      FROM personas p
      INNER JOIN empleados e ON p.id = e.persona_id
      INNER JOIN usuarios u ON e.id = u.empleado_id
      LEFT JOIN empleado_caja ec ON e.id = ec.empleado_id AND ec.estado = 1
      LEFT JOIN sucursales s ON e.sucursal_id = s.id 
      WHERE (TRIM(p.ci) = $1 OR REGEXP_REPLACE(TRIM(p.ci), '[\\s.\\-]', '', 'g') = $2)
      LIMIT 1
    `;

    const result = await query(queryEmployee, [normalizedCi, normalizedCi]);

    if (result.rows.length === 0) {
      throw new Error("Empleado no encontrado con ese CI");
    }

    const user = result.rows[0];
    user.userType = "empleado";

    // 2. Validar que esté activo (aquí está la regla estricta que pediste)
    if (user.estado_empleado !== 1) {
      throw new Error("Empleado inactivo. Contacte al administrador.");
    }

    // 3. Obtener nombre de sucursal si falta
    if (!user.sucursalNombre && user.idsucursal) {
      const sucursalResult = await query(
        "SELECT nombre FROM sucursales WHERE id = $1",
        [user.idsucursal]
      );
      if (sucursalResult.rows.length > 0) {
        user.sucursalNombre = sucursalResult.rows[0].nombre;
      }
    }

    // 4. Obtener horarios
    if (user.rol !== 'admin') {
      const horariosResult = await query(
        `SELECT dia_semana, hora_ingreso, hora_salida 
         FROM horarios_empleado 
         WHERE empleado_id = $1 
         ORDER BY dia_semana`,
        [user.idempleado]
      );
      user.horarios = horariosResult.rows;
    } else {
      user.horarios = [];
    }

    delete user.estado_empleado;

    return user;
  } catch (error) {
    console.error("Error en authenticateByFingerprint:", error);
    throw error;
  }
};

module.exports = {
  authenticateUser,
  authenticateByFingerprint,
};