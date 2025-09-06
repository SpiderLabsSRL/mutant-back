const productsService = require("../services/productsService");

const getProducts = async (req, res) => {
  try {
    const products = await productsService.getAllProducts();
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
    const { nombre, precio_compra, precio_venta, proveedor, sucursales, stock_por_sucursal } = req.body;
    const newProduct = await productsService.createProduct(
      nombre,
      precio_compra,
      precio_venta,
      proveedor,
      sucursales,
      stock_por_sucursal
    );
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, precio_compra, precio_venta, proveedor, sucursales, stock_por_sucursal } = req.body;
    const updatedProduct = await productsService.updateProduct(
      id,
      nombre,
      precio_compra,
      precio_venta,
      proveedor,
      sucursales,
      stock_por_sucursal
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
    res.json(updatedProduct);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getProductStock = async (req, res) => {
  try {
    const { id } = req.params;
    const stock = await productsService.getProductStock(id);
    res.json(stock);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const addStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { sucursal_id, cantidad } = req.body;
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