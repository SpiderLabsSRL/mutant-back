const express = require("express");
const cors = require("cors");
const { connectDB } = require("./db");

const app = express();

const allowedOrigins = [
  "http://localhost:8080",
  "https://mutantgym.netlify.app",
  "https://mutant-back.onrender.com",
];

// Opciones de configuración CORS
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (
      allowedOrigins.some((allowedOrigin) =>
        origin.includes(allowedOrigin.replace(/https?:\/\//, "")),
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

// ✅ CONFIGURACIÓN CORREGIDA: Aumentar límite para TODAS las rutas
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Rutas
const loginRoutes = require("./src/routes/loginroutes");
const remindersRoutes = require("./src/routes/remindersroutes");
const membersListRoutes = require("./src/routes/memberslistroutes");
const ProductRoutes = require("./src/routes/productsRoutes");
const EmployeeRoutes = require("./src/routes/employeeRoutes");
const cashRoutes = require("./src/routes/cashRoutes");
const servicesRoutes = require("./src/routes/servicesRoutes");
const ReportsRoutes = require("./src/routes/reportsRoutes");
const AccessRoutes = require("./src/routes/accessRoutes");
const RegisterMemberRoutes = require("./src/routes/RegisterMemberRoutes");
const salesControlRoutes = require("./src/routes/salescontrolRoutes");
const newtransactionRoutes = require("./src/routes/newtransactionRoutes");
const sellProductsRoutes = require("./src/routes/sellProductsRoutes");
const suscripcionRoutes = require("./src/routes/suscripcionRoutes");
const pendientesRoutes = require("./src/routes/pendientesRoutes");
const UneteAhoraRoutes = require("./src/routes/UneteAhoraRoutes");
const Planes = require("./src/routes/PlanesRoutes");
const sidebarPasswordRoutes = require("./src/routes/sidebarPasswordRoutes");

// ✅ CONFIGURACIÓN CORREGIDA: Usar las rutas SIN duplicar middleware
app.use("/api/reminders", remindersRoutes);
app.use("/api/login", loginRoutes);
app.use("/api/members", membersListRoutes);
app.use("/api/products", ProductRoutes);
app.use("/api/employees", EmployeeRoutes); // ✅ Esto carga employeeRoutes.js
app.use("/api/cash", cashRoutes);
app.use("/api/services", servicesRoutes);
app.use("/api/reports", ReportsRoutes);
app.use("/api/access", AccessRoutes);
app.use("/api/inscription", RegisterMemberRoutes);
app.use("/api/sales", salesControlRoutes);
app.use("/api", newtransactionRoutes);
app.use("/api/sell-products", sellProductsRoutes);
app.use("/api/suscripcion", suscripcionRoutes);
app.use("/api/pendientes", pendientesRoutes);
app.use("/api/unete-ahora", UneteAhoraRoutes);
app.use("/api/planes", Planes);
app.use("/api/password", sidebarPasswordRoutes);

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Error interno del servidor",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Ruta 404 para manejar rutas no encontradas
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.originalUrl}`,
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
