const express = require("express");
const router = express.Router();
const productsController = require("../controllers/productsController");

// Rutas para productos
router.get("/products", productsController.getProducts);
router.post("/products", productsController.createProduct);
router.get("/products/:id", productsController.getProductById);
router.put("/products/:id", productsController.updateProduct);
router.delete("/products/:id", productsController.deleteProduct);
router.patch("/products/:id/update-status", productsController.toggleProductStatus);
router.get("/products/:id/stock", productsController.getProductStock);
router.post("/products/:id/add-stock", productsController.addStock);

// Rutas para sucursales
router.get("/sucursales", productsController.getSucursales);

module.exports = router;