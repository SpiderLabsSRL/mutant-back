const express = require("express");
const cors = require("cors");
const { connectDB } = require("./db");

const app = express();

// Rutas
//ejemplo :const authRoutes = require("./src/routes/authRoutes");
const loginRoutes = require("./src/routes/loginroutes");
const remindersRoutes = require("./src/routes/remindersroutes");
const membersListRoutes = require("./src/routes/memberslistroutes");
const ProductRoutes = require("./src/routes/productsRoutes");
const EmployeeRoutes = require ("./src/routes/employeeRoutes");
const cashRoutes = require("./src/routes/cashRoutes");
const servicesRoutes = require("./src/routes/servicesRoutes"); 
const ReportsRoutes = require("./src/routes/reportsRoutes");
const AccessRoutes = require("./src/routes/accessRoutes");
const RegisterMemberRoutes = require("./src/routes/RegisterMemberRoutes");
const salesControlRoutes = require('./src/routes/salescontrolRoutes');
const RegisterMemberRoutes = require("./src/routes/RegisterMemberRoutes");
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

// Rutas 
//ejempl: app.use("/api/auth", authRoutes);
app.use("/api/reminders", remindersRoutes);
app.use("/api/login", loginRoutes);
app.use("/api/members", membersListRoutes);
app.use("/api/products", ProductRoutes);
app.use("/api/employees",EmployeeRoutes);
app.use("/api/cash", cashRoutes);
app.use("/api/services", servicesRoutes);
app.use("/api/reports", ReportsRoutes);
app.use("/api/access",AccessRoutes);
app.use("/api/inscription", RegisterMemberRoutes);
app.use('/api/sales', salesControlRoutes);
app.use("/api/inscription", RegisterMemberRoutes);

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Error interno del servidor",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Iniciar el servidor
const startServer = async () => {
  try {
    await connectDB();
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en el puerto ${PORT}`);
    });
  } catch (error) {
    console.error("Error al iniciar el servidor:", error);
    process.exit(1);
  }
};

startServer();