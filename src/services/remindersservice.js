const { query } = require("../../db");

const getNewMembers = async () => {
  try {
    // Obtener miembros que se registraron hoy
    const today = new Date().toISOString().split('T')[0];
    
    const result = await query(`
      SELECT 
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
      WHERE DATE(i.fecha_inicio) = $1
      AND i.estado = 1
      ORDER BY i.fecha_inicio DESC
    `, [today]);

    return result.rows.map(row => ({
      id: row.id.toString(),
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

const getExpiringMembers = async () => {
  try {
    // Obtener miembros cuyas membresías vencen en los próximos 7 días
    const result = await query(`
      SELECT 
        p.id,
        CONCAT(p.nombres, ' ', p.apellidos) as nombre,
        p.telefono,
        s.nombre as servicio,
        i.fecha_vencimiento as "fechaVencimiento",
        (i.fecha_vencimiento - CURRENT_DATE) as dias_restantes,
        CONCAT(
          '¡Hola ', p.nombres, '! 👋 ',
          'Tu membresía ', s.nombre, ' en MUTANT GYM vence el ', 
          TO_CHAR(i.fecha_vencimiento, 'DD/MM/YYYY'), 
          '. ¡Renuévala para seguir entrenando sin interrupciones! 💪'
        ) as mensaje
      FROM personas p
      INNER JOIN inscripciones i ON p.id = i.persona_id
      INNER JOIN servicios s ON i.servicio_id = s.id
      WHERE i.fecha_vencimiento BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '3 days')
      AND i.estado = 1
      ORDER BY i.fecha_vencimiento ASC
    `);

    return result.rows.map(row => ({
      id: row.id.toString(),
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

const getBirthdayMembers = async () => {
  try {
    // Obtener miembros que cumplen años hoy
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1;
    
    const result = await query(`
      SELECT 
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
      ORDER BY p.nombres ASC
    `, [month, day]);

    return result.rows.map(row => ({
      id: row.id.toString(),
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