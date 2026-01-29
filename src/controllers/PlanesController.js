// src/controllers/PlanesController.js
const planesService = require("../services/PlanesService");

class PlanesController {
  // Obtener todos los planes con sus sucursales
  async getPlanes(req, res) {
    try {
      const planes = await planesService.getAllPlanes();
      res.json(planes);
    } catch (error) {
      console.error("Error en getPlanes:", error);
      res.status(500).json({
        error: error.message || "Error al obtener los planes",
      });
    }
  }

  // Obtener solo planes activos (estado = 1)
  async getPlanesActivos(req, res) {
    try {
      const planes = await planesService.getActivePlanes();
      res.json(planes);
    } catch (error) {
      console.error("Error en getPlanesActivos:", error);
      res.status(500).json({
        error: error.message || "Error al obtener los planes activos",
      });
    }
  }

  // Crear un nuevo plan
  async createPlan(req, res) {
    try {
      const planData = req.body;
      const newPlan = await planesService.createPlan(planData);
      res.status(201).json(newPlan);
    } catch (error) {
      console.error("Error en createPlan:", error);
      res.status(400).json({
        error: error.message || "Error al crear el plan",
      });
    }
  }

  // Actualizar un plan
  async updatePlan(req, res) {
    try {
      const { id } = req.params;
      const planData = req.body;
      const updatedPlan = await planesService.updatePlan(id, planData);
      res.json(updatedPlan);
    } catch (error) {
      console.error("Error en updatePlan:", error);
      res.status(400).json({
        error: error.message || "Error al actualizar el plan",
      });
    }
  }

  // Eliminar un plan
  async deletePlan(req, res) {
    try {
      const { id } = req.params;
      await planesService.deletePlan(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error en deletePlan:", error);
      res.status(400).json({
        error: error.message || "Error al eliminar el plan",
      });
    }
  }

  // Cambiar estado de un plan (activar/desactivar)
  async togglePlanStatus(req, res) {
    try {
      const { id } = req.params;
      const updatedPlan = await planesService.togglePlanStatus(id);
      res.json(updatedPlan);
    } catch (error) {
      console.error("Error en togglePlanStatus:", error);
      res.status(400).json({
        error: error.message || "Error al cambiar el estado del plan",
      });
    }
  }

  // Obtener tipos de duración disponibles
  async getTiposDuracion(req, res) {
    try {
      const tipos = await planesService.getTiposDuracion();
      res.json(tipos);
    } catch (error) {
      console.error("Error en getTiposDuracion:", error);
      res.status(500).json({
        error: error.message || "Error al obtener los tipos de duración",
      });
    }
  }

  // Obtener sucursales de un plan específico
  async getSucursalesByPlan(req, res) {
    try {
      const { id } = req.params;
      const sucursales = await planesService.getSucursalesByPlan(id);
      res.json(sucursales);
    } catch (error) {
      console.error("Error en getSucursalesByPlan:", error);
      res.status(500).json({
        error: error.message || "Error al obtener las sucursales del plan",
      });
    }
  }

  // Actualizar sucursales de un plan
  async updatePlanSucursales(req, res) {
    try {
      const { id } = req.params;
      const { sucursalesIds } = req.body;
      const result = await planesService.updatePlanSucursales(
        id,
        sucursalesIds,
      );
      res.json(result);
    } catch (error) {
      console.error("Error en updatePlanSucursales:", error);
      res.status(400).json({
        error: error.message || "Error al actualizar las sucursales del plan",
      });
    }
  }
}

module.exports = new PlanesController();
