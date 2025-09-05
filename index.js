const express = require("express");
const cors = require("cors");
const { connectDB } = require("./db");

const app = express();

// Rutas
const loginRoutes = require("./src/routes/loginroutes");
const remindersRoutes = require("./src/routes/remindersroutes");

// Lista de orígenes permitidos
const allowedOrigins = [
  "http://localhost:8080",
  "https://libreriamaite.netlify.app",//front en linea
  "https://libreriamaiteback.onrender.com",//back en linea
];

// Opciones de configuración CORS
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // permite herramientas como Postman

    if (
      allowedOrigins.some((allowedOrigin) =>
        origin.includes(allowedOrigin.replace(/https?:\/\//, ""))
      )
    ) {
      return callback(null, true);
    }

    const msg = `El origen ${origin} no tiene permiso de acceso.`;
    return callback(new Error(msg), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// Aplica CORS
app.use(cors(corsOptions));

// Maneja solicitudes preflight (OPTIONS)
app.options("*", cors(corsOptions));

// Middleware para parsear JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas - ¡AGREGA ESTA LÍNEA!
app.use("/api/reminders", remindersRoutes);
app.use("/api/login", loginRoutes);

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Error interno del servidor",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Ruta de prueba para verificar que el servidor funciona
app.get("/api/health", (req, res) => {
  res.json({ 
    success: true, 
    message: "Servidor funcionando correctamente",
    timestamp: new Date().toISOString()
  });
});

// Ruta de prueba específica para reminders
app.get("/api/reminders/test", (req, res) => {
  res.json({ 
    success: true, 
    message: "Ruta de reminders funcionando",
    data: [
      { id: 1, nombre: "Test Member", telefono: "+591 70000000" }
    ]
  });
});

// Iniciar el servidor
const startServer = async () => {
  try {
    await connectDB();
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en el puerto ${PORT}`);
      console.log(`Rutas disponibles:`);
      console.log(`- GET  /api/health`);
      console.log(`- GET  /api/reminders/test`);
      console.log(`- GET  /api/reminders/new-members`);
      console.log(`- GET  /api/reminders/expiring-members`);
      console.log(`- GET  /api/reminders/birthday-members`);
    });
  } catch (error) {
    console.error("Error al iniciar el servidor:", error);
    process.exit(1);
  }
};

startServer();