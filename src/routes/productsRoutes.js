const express = require("express");
const router = express.Router();
const productsController = require("../controllers/productsController");
const { authenticate, authorize } = require("../middleware/loginmiddleware");

// ============================================
// RUTAS PÚBLICAS (sin autenticación)
// ============================================
// Ninguna. Todas requieren login.

// ============================================
// RUTAS PROTEGIDAS
// ============================================
router.use(authenticate);

// --- Productos ---
router.get("/products", productsController.getProducts);
router.get("/products/:id", productsController.getProductById);
router.get("/products/:id/stock", productsController.getProductStock);

// Solo admin puede crear, editar, eliminar, cambiar estado/landing
router.post(
  "/products",
  authorize(["admin"]),
  productsController.createProduct
);

router.put(
  "/products/:id",
  authorize(["admin"]),
  productsController.updateProduct
);

router.delete(
  "/products/:id",
  authorize(["admin"]),
  productsController.deleteProduct
);

router.patch(
  "/products/:id/update-status",
  authorize(["admin"]),
  productsController.toggleProductStatus
);

router.patch(
  "/products/:id/toggle-landing",
  authorize(["admin"]),
  productsController.toggleProductLanding
);

// ✅ Agregar stock: admin Y recepcionista
router.post(
  "/products/:id/add-stock",
  authorize(["admin", "recepcionista"]),
  productsController.addStock
);

// --- Sucursales ---
router.get("/sucursales", productsController.getSucursales);

module.exports = router;