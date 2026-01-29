// src/services/sidebarPasswordService.js
const db = require("../../db");
const bcrypt = require("bcrypt");

const changePassword = async (userId, currentPassword, newPassword) => {
  const client = await db.pool.connect();

  try {
    await client.query("BEGIN");

    console.log(`Changing password for user ID: ${userId}`); // Debug

    // 1. Obtener la contraseña actual del usuario
    const userQuery = `
      SELECT u.id, u.password_hash, e.rol, p.nombres, p.apellidos 
      FROM usuarios u
      INNER JOIN empleados e ON u.empleado_id = e.id
      INNER JOIN personas p ON e.persona_id = p.id
      WHERE u.id = $1
    `;

    const userResult = await client.query(userQuery, [userId]);

    console.log("User found:", userResult.rows.length); // Debug

    if (userResult.rows.length === 0) {
      return {
        success: false,
        message: "Usuario no encontrado",
      };
    }

    const user = userResult.rows[0];
    console.log("User data:", user); // Debug

    // 2. Verificar la contraseña actual
    const passwordMatch = await bcrypt.compare(
      currentPassword,
      user.password_hash,
    );

    console.log("Password match:", passwordMatch); // Debug

    if (!passwordMatch) {
      return {
        success: false,
        message: "La contraseña actual es incorrecta",
      };
    }

    // 3. Verificar que la nueva contraseña sea diferente
    const samePassword = await bcrypt.compare(newPassword, user.password_hash);

    if (samePassword) {
      return {
        success: false,
        message: "La nueva contraseña debe ser diferente a la actual",
      };
    }

    // 4. Hashear la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 5. Actualizar la contraseña
    await client.query("UPDATE usuarios SET password_hash = $1 WHERE id = $2", [
      hashedPassword,
      userId,
    ]);

    console.log("Password updated successfully"); // Debug

    // 6. Registrar el cambio en un log
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS cambios_password (
          id SERIAL PRIMARY KEY,
          usuario_id INTEGER NOT NULL,
          fecha_cambio TIMESTAMP NOT NULL DEFAULT NOW(),
          descripcion TEXT
        )
      `);

      await client.query(
        `INSERT INTO cambios_password (usuario_id, fecha_cambio, descripcion) 
         VALUES ($1, NOW(), $2)`,
        [
          userId,
          `Usuario ${user.nombres} ${user.apellidos} (${user.rol}) cambió su contraseña`,
        ],
      );
    } catch (logError) {
      console.log("Log table error (non-critical):", logError.message);
    }

    await client.query("COMMIT");

    return {
      success: true,
      message: "Contraseña actualizada exitosamente",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error in changePassword service:", error);

    return {
      success: false,
      message: error.message || "Error interno del servidor",
    };
  } finally {
    client.release();
  }
};

module.exports = {
  changePassword,
};
