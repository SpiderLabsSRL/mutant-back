const employeeService = require("../services/employeeService");

exports.getBranches = async (req, res) => {
  try {
    const branches = await employeeService.getBranches();
    res.json(branches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEmployees = async (req, res) => {
  try {
    const employees = await employeeService.getEmployees();
    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createEmployee = async (req, res) => {
  try {
    const employeeData = req.body;
    const newEmployee = await employeeService.createEmployee(employeeData);
    res.status(201).json(newEmployee);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const employeeData = req.body;
    const updatedEmployee = await employeeService.updateEmployee(id, employeeData);
    res.json(updatedEmployee);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    await employeeService.deleteEmployee(id);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.toggleEmployeeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedEmployee = await employeeService.toggleEmployeeStatus(id);
    res.json(updatedEmployee);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.registerFingerprint = async (req, res) => {
  try {
    const { id } = req.params;
    await employeeService.registerFingerprint(id);
    res.status(200).json({ message: "Huella registrada exitosamente" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};