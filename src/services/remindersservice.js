const { query } = require("../../db");

const getNewMembers = async (sucursalId) => {
  try {
    // Obtener miembros que se registraron hoy en la sucursal específica
    // Usando la zona horaria de Bolivia (America/La_Paz)
    console.log("Buscando nuevos miembros para hoy en sucursal:", sucursalId);
    
    const result = await query(`
      SELECT DISTINCT ON (p.id, s.id)
        p.id,
        CONCAT(p.nombres, ' ', p.apellidos) as nombre,
        p.telefono,
        s.nombre as servicio,
        i.fecha_inicio as "fechaRegistro",
        CONCAT(
          '¡Bienvenido/a a MUTANT GYM ', p.nombres, '! 🏋️‍♂️ ',
          'Estamos emocionados de tenerte en nuestra familia fitness. ',
          'Tu membresía ', s.nombre, ' está activa. ¡Comencemos a entrenar! 🔥'
        ) as mensaje
      FROM personas p
      INNER JOIN inscripciones i ON p.id = i.persona_id
      INNER JOIN servicios s ON i.servicio_id = s.id
      WHERE i.fecha_inicio::date = (NOW() AT TIME ZONE 'America/La_Paz')::date
      AND i.estado = 1
      AND i.sucursal_id = $1
      ORDER BY p.id, s.id, i.fecha_inicio DESC
    `, [sucursalId]);

    console.log("Nuevos miembros encontrados:", result.rows.length);
    
    if (result.rows.length === 0) {
      // Si no encontramos resultados, hacemos una consulta de prueba
      // para verificar qué datos existen en la tabla
      const testResult = await query(`
        SELECT 
          p.id,
          CONCAT(p.nombres, ' ', p.apellidos) as nombre,
          i.fecha_inicio,
          i.sucursal_id,
          i.estado
        FROM personas p
        INNER JOIN inscripciones i ON p.id = i.persona_id
        WHERE i.fecha_inicio >= (CURRENT_DATE AT TIME ZONE 'America/La_Paz') - INTERVAL '7 days'
        ORDER BY i.fecha_inicio DESC
        LIMIT 10
      `);
      
      console.log("Datos de prueba (últimos 7 días):", testResult.rows);
    }
    
    return result.rows.map((row, index) => ({
      id: `${row.id}_${index}`, // ID único para React
      personaId: row.id, // ID original de la persona
      nombre: row.nombre,
      telefono: row.telefono,
      servicio: row.servicio,
      fechaRegistro: new Date(row.fechaRegistro).toLocaleDateString('es-ES'),
      mensaje: row.mensaje
    }));
  } catch (error) {
    console.error("Error en getNewMembers service:", error);
    throw error;
  }
};

const getExpiringMembers = async (sucursalId) => {
  try {
    // Obtener miembros cuyas membresías vencen en los próximos 3 días en la sucursal específica
    console.log("Buscando miembros próximos a vencer en sucursal:", sucursalId);
    
    const result = await query(`
      SELECT DISTINCT ON (p.id, s.id)
        p.id,
        CONCAT(p.nombres, ' ', p.apellidos) as nombre,
        p.telefono,
        s.nombre as servicio,
        i.fecha_vencimiento as "fechaVencimiento",
        (i.fecha_vencimiento::date - (NOW() AT TIME ZONE 'America/La_Paz')::date) as dias_restantes,
        CONCAT(
          '¡Hola ', p.nombres, '! 👋 ',
          'Tu membresía ', s.nombre, ' en MUTANT GYM vence el ', 
          TO_CHAR(i.fecha_vencimiento, 'DD/MM/YYYY'), 
          '. ¡Renuévala para seguir entrenando sin interrupciones! 💪'
        ) as mensaje
      FROM personas p
      INNER JOIN inscripciones i ON p.id = i.persona_id
      INNER JOIN servicios s ON i.servicio_id = s.id
      WHERE i.fecha_vencimiento::date BETWEEN (NOW() AT TIME ZONE 'America/La_Paz')::date
        AND ((NOW() AT TIME ZONE 'America/La_Paz')::date + INTERVAL '3 days')
      AND i.estado = 1
      AND i.sucursal_id = $1
      ORDER BY p.id, s.id, i.fecha_vencimiento ASC
    `, [sucursalId]);

    console.log("Miembros próximos a vencer encontrados:", result.rows.length);
    
    return result.rows.map((row, index) => ({
      id: `${row.id}_${index}_expiring`, // ID único para React
      personaId: row.id, // ID original de la persona
      nombre: row.nombre,
      telefono: row.telefono,
      servicio: row.servicio,
      fechaVencimiento: new Date(row.fechaVencimiento).toLocaleDateString('es-ES'),
      diasRestantes: parseInt(row.dias_restantes),
      mensaje: row.mensaje
    }));
  } catch (error) {
    console.error("Error en getExpiringMembers service:", error);
    throw error;
  }
};

const getBirthdayMembers = async (sucursalId) => {
  try {
    // Obtener miembros que cumplen años hoy en la sucursal específica
    // Usando la fecha actual en la zona horaria de Bolivia
    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "America/La_Paz"}));
    const day = now.getDate();
    const month = now.getMonth() + 1;
    
    console.log("Buscando cumpleañeros para el día:", day, "mes:", month, "en sucursal:", sucursalId);
    
    const result = await query(`
      SELECT DISTINCT ON (p.id)
        p.id,
        CONCAT(p.nombres, ' ', p.apellidos) as nombre,
        p.telefono,
        s.nombre as servicio,
        p.fecha_nacimiento as "fechaNacimiento",
        EXTRACT(YEAR FROM AGE(p.fecha_nacimiento)) as edad,
        CONCAT(
          '¡Feliz Cumpleaños ', p.nombres, '! 🎉🎂 ',
          'Todo el equipo de MUTANT GYM te deseamos un día lleno de alegría. ',
          '¡Que tengas un año espectacular lleno de logros y entrenamientos increíbles! 💪🎈'
        ) as mensaje
      FROM personas p
      INNER JOIN inscripciones i ON p.id = i.persona_id
      INNER JOIN servicios s ON i.servicio_id = s.id
      WHERE EXTRACT(MONTH FROM p.fecha_nacimiento) = $1
      AND EXTRACT(DAY FROM p.fecha_nacimiento) = $2
      AND i.estado = 1
      AND i.sucursal_id = $3
      ORDER BY p.id, p.nombres ASC
    `, [month, day, sucursalId]);

    console.log("Cumpleañeros encontrados:", result.rows.length);
    
    return result.rows.map((row, index) => ({
      id: `${row.id}_${index}_birthday`, // ID único para React
      personaId: row.id, // ID original de la persona
      nombre: row.nombre,
      telefono: row.telefono,
      servicio: row.servicio,
      fechaNacimiento: new Date(row.fechaNacimiento).toLocaleDateString('es-ES'),
      edad: parseInt(row.edad),
      mensaje: row.mensaje
    }));
  } catch (error) {
    console.error("Error en getBirthdayMembers service:", error);
    throw error;
  }
};

module.exports = {
  getNewMembers,
  getExpiringMembers,
  getBirthdayMembers
};