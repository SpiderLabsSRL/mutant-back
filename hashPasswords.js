const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Configuración de la conexión a la base de datos
const pool = new Pool({
  user: 'postgres',        // Reemplaza con tu usuario de PostgreSQL
  host: 'localhost',         // Reemplaza con tu host
  database: 'Mutant', // Reemplaza con el nombre de tu BD
  password: 'Univalle', // Reemplaza con tu contraseña
  port: 5432,                // Reemplaza con tu puerto si es diferente
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

async function hashAllPasswords() {
  try {
    console.log("Iniciando proceso de hashing de contraseñas...");

    // Obtener todos los usuarios de la tabla usuarios
    const usuariosResult = await query(`
      SELECT id, username, password_hash 
      FROM usuarios 
      WHERE password_hash NOT LIKE '$2b$%' OR password_hash IS NULL
    `);

    console.log(`Encontrados ${usuariosResult.rows.length} usuarios para actualizar`);

    for (const user of usuariosResult.rows) {
      // Si no tiene contraseña, usar el username como contraseña por defecto
      const plainPassword = user.password_hash || user.username;
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      
      await query("UPDATE usuarios SET password_hash = $1 WHERE id = $2", [
        hashedPassword,
        user.id,
      ]);
      console.log(`Actualizado usuario ID: ${user.id} (${user.username})`);
    }

    // Obtener todos los usuarios de la tabla usuarios_clientes
    const clientesResult = await query(`
      SELECT id, username, password_hash 
      FROM usuarios_clientes 
      WHERE password_hash NOT LIKE '$2b$%' OR password_hash IS NULL
    `);

    console.log(`Encontrados ${clientesResult.rows.length} usuarios clientes para actualizar`);

    for (const user of clientesResult.rows) {
      // Si no tiene contraseña, usar el username como contraseña por defecto
      const plainPassword = user.password_hash || user.username;
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      
      await query("UPDATE usuarios_clientes SET password_hash = $1 WHERE id = $2", [
        hashedPassword,
        user.id,
      ]);
      console.log(`Actualizado usuario cliente ID: ${user.id} (${user.username})`);
    }

    console.log("Proceso de hashing completado exitosamente");
  } catch (error) {
    console.error("Error al hashear contraseñas:", error);
  } finally {
    await pool.end();
    process.exit();
  }
}

hashAllPasswords();