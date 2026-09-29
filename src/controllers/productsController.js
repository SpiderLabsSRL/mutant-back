const productsService = require("../services/productsService");

const getProducts = async (req, res) => {
  try {
    const { sucursal } = req.query;
    const products = await productsService.getAllProducts(sucursal);
    res.json(products);
  } catch (error) {
    console.error("Error en getProducts:", error);
    res.status(500).json({ error: error.message });
  }
};

const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await productsService.getProductById(id);
    if (!product) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }
    res.json(product);
  } catch (error) {
    console.error("Error en getProductById:", error);
    res.status(500).json({ error: error.message });
  }
};

const createProduct = async (req, res) => {
  try {
    const {
      nombre,
      precio_venta,
      sucursales,
      stock_por_sucursal,
      sin_stock,
      precio_compra,
      codigo,
      stock_minimo_por_sucursal,
      imagen,
      landing,
    } = req.body;

    // Validaciones básicas
    if (!nombre || !precio_venta) {
      return res.status(400).json({ error: "Nombre y precio_venta son obligatorios" });
    }

    if (!sucursales || !Array.isArray(sucursales) || sucursales.length === 0) {
      return res.status(400).json({ error: "Debe seleccionar al menos una sucursal" });
    }

    if (parseFloat(precio_venta) <= 0) {
      return res.status(400).json({ error: "El precio de venta debe ser mayor a 0" });
    }

    if (precio_compra !== undefined && precio_compra !== null && parseFloat(precio_compra) <= 0) {
      return res.status(400).json({ error: "El precio de compra debe ser mayor a 0" });
    }

    const newProduct = await productsService.createProduct({
      nombre,
      precio_venta,
      sucursales,
      stock_por_sucursal,
      sin_stock: sin_stock || false,
      precio_compra,
      codigo,
      stock_minimo_por_sucursal,
      imagen, // base64 string
      landing: landing || false,
    });

    res.status(201).json(newProduct);
  } catch (error) {
    console.error("Error en createProduct:", error);
    res.status(500).json({ error: error.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      precio_venta,
      sucursales,
      stock_por_sucursal,
      sin_stock,
      precio_compra,
      codigo,
      stock_minimo_por_sucursal,
      imagen,
      landing,
    } = req.body;

    if (!nombre || !precio_venta) {
      return res.status(400).json({ error: "Nombre y precio_venta son obligatorios" });
    }

    if (!sucursales || !Array.isArray(sucursales) || sucursales.length === 0) {
      return res.status(400).json({ error: "Debe seleccionar al menos una sucursal" });
    }

    if (parseFloat(precio_venta) <= 0) {
      return res.status(400).json({ error: "El precio de venta debe ser mayor a 0" });
    }

    if (precio_compra !== undefined && precio_compra !== null && parseFloat(precio_compra) <= 0) {
      return res.status(400).json({ error: "El precio de compra debe ser mayor a 0" });
    }

    const updatedProduct = await productsService.updateProduct(id, {
      nombre,
      precio_venta,
      sucursales,
      stock_por_sucursal,
      sin_stock: sin_stock || false,
      precio_compra,
      codigo,
      stock_minimo_por_sucursal,
      imagen,
      landing,
    });

    res.json(updatedProduct);
  } catch (error) {
    console.error("Error en updateProduct:", error);
    res.status(500).json({ error: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    await productsService.deleteProduct(id);
    res.status(204).send();
  } catch (error) {
    console.error("Error en deleteProduct:", error);
    res.status(500).json({ error: error.message });
  }
};

const toggleProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedProduct = await productsService.toggleProductStatus(id);

    if (!updatedProduct) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    res.json(updatedProduct);
  } catch (error) {
    console.error("Error en toggleProductStatus:", error);
    res.status(500).json({ error: error.message });
  }
};

const toggleProductLanding = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedProduct = await productsService.toggleProductLanding(id);

    if (!updatedProduct) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    res.json(updatedProduct);
  } catch (error) {
    console.error("Error en toggleProductLanding:", error);
    res.status(500).json({ error: error.message });
  }
};

const getProductStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { sucursal } = req.query;
    const stock = await productsService.getProductStock(id, sucursal);
    res.json(stock);
  } catch (error) {
    console.error("Error en getProductStock:", error);
    res.status(500).json({ error: error.message });
  }
};

const addStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { sucursal_id, cantidad } = req.body;

    if (!sucursal_id) {
      return res.status(400).json({ error: "sucursal_id es obligatorio" });
    }

    if (!cantidad || cantidad <= 0) {
      return res.status(400).json({ error: "cantidad debe ser mayor a 0" });
    }

    await productsService.addStock(id, sucursal_id, cantidad);
    res.status(200).json({ message: "Stock agregado correctamente" });
  } catch (error) {
    console.error("Error en addStock:", error);
    res.status(500).json({ error: error.message });
  }
};

const getSucursales = async (req, res) => {
  try {
    const sucursales = await productsService.getSucursales();
    res.json(sucursales);
  } catch (error) {
    console.error("Error en getSucursales:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductStatus,
  toggleProductLanding,
  getProductStock,
  addStock,
  getSucursales,
};