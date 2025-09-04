const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD ,
  port: process.env.DB_PORT,
});

// Función para ejecutar consultas
const query = async (text, params) => {
  try {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log("Query ejecutada", { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error("Error en query:", { text, error });
    throw error;
  }
};

// Conexión a la base de datos
const connectDB = async () => {
  try {
    await pool.connect();
    console.log("PostgreSQL conectado correctamente 🚀");
    return pool;
  } catch (error) {
    console.error("Error al conectar a PostgreSQL:", error);
    process.exit(1);
  }
};

module.exports = {
  connectDB,
  query,
  pool,
};
