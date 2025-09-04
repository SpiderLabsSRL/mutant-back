const { query } = require("./db");
const bcrypt = require("bcrypt");

async function hashAllPasswords() {
  try {
    // Obtener todos los usuarios con contraseñas no hasheadas
    const result = await query(`
      SELECT idusuario, password 
      FROM usuarios 
      WHERE password NOT LIKE '$2b$%' AND estado = 0
    `);

    console.log(`Encontrados ${result.rows.length} usuarios para actualizar`);

    for (const user of result.rows) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      await query("UPDATE usuarios SET password = $1 WHERE idusuario = $2", [
        hashedPassword,
        user.idusuario,
      ]);
      console.log(`Actualizado usuario ID: ${user.idusuario}`);
    }

    console.log("Proceso de hashing completado");
  } catch (error) {
    console.error("Error al hashear contraseñas:", error);
  } finally {
    process.exit();
  }
}

hashAllPasswords();
