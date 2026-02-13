// src/services/suscripcionService.js
const { query } = require("../../db");

const verificarEstadoSuscripcion = async () => {
  try {
    // La tabla Suscripcion solo tiene la columna "Pagado"
    const result = await query(
      `SELECT "Pagado" FROM public."Suscripcion" LIMIT 1`,
    );

    // Si no hay registros, consideramos que no está pagado
    if (result.rows.length === 0) {
      return false;
    }

    // PostgreSQL puede retornar en minúsculas, probemos ambos
    const primeraFila = result.rows[0];
    const valorPagado =
      primeraFila.Pagado !== undefined
        ? primeraFila.Pagado
        : primeraFila.pagado;

    // Si es undefined o null, retornar false
    if (valorPagado === undefined || valorPagado === null) {
      return false;
    }

    // Si ya es booleano
    if (typeof valorPagado === "boolean") {
      return valorPagado;
    }

    // Si es número
    if (typeof valorPagado === "number") {
      return valorPagado === 1;
    }

    // Si es string
    if (typeof valorPagado === "string") {
      const valorLower = valorPagado.toLowerCase().trim();
      return valorLower === "true" || valorLower === "1" || valorLower === "t";
    }

    // Por defecto
    return false;
  } catch (error) {
    console.error("Error en verificarEstadoSuscripcion:", error);
    // PROPAGAMOS el error para que el controlador pueda manejarlo
    throw error;
  }
};

module.exports = {
  verificarEstadoSuscripcion,
};
