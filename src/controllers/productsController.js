const productsService = require("../services/productsService");

const getProducts = async (req, res) => {
  try {
    const { sucursal } = req.query;
    const products = await productsService.getAllProducts(sucursal);
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await productsService.getProductById(id);
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createProduct = async (req, res) => {
  try {
    const { nombre, precio_venta, sucursales, stock_por_sucursal, sin_stock } = req.body;
    
    // Validaciones básicas
    if (!nombre || !precio_venta) {
      return res.status(400).json({ error: "Nombre y precio_venta son obligatorios" });
    }
    
    if (!sucursales || !Array.isArray(sucursales) || sucursales.length === 0) {
      return res.status(400).json({ error: "Debe seleccionar al menos una sucursal" });
    }
    
    const newProduct = await productsService.createProduct(
      nombre,
      precio_venta,
      sucursales,
      stock_por_sucursal,
      sin_stock || false
    );
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, precio_venta, sucursales, stock_por_sucursal, sin_stock } = req.body;
    
    // Validaciones básicas
    if (!nombre || !precio_venta) {
      return res.status(400).json({ error: "Nombre y precio_venta son obligatorios" });
    }
    
    if (!sucursales || !Array.isArray(sucursales) || sucursales.length === 0) {
      return res.status(400).json({ error: "Debe seleccionar al menos una sucursal" });
    }
    
    const updatedProduct = await productsService.updateProduct(
      id,
      nombre,
      precio_venta,
      sucursales,
      stock_por_sucursal,
      sin_stock || false
    );
    res.json(updatedProduct);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    await productsService.deleteProduct(id);
    res.status(204).send();
  } catch (error) {
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
    res.status(500).json({ error: error.message });
  }
};

const addStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { sucursal_id, cantidad } = req.body;
    
    // Validaciones
    if (!sucursal_id) {
      return res.status(400).json({ error: "sucursal_id es obligatorio" });
    }
    
    if (!cantidad || cantidad <= 0) {
      return res.status(400).json({ error: "cantidad debe ser mayor a 0" });
    }
    
    await productsService.addStock(id, sucursal_id, cantidad);
    res.status(200).json({ message: "Stock agregado correctamente" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getSucursales = async (req, res) => {
  try {
    const sucursales = await productsService.getSucursales();
    res.json(sucursales);
  } catch (error) {
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
  getProductStock,
  addStock,
  getSucursales
};