// backend/controllers/salescontrolController.js
const salesService = require("../services/salescontrolService");

// Función auxiliar para normalizar fechas según zona horaria
const normalizeDateForTimezone = (dateString, timezoneOffset = -4) => {
  if (!dateString) return null;
  
  try {
    // Crear fecha en la zona horaria del cliente (Bolivia UTC-4)
    const date = new Date(dateString);
    
    // Ajustar a la zona horaria del servidor (UTC)
    const serverDate = new Date(date.getTime() - (timezoneOffset * 60 * 60 * 1000));
    
    // Formatear como YYYY-MM-DD para consultas SQL
    return serverDate.toISOString().split('T')[0];
  } catch (error) {
    console.error("❌ Error normalizando fecha:", error);
    return null;
  }
};

const getSales = async (req, res) => {
  try {
    const {
      dateFilterType = "today",
      specificDate,
      startDate,
      endDate,
      sucursal,
      empleadoId,
      page = 1,
      pageSize = 20,
    } = req.query;

    console.log("🔍 Filtros recibidos en sales controller:", {
      dateFilterType,
      specificDate,
      startDate,
      endDate,
      sucursal,
      empleadoId,
      page,
      pageSize,
    });

    // Normalizar fechas para zona horaria (Bolivia UTC-4)
    let normalizedSpecificDate = specificDate;
    let normalizedStartDate = startDate;
    let normalizedEndDate = endDate;

    // Para fecha específica
    if (dateFilterType === "specific" && specificDate) {
      normalizedSpecificDate = normalizeDateForTimezone(specificDate, -4);
      console.log(`📅 Fecha específica normalizada: ${specificDate} -> ${normalizedSpecificDate}`);
    }

    // Para rango de fechas
    if (dateFilterType === "range" && startDate && endDate) {
      normalizedStartDate = normalizeDateForTimezone(startDate, -4);
      normalizedEndDate = normalizeDateForTimezone(endDate, -4);
      console.log(`📅 Rango normalizado: ${startDate}-${endDate} -> ${normalizedStartDate}-${normalizedEndDate}`);
    }

    // Para "today" y "yesterday" - IMPORTANTE: Usar fecha del cliente
    if (dateFilterType === "today" || dateFilterType === "yesterday") {
      // Si el frontend envía specificDate, usarlo (ya está en zona horaria del cliente)
      if (specificDate) {
        normalizedSpecificDate = normalizeDateForTimezone(specificDate, -4);
        console.log(`📅 ${dateFilterType} normalizado: ${specificDate} -> ${normalizedSpecificDate}`);
      } else {
        // Si no, calcular basado en la fecha actual del servidor
        const now = new Date();
        const boliviaOffset = -4 * 60; // Bolivia UTC-4 en minutos
        const serverOffset = now.getTimezoneOffset(); // Offset del servidor en minutos
        const totalOffset = boliviaOffset + serverOffset; // Diferencia total
        
        const boliviaDate = new Date(now.getTime() + totalOffset * 60 * 1000);
        
        if (dateFilterType === "yesterday") {
          boliviaDate.setDate(boliviaDate.getDate() - 1);
        }
        
        normalizedSpecificDate = boliviaDate.toISOString().split('T')[0];
        console.log(`📅 ${dateFilterType} calculado desde servidor: ${normalizedSpecificDate}`);
      }
    }

    // Validaciones
    if (dateFilterType === "range") {
      if (!normalizedStartDate || !normalizedEndDate) {
        return res.status(400).json({
          error: "Para rango de fechas, debe especificar fecha inicio y fecha fin",
        });
      }
      
      if (new Date(normalizedStartDate) > new Date(normalizedEndDate)) {
        return res.status(400).json({
          error: "La fecha inicio no puede ser mayor a la fecha fin",
        });
      }
    }

    if (dateFilterType === "specific" && !normalizedSpecificDate) {
      return res.status(400).json({
        error: "Para fecha específica, debe seleccionar una fecha",
      });
    }

    // Preparar filtros para el servicio
    const filters = {
      dateFilterType: dateFilterType || "today",
      specificDate: normalizedSpecificDate,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      sucursal: sucursal === "all" ? null : sucursal,
      empleadoId: empleadoId || null,
      // Pasar también las fechas originales para logging
      originalSpecificDate: specificDate,
      originalStartDate: startDate,
      originalEndDate: endDate,
    };

    // Validar página
    const pageNum = Math.max(1, parseInt(page));
    const pageSizeNum = Math.max(1, Math.min(parseInt(pageSize), 100));

    console.log(`📄 Solicitando página ${pageNum} con ${pageSizeNum} registros`);
    console.log(`📅 Filtro activo: ${filters.dateFilterType}`);
    console.log(`📍 Fechas procesadas:`, {
      specificDate: filters.specificDate,
      startDate: filters.startDate,
      endDate: filters.endDate,
      originalSpecificDate: filters.originalSpecificDate,
      originalStartDate: filters.originalStartDate,
      originalEndDate: filters.originalEndDate,
    });

    const result = await salesService.getSales(filters, pageNum, pageSizeNum);

    console.log(`✅ Ventas obtenidas: ${result.sales.length} registros de página ${pageNum}`);

    res.json({
      sales: result.sales,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("❌ Error in getSales controller:", error);
    res.status(500).json({
      error: error.message || "Error al obtener las ventas",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// NUEVA FUNCIÓN: Obtener totales de ventas (sin paginación)
const getTotals = async (req, res) => {
  try {
    const {
      dateFilterType = "today",
      specificDate,
      startDate,
      endDate,
      sucursal,
      empleadoId,
    } = req.query;

    console.log("📊 Filtros recibidos para totales:", {
      dateFilterType,
      specificDate,
      startDate,
      endDate,
      sucursal,
      empleadoId,
    });

    // Normalizar fechas para zona horaria (misma lógica que getSales)
    let normalizedSpecificDate = specificDate;
    let normalizedStartDate = startDate;
    let normalizedEndDate = endDate;

    if (dateFilterType === "specific" && specificDate) {
      normalizedSpecificDate = normalizeDateForTimezone(specificDate, -4);
      console.log(`📅 [Totales] Fecha específica normalizada: ${specificDate} -> ${normalizedSpecificDate}`);
    }

    if (dateFilterType === "range" && startDate && endDate) {
      normalizedStartDate = normalizeDateForTimezone(startDate, -4);
      normalizedEndDate = normalizeDateForTimezone(endDate, -4);
      console.log(`📅 [Totales] Rango normalizado: ${startDate}-${endDate} -> ${normalizedStartDate}-${normalizedEndDate}`);
    }

    if (dateFilterType === "today" || dateFilterType === "yesterday") {
      if (specificDate) {
        normalizedSpecificDate = normalizeDateForTimezone(specificDate, -4);
        console.log(`📅 [Totales] ${dateFilterType} normalizado: ${specificDate} -> ${normalizedSpecificDate}`);
      } else {
        const now = new Date();
        const boliviaOffset = -4 * 60;
        const serverOffset = now.getTimezoneOffset();
        const totalOffset = boliviaOffset + serverOffset;
        
        const boliviaDate = new Date(now.getTime() + totalOffset * 60 * 1000);
        
        if (dateFilterType === "yesterday") {
          boliviaDate.setDate(boliviaDate.getDate() - 1);
        }
        
        normalizedSpecificDate = boliviaDate.toISOString().split('T')[0];
        console.log(`📅 [Totales] ${dateFilterType} calculado: ${normalizedSpecificDate}`);
      }
    }

    // Validaciones
    if (dateFilterType === "range") {
      if (!normalizedStartDate || !normalizedEndDate) {
        return res.status(400).json({
          error: "Para rango de fechas, debe especificar fecha inicio y fecha fin",
        });
      }
      
      if (new Date(normalizedStartDate) > new Date(normalizedEndDate)) {
        return res.status(400).json({
          error: "La fecha inicio no puede ser mayor a la fecha fin",
        });
      }
    }

    if (dateFilterType === "specific" && !normalizedSpecificDate) {
      return res.status(400).json({
        error: "Para fecha específica, debe seleccionar una fecha",
      });
    }

    // Preparar filtros
    const filters = {
      dateFilterType: dateFilterType || "today",
      specificDate: normalizedSpecificDate,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      sucursal: sucursal === "all" ? null : sucursal,
      empleadoId: empleadoId || null,
    };

    console.log("📊 Calculando totales con filtros:", filters);

    // Llamar al servicio para obtener totales
    const totals = await salesService.getTotals(filters);

    console.log("✅ Totales calculados:", totals);

    res.json(totals);
  } catch (error) {
    console.error("❌ Error in getTotals controller:", error);
    res.status(500).json({
      error: error.message || "Error al calcular los totales",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

const getSaleDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query;

    console.log(`🔍 Obteniendo detalles de venta ${id} de tipo ${type}`);

    if (!id || !type) {
      return res
        .status(400)
        .json({ error: "ID y tipo de venta son requeridos" });
    }

    const details = await salesService.getSaleDetails(id, type);
    res.json(details);
  } catch (error) {
    console.error("❌ Error in getSaleDetails controller:", error);
    res.status(500).json({
      error: error.message || "Error al obtener los detalles de la venta",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

const getSucursales = async (req, res) => {
  try {
    console.log("🔄 Obteniendo lista de sucursales para SalesControl...");
    const sucursales = await salesService.getSucursales();
    console.log(`✅ Sucursales obtenidas: ${sucursales.length}`);
    res.json(sucursales);
  } catch (error) {
    console.error("❌ Error in getSucursales controller:", error);
    res.status(500).json({
      error: error.message || "Error al obtener las sucursales",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

module.exports = {
  getSales,
  getTotals,
  getSaleDetails,
  getSucursales,
};