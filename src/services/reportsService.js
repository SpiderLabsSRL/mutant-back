const { query } = require("../../db");

// ============================================
// HELPERS
// ============================================
const getBoliviaDate = () => {
  const now = new Date();
  return new Date(now.getTime() - 4 * 60 * 60 * 1000);
};

const formatDateToSQL = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const obtenerFechasFiltro = (filtros) => {
  let fechaInicio, fechaFin;
  const hoyBolivia = getBoliviaDate();

  switch (filtros.tipoFiltro) {
    case "today":
      fechaInicio = new Date(Date.UTC(hoyBolivia.getUTCFullYear(), hoyBolivia.getUTCMonth(), hoyBolivia.getUTCDate(), 0, 0, 0));
      fechaFin = new Date(Date.UTC(hoyBolivia.getUTCFullYear(), hoyBolivia.getUTCMonth(), hoyBolivia.getUTCDate(), 23, 59, 59));
      break;

    case "yesterday": {
      const ayer = new Date(hoyBolivia);
      ayer.setUTCDate(ayer.getUTCDate() - 1);
      fechaInicio = new Date(Date.UTC(ayer.getUTCFullYear(), ayer.getUTCMonth(), ayer.getUTCDate(), 0, 0, 0));
      fechaFin = new Date(Date.UTC(ayer.getUTCFullYear(), ayer.getUTCMonth(), ayer.getUTCDate(), 23, 59, 59));
      break;
    }

    case "thisWeek": {
      const inicioSemana = new Date(hoyBolivia);
      const diaSemana = inicioSemana.getUTCDay();
      const diff = diaSemana === 0 ? 6 : diaSemana - 1;
      inicioSemana.setUTCDate(inicioSemana.getUTCDate() - diff);
      fechaInicio = new Date(Date.UTC(inicioSemana.getUTCFullYear(), inicioSemana.getUTCMonth(), inicioSemana.getUTCDate(), 0, 0, 0));
      fechaFin = new Date(Date.UTC(hoyBolivia.getUTCFullYear(), hoyBolivia.getUTCMonth(), hoyBolivia.getUTCDate(), 23, 59, 59));
      break;
    }

    case "lastWeek": {
      const semanaPasada = new Date(hoyBolivia);
      semanaPasada.setUTCDate(semanaPasada.getUTCDate() - 7);
      const diaSemanaPasada = semanaPasada.getUTCDay();
      const diffPasada = diaSemanaPasada === 0 ? 6 : diaSemanaPasada - 1;
      semanaPasada.setUTCDate(semanaPasada.getUTCDate() - diffPasada);
      fechaInicio = new Date(Date.UTC(semanaPasada.getUTCFullYear(), semanaPasada.getUTCMonth(), semanaPasada.getUTCDate(), 0, 0, 0));
      const finSemanaPasada = new Date(semanaPasada);
      finSemanaPasada.setUTCDate(semanaPasada.getUTCDate() + 6);
      fechaFin = new Date(Date.UTC(finSemanaPasada.getUTCFullYear(), finSemanaPasada.getUTCMonth(), finSemanaPasada.getUTCDate(), 23, 59, 59));
      break;
    }

    case "thisMonth":
      fechaInicio = new Date(Date.UTC(hoyBolivia.getUTCFullYear(), hoyBolivia.getUTCMonth(), 1, 0, 0, 0));
      fechaFin = new Date(Date.UTC(hoyBolivia.getUTCFullYear(), hoyBolivia.getUTCMonth(), hoyBolivia.getUTCDate(), 23, 59, 59));
      break;

    case "lastMonth": {
      const mesPasado = new Date(hoyBolivia);
      mesPasado.setUTCMonth(mesPasado.getUTCMonth() - 1);
      fechaInicio = new Date(Date.UTC(mesPasado.getUTCFullYear(), mesPasado.getUTCMonth(), 1, 0, 0, 0));
      fechaFin = new Date(Date.UTC(mesPasado.getUTCFullYear(), mesPasado.getUTCMonth() + 1, 0, 23, 59, 59));
      break;
    }

    case "specific":
      if (filtros.fechaEspecifica) {
        const fecha = new Date(filtros.fechaEspecifica);
        fechaInicio = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate(), 0, 0, 0));
        fechaFin = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate(), 23, 59, 59));
      }
      break;

    case "range":
      if (filtros.fechaInicio) {
        fechaInicio = new Date(filtros.fechaInicio);
        fechaInicio.setUTCHours(0, 0, 0, 0);
      }
      if (filtros.fechaFin) {
        fechaFin = new Date(filtros.fechaFin);
        fechaFin.setUTCHours(23, 59, 59, 999);
      }
      break;

    default: // 'all'
      fechaInicio = new Date(0);
      fechaFin = new Date();
      fechaFin.setUTCHours(23, 59, 59, 999);
  }

  if (!fechaInicio) fechaInicio = new Date(0);
  if (!fechaFin) fechaFin = new Date();

  return { fechaInicio, fechaFin };
};

// ============================================
// SUCURSALES
// ============================================
const obtenerSucursales = async () => {
  const result = await query(`
    SELECT id::text, nombre as name 
    FROM sucursales 
    WHERE estado = 1 
    ORDER BY nombre
  `);
  return [{ id: "all", name: "Todas las sucursales" }, ...result.rows];
};

// ============================================
// REPORTES PRINCIPALES
// ============================================
const obtenerReportes = async (filtros) => {
  try {
    const { fechaInicio, fechaFin } = obtenerFechasFiltro(filtros);

    const [
      resumen,
      servicios,
      productos,
      atrasos,
      tendencias,
      ingresosServicios,
    ] = await Promise.all([
      obtenerResumen(fechaInicio, fechaFin, filtros.sucursalId),
      obtenerServiciosMasVendidos(fechaInicio, fechaFin, filtros.sucursalId),
      obtenerProductosMasVendidos(fechaInicio, fechaFin, filtros.sucursalId),
      obtenerAtrasosTrabajadores(fechaInicio, fechaFin, filtros.sucursalId),
      obtenerTendenciasMensuales(fechaInicio, fechaFin, filtros.sucursalId),
      obtenerIngresosServiciosData(fechaInicio, fechaFin, filtros.sucursalId),
    ]);

    return {
      resumen,
      servicios,
      productos,
      atrasos,
      tendencias,
      ingresosServicios,
    };
  } catch (error) {
    console.error("Error en reportsService:", error);
    throw new Error("Error al generar los reportes");
  }
};

// ============================================
// RESUMEN GENERAL
// ============================================
const obtenerResumen = async (fechaInicio, fechaFin, sucursalId) => {
  try {
    const fechaInicioStr = formatDateToSQL(fechaInicio);
    const fechaFinStr = formatDateToSQL(fechaFin);

    let whereClause = "WHERE vs.fecha BETWEEN $1 AND $2";
    let params = [fechaInicioStr, fechaFinStr];
    let paramCount = 2;

    if (sucursalId && sucursalId !== "all") {
      paramCount++;
      whereClause += ` AND vs.sucursal_id = $${paramCount}`;
      params.push(sucursalId);
    }

    const serviciosQuery = `
      SELECT COUNT(*) as count 
      FROM detalle_venta_servicios dvs
      JOIN ventas_servicios vs ON dvs.venta_servicio_id = vs.id
      ${whereClause}
    `;

    const ingresosQuery = `
      SELECT COALESCE(SUM(total), 0) as total 
      FROM (
        SELECT total FROM ventas_servicios 
        WHERE fecha BETWEEN $1 AND $2
        ${sucursalId && sucursalId !== "all" ? `AND sucursal_id = $${paramCount}` : ""}
        UNION ALL
        SELECT total FROM ventas_productos 
        WHERE fecha BETWEEN $1 AND $2
        ${sucursalId && sucursalId !== "all" ? `AND sucursal_id = $${paramCount}` : ""}
      ) as ventas_totales
    `;

    const productosQuery = `
      SELECT COALESCE(SUM(dvp.cantidad), 0) as count 
      FROM detalle_venta_productos dvp
      JOIN ventas_productos vp ON dvp.venta_producto_id = vp.id
      WHERE vp.fecha BETWEEN $1 AND $2
      ${sucursalId && sucursalId !== "all" ? `AND vp.sucursal_id = $${paramCount}` : ""}
    `;

    const atrasosQuery = `
      SELECT 
        COALESCE(SUM(
          CASE WHEN ra.detalle LIKE '%tarde%' OR ra.detalle LIKE '%antes%'
          THEN CAST(
            COALESCE(NULLIF(regexp_replace(ra.detalle, '\\D', '', 'g'), ''), '0'
          ) AS INTEGER)
          ELSE 0 END
        ), 0) AS minutos_atraso_total
      FROM registros_acceso ra
      WHERE ra.fecha BETWEEN $1 AND $2
        AND ra.tipo_persona = 'empleado'
        AND ra.estado = 'exitoso'
        ${sucursalId && sucursalId !== "all" ? `AND ra.sucursal_id = $${paramCount}` : ""}
    `;

    const [serviciosResult, ingresosResult, productosResult, atrasosResult] =
      await Promise.all([
        query(serviciosQuery, params),
        query(ingresosQuery, params),
        query(productosQuery, params),
        query(atrasosQuery, params),
      ]);

    const tendencias = await calcularTendencias(
      fechaInicio,
      fechaFin,
      sucursalId,
      {
        servicios: parseInt(serviciosResult.rows[0]?.count) || 0,
        productos: parseInt(productosResult.rows[0]?.count) || 0,
        ingresos: parseFloat(ingresosResult.rows[0]?.total) || 0,
        atrasos: parseInt(atrasosResult.rows[0]?.minutos_atraso_total) || 0,
      }
    );

    return {
      serviciosVendidos: parseInt(serviciosResult.rows[0]?.count) || 0,
      productosVendidos: parseInt(productosResult.rows[0]?.count) || 0,
      ingresosTotales: parseFloat(ingresosResult.rows[0]?.total) || 0,
      minutosAtraso: parseInt(atrasosResult.rows[0]?.minutos_atraso_total) || 0,
      tendenciaServicios: tendencias.servicios,
      tendenciaProductos: tendencias.productos,
      tendenciaIngresos: tendencias.ingresos,
      tendenciaAtrasos: tendencias.atrasos,
    };
  } catch (error) {
    console.error("Error obteniendo resumen:", error);
    throw error;
  }
};

const calcularTendencias = async (fechaInicio, fechaFin, sucursalId, datosActuales) => {
  try {
    const duracion = fechaFin - fechaInicio;
    const periodoAnteriorInicio = new Date(fechaInicio.getTime() - duracion);
    const periodoAnteriorFin = new Date(fechaFin.getTime() - duracion);

    const fechaInicioAnteriorStr = formatDateToSQL(periodoAnteriorInicio);
    const fechaFinAnteriorStr = formatDateToSQL(periodoAnteriorFin);

    let paramsAnterior = [fechaInicioAnteriorStr, fechaFinAnteriorStr];
    let paramCount = 2;

    if (sucursalId && sucursalId !== "all") {
      paramCount++;
      paramsAnterior.push(sucursalId);
    }

    const serviciosQueryAnterior = `
      SELECT COUNT(*) as count 
      FROM detalle_venta_servicios dvs
      JOIN ventas_servicios vs ON dvs.venta_servicio_id = vs.id
      WHERE vs.fecha BETWEEN $1 AND $2
      ${sucursalId && sucursalId !== "all" ? `AND vs.sucursal_id = $${paramCount}` : ""}
    `;

    const ingresosQueryAnterior = `
      SELECT COALESCE(SUM(total), 0) as total 
      FROM (
        SELECT total FROM ventas_servicios 
        WHERE fecha BETWEEN $1 AND $2
        ${sucursalId && sucursalId !== "all" ? `AND sucursal_id = $${paramCount}` : ""}
        UNION ALL
        SELECT total FROM ventas_productos 
        WHERE fecha BETWEEN $1 AND $2
        ${sucursalId && sucursalId !== "all" ? `AND sucursal_id = $${paramCount}` : ""}
      ) as ventas_totales
    `;

    const productosQueryAnterior = `
      SELECT COALESCE(SUM(dvp.cantidad), 0) as count 
      FROM detalle_venta_productos dvp
      JOIN ventas_productos vp ON dvp.venta_producto_id = vp.id
      WHERE vp.fecha BETWEEN $1 AND $2
      ${sucursalId && sucursalId !== "all" ? `AND vp.sucursal_id = $${paramCount}` : ""}
    `;

    const atrasosQueryAnterior = `
      SELECT 
        COALESCE(SUM(
          CASE WHEN ra.detalle LIKE '%tarde%' OR ra.detalle LIKE '%antes%'
          THEN CAST(
            COALESCE(NULLIF(regexp_replace(ra.detalle, '\\D', '', 'g'), ''), '0'
          ) AS INTEGER)
          ELSE 0 END
        ), 0) AS minutos_atraso_total
      FROM registros_acceso ra
      WHERE ra.fecha BETWEEN $1 AND $2
        AND ra.tipo_persona = 'empleado'
        AND ra.estado = 'exitoso'
        ${sucursalId && sucursalId !== "all" ? `AND ra.sucursal_id = $${paramCount}` : ""}
    `;

    const [
      serviciosAnterior,
      ingresosAnterior,
      productosAnterior,
      atrasosAnterior,
    ] = await Promise.all([
      query(serviciosQueryAnterior, paramsAnterior),
      query(ingresosQueryAnterior, paramsAnterior),
      query(productosQueryAnterior, paramsAnterior),
      query(atrasosQueryAnterior, paramsAnterior),
    ]);

    const calcularPorcentaje = (actual, anterior) => {
      if (anterior === 0) return actual > 0 ? "+100%" : "0%";
      const cambio = ((actual - anterior) / anterior) * 100;
      return `${cambio >= 0 ? "+" : ""}${cambio.toFixed(1)}%`;
    };

    return {
      servicios: calcularPorcentaje(
        datosActuales.servicios,
        parseInt(serviciosAnterior.rows[0]?.count) || 0
      ),
      productos: calcularPorcentaje(
        datosActuales.productos,
        parseInt(productosAnterior.rows[0]?.count) || 0
      ),
      ingresos: calcularPorcentaje(
        datosActuales.ingresos,
        parseFloat(ingresosAnterior.rows[0]?.total) || 0
      ),
      atrasos: calcularPorcentaje(
        datosActuales.atrasos,
        parseInt(atrasosAnterior.rows[0]?.minutos_atraso_total) || 0
      ),
    };
  } catch (error) {
    console.error("Error calculando tendencias:", error);
    return { servicios: "+0%", productos: "+0%", ingresos: "+0%", atrasos: "+0%" };
  }
};

// ============================================
// SERVICIOS MÁS VENDIDOS
// ============================================
const obtenerServiciosMasVendidos = async (fechaInicio, fechaFin, sucursalId) => {
  try {
    const fechaInicioStr = formatDateToSQL(fechaInicio);
    const fechaFinStr = formatDateToSQL(fechaFin);

    let whereClause = "WHERE vs.fecha BETWEEN $1 AND $2";
    let params = [fechaInicioStr, fechaFinStr];
    let paramCount = 2;

    if (sucursalId && sucursalId !== "all") {
      paramCount++;
      whereClause += ` AND vs.sucursal_id = $${paramCount}`;
      params.push(sucursalId);
    }

    const queryText = `
      SELECT 
        s.nombre,
        COUNT(dvs.id) as ventas,
        COALESCE(SUM(dvs.precio), 0) as ingresos
      FROM servicios s
      JOIN inscripciones i ON s.id = i.servicio_id
      JOIN detalle_venta_servicios dvs ON i.id = dvs.inscripcion_id
      JOIN ventas_servicios vs ON dvs.venta_servicio_id = vs.id
      ${whereClause}
      GROUP BY s.id, s.nombre
      ORDER BY ventas DESC
      LIMIT 6
    `;

    const result = await query(queryText, params);
    const colores = ["#8B5CF6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#6366F1"];

    return result.rows.map((row, index) => ({
      nombre: row.nombre,
      ventas: parseInt(row.ventas),
      ingresos: parseFloat(row.ingresos),
      color: colores[index] || colores[0],
    }));
  } catch (error) {
    console.error("Error obteniendo servicios más vendidos:", error);
    throw error;
  }
};

// ============================================
// PRODUCTOS MÁS VENDIDOS
// ============================================
const obtenerProductosMasVendidos = async (fechaInicio, fechaFin, sucursalId) => {
  try {
    const fechaInicioStr = formatDateToSQL(fechaInicio);
    const fechaFinStr = formatDateToSQL(fechaFin);

    let whereClause = "WHERE vp.fecha BETWEEN $1 AND $2";
    let params = [fechaInicioStr, fechaFinStr];
    let paramCount = 2;

    if (sucursalId && sucursalId !== "all") {
      paramCount++;
      whereClause += ` AND vp.sucursal_id = $${paramCount}`;
      params.push(sucursalId);
    }

    const queryText = `
      SELECT 
        p.nombre,
        SUM(dvp.cantidad) as ventas,
        COALESCE(SUM(dvp.subtotal), 0) as ingresos,
        COALESCE(ps.stock, 0) as stock
      FROM productos p
      JOIN detalle_venta_productos dvp ON p.id = dvp.producto_id
      JOIN ventas_productos vp ON dvp.venta_producto_id = vp.id
      LEFT JOIN producto_sucursal ps ON p.id = ps.producto_id 
        AND ps.sucursal_id = ${sucursalId && sucursalId !== "all" ? `$${paramCount}` : "vp.sucursal_id"}
      ${whereClause}
      GROUP BY p.id, p.nombre, ps.stock
      ORDER BY ventas DESC
      LIMIT 8
    `;

    const result = await query(queryText, params);

    return result.rows.map((row) => ({
      nombre: row.nombre,
      ventas: parseInt(row.ventas),
      ingresos: parseFloat(row.ingresos),
      stock: parseInt(row.stock) || 0,
    }));
  } catch (error) {
    console.error("Error obteniendo productos más vendidos:", error);
    throw error;
  }
};

// ============================================
// ATRASOS
// ============================================
const obtenerAtrasosTrabajadores = async (fechaInicio, fechaFin, sucursalId) => {
  try {
    const fechaInicioStr = formatDateToSQL(fechaInicio);
    const fechaFinStr = formatDateToSQL(fechaFin);

    let whereClause = "WHERE ra.fecha BETWEEN $1 AND $2";
    whereClause += " AND ra.tipo_persona = 'empleado' AND ra.estado = 'exitoso'";

    let params = [fechaInicioStr, fechaFinStr];
    let paramCount = 2;

    if (sucursalId && sucursalId !== "all") {
      paramCount++;
      whereClause += ` AND ra.sucursal_id = $${paramCount}`;
      params.push(sucursalId);
    }

    const queryText = `
      SELECT 
        CONCAT(p.nombres, ' ', p.apellidos) as trabajador,
        COALESCE(SUM(
          CASE WHEN ra.detalle LIKE '%tarde%' OR ra.detalle LIKE '%antes%'
          THEN CAST(
            COALESCE(NULLIF(regexp_replace(ra.detalle, '\\D', '', 'g'), ''), '0'
          ) AS INTEGER)
          ELSE 0 END
        ), 0) as minutos_acumulados,
        COUNT(DISTINCT 
          CASE WHEN ra.detalle LIKE '%tarde%' OR ra.detalle LIKE '%antes%'
          THEN DATE(ra.fecha) 
          ELSE NULL END
        ) as dias_atraso
      FROM registros_acceso ra
      JOIN usuarios u ON ra.usuario_registro_id = u.id
      JOIN empleados e ON u.empleado_id = e.id
      JOIN personas p ON e.persona_id = p.id
      ${whereClause}
      GROUP BY p.id, p.nombres, p.apellidos
      ORDER BY minutos_acumulados DESC
      LIMIT 6
    `;

    const result = await query(queryText, params);

    return result.rows.map((row) => ({
      trabajador: row.trabajador,
      minutosAcumulados: parseInt(row.minutos_acumulados),
      diasAtraso: parseInt(row.dias_atraso),
    }));
  } catch (error) {
    console.error("Error obteniendo atrasos de trabajadores:", error);
    throw error;
  }
};

// ============================================
// TENDENCIAS MENSUALES
// ============================================
const obtenerTendenciasMensuales = async (fechaInicio, fechaFin, sucursalId) => {
  try {
    const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const tendencias = [];

    const fechaActual = getBoliviaDate();
    for (let i = 5; i >= 0; i--) {
      const mes = new Date(Date.UTC(fechaActual.getUTCFullYear(), fechaActual.getUTCMonth() - i, 1));
      const mesSiguiente = new Date(Date.UTC(fechaActual.getUTCFullYear(), fechaActual.getUTCMonth() - i + 1, 0));
      const nombreMes = meses[mes.getUTCMonth()];

      const fechaInicioMesStr = formatDateToSQL(mes);
      const fechaFinMesStr = formatDateToSQL(mesSiguiente);

      let params = [fechaInicioMesStr, fechaFinMesStr];
      let paramCount = 2;

      let whereClause = "WHERE fecha BETWEEN $1 AND $2";

      if (sucursalId && sucursalId !== "all") {
        paramCount++;
        whereClause += ` AND sucursal_id = $${paramCount}`;
        params.push(sucursalId);
      }

      const serviciosQuery = `
        SELECT COUNT(*) as count 
        FROM detalle_venta_servicios dvs
        JOIN ventas_servicios vs ON dvs.venta_servicio_id = vs.id
        ${whereClause}
      `;

      const productosQuery = `
        SELECT COALESCE(SUM(dvp.cantidad), 0) as count 
        FROM detalle_venta_productos dvp
        JOIN ventas_productos vp ON dvp.venta_producto_id = vp.id
        ${whereClause}
      `;

      const [serviciosResult, productosResult] = await Promise.all([
        query(serviciosQuery, params),
        query(productosQuery, params),
      ]);

      const servicios = parseInt(serviciosResult.rows[0]?.count) || 0;
      const productos = parseInt(productosResult.rows[0]?.count) || 0;

      tendencias.push({ mes: nombreMes, servicios, productos });
    }

    return tendencias;
  } catch (error) {
    console.error("Error obteniendo tendencias mensuales:", error);
    const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun"];
    return meses.map((mes) => ({ mes, servicios: 0, productos: 0 }));
  }
};

// ============================================
// INGRESOS POR SERVICIO (interna)
// ============================================
const obtenerIngresosServiciosData = async (fechaInicio, fechaFin, sucursalId) => {
  try {
    const fechaInicioStr = formatDateToSQL(fechaInicio);
    const fechaFinStr = formatDateToSQL(fechaFin);

    let whereClause = "WHERE ra.fecha BETWEEN $1 AND $2";
    whereClause += " AND ra.tipo_persona = 'cliente' AND ra.estado = 'exitoso'";

    let params = [fechaInicioStr, fechaFinStr];
    let paramCount = 2;

    if (sucursalId && sucursalId !== "all") {
      paramCount++;
      whereClause += ` AND ra.sucursal_id = $${paramCount}`;
      params.push(sucursalId);
    }

    const queryText = `
      SELECT 
        s.nombre,
        COUNT(ra.id) as cantidad_accesos,
        COALESCE(SUM(s.precio), 0) as total_ingresos
      FROM servicios s
      JOIN registros_acceso ra ON s.id = ra.servicio_id
      ${whereClause}
      GROUP BY s.id, s.nombre
      ORDER BY cantidad_accesos DESC
      LIMIT 6
    `;

    const result = await query(queryText, params);
    const colores = ["#8B5CF6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#6366F1"];

    return result.rows.map((row, index) => ({
      nombre: row.nombre,
      ingresos: parseInt(row.cantidad_accesos),
      cantidad: parseInt(row.cantidad_accesos),
      color: colores[index] || colores[0],
    }));
  } catch (error) {
    console.error("Error obteniendo ingresos por servicio:", error);
    throw error;
  }
};

// ============================================
// ENDPOINT PÚBLICO: INGRESOS SERVICIOS
// ============================================
const obtenerIngresosServicios = async (filtros) => {
  const { fechaInicio, fechaFin } = obtenerFechasFiltro(filtros);
  return obtenerIngresosServiciosData(fechaInicio, fechaFin, filtros.sucursalId);
};

// ============================================
// OBJETIVOS MENSUALES
// ============================================
const obtenerObjetivosMensuales = async (sucursalId = null, mes = null) => {
  try {
    let whereClause = "WHERE om.estado = 1";
    const params = [];
    let paramCount = 0;

    if (sucursalId && sucursalId !== "all") {
      paramCount++;
      whereClause += ` AND om.sucursal_id = $${paramCount}`;
      params.push(sucursalId);
    }

    if (mes) {
      paramCount++;
      whereClause += ` AND om.mes = $${paramCount}`;
      params.push(mes);
    }

    const result = await query(
      `
      SELECT 
        om.id,
        om.sucursal_id::text as "sucursalId",
        s.nombre as "sucursalNombre",
        om.mes,
        om.objetivo
      FROM objetivos_mensuales om
      INNER JOIN sucursales s ON om.sucursal_id = s.id
      ${whereClause}
      ORDER BY om.mes DESC, s.nombre
      `,
      params
    );

    return result.rows.map((row) => ({
      ...row,
      objetivo: parseFloat(row.objetivo),
    }));
  } catch (error) {
    console.error("Error obteniendo objetivos mensuales:", error);
    throw error;
  }
};

const guardarObjetivoMensual = async (sucursalId, mes, objetivo, usuarioId = null) => {
  try {
    const result = await query(
      `
      INSERT INTO objetivos_mensuales 
        (sucursal_id, mes, objetivo, usuario_creacion_id, estado)
      VALUES ($1, $2, $3, $4, 1)
      ON CONFLICT (sucursal_id, mes) 
      DO UPDATE SET 
        objetivo = EXCLUDED.objetivo,
        fecha_actualizacion = CURRENT_TIMESTAMP,
        usuario_creacion_id = EXCLUDED.usuario_creacion_id,
        estado = 1
      RETURNING 
        id,
        sucursal_id::text as "sucursalId",
        mes,
        objetivo
      `,
      [sucursalId, mes, objetivo, usuarioId]
    );

    const sucursalNombre = await query(
      "SELECT nombre FROM sucursales WHERE id = $1",
      [sucursalId]
    );

    return {
      ...result.rows[0],
      objetivo: parseFloat(result.rows[0].objetivo),
      sucursalNombre: sucursalNombre.rows[0]?.nombre || "",
    };
  } catch (error) {
    console.error("Error guardando objetivo mensual:", error);
    throw error;
  }
};

const eliminarObjetivoMensual = async (sucursalId, mes) => {
  try {
    const result = await query(
      `
      UPDATE objetivos_mensuales 
      SET estado = 2, fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE sucursal_id = $1 AND mes = $2 AND estado = 1
      RETURNING id
      `,
      [sucursalId, mes]
    );

    if (result.rows.length === 0) {
      throw new Error("Objetivo no encontrado");
    }

    return { success: true };
  } catch (error) {
    console.error("Error eliminando objetivo mensual:", error);
    throw error;
  }
};

// ============================================
// VENTAS REALES POR MES
// ============================================
const obtenerVentasRealesPorMes = async (sucursalId = null) => {
  try {
    let whereClause = "";
    const params = [];

    if (sucursalId && sucursalId !== "all") {
      whereClause = "WHERE sucursal_id = $1";
      params.push(sucursalId);
    }

    const result = await query(
      `
      SELECT 
        sucursal_id::text as "sucursalId",
        mes,
        total_ventas as total,
        ventas_servicios as servicios,
        ventas_productos as productos
      FROM ventas_mensuales_por_sucursal
      ${whereClause}
      ORDER BY mes DESC
      `,
      params
    );

    return result.rows.map((row) => ({
      sucursalId: row.sucursalId,
      mes: row.mes,
      total: parseFloat(row.total) || 0,
      servicios: parseFloat(row.servicios) || 0,
      productos: parseFloat(row.productos) || 0,
    }));
  } catch (error) {
    console.error("Error obteniendo ventas reales:", error);
    throw error;
  }
};

// ============================================
// RESUMEN POR SUCURSAL (garantiza TODAS las sucursales activas)
// ============================================
const obtenerResumenPorSucursal = async (filtros) => {
  try {
    const { fechaInicio, fechaFin } = obtenerFechasFiltro(filtros);
    const fechaInicioStr = formatDateToSQL(fechaInicio);
    const fechaFinStr = formatDateToSQL(fechaFin);

    const sucursalesResult = await query(`
      SELECT id::text as "sucursalId", nombre as "sucursalNombre"
      FROM sucursales
      WHERE estado = 1
      ORDER BY nombre
    `);

    let whereClause = "WHERE v.fecha BETWEEN $1 AND $2";
    const params = [fechaInicioStr, fechaFinStr];
    let paramCount = 2;

    if (filtros.sucursalId && filtros.sucursalId !== "all") {
      paramCount++;
      whereClause += ` AND v.sucursal_id = $${paramCount}`;
      params.push(filtros.sucursalId);
    }

    const ventasResult = await query(
      `
      SELECT 
        v.sucursal_id::text as "sucursalId",
        COALESCE(SUM(v.total), 0) as total,
        COALESCE(SUM(CASE WHEN v.tipo = 'servicio' THEN v.total ELSE 0 END), 0) as servicios,
        COALESCE(SUM(CASE WHEN v.tipo = 'producto' THEN v.total ELSE 0 END), 0) as productos
      FROM (
        SELECT sucursal_id, fecha, total, 'servicio' as tipo
        FROM ventas_servicios
        UNION ALL
        SELECT sucursal_id, fecha, total, 'producto' as tipo
        FROM ventas_productos
      ) v
      ${whereClause}
      GROUP BY v.sucursal_id
      `,
      params
    );

    const ventasMap = {};
    ventasResult.rows.forEach((row) => {
      ventasMap[row.sucursalId] = {
        total: parseFloat(row.total) || 0,
        servicios: parseFloat(row.servicios) || 0,
        productos: parseFloat(row.productos) || 0,
      };
    });

    return sucursalesResult.rows.map((suc) => ({
      sucursalId: suc.sucursalId,
      sucursalNombre: suc.sucursalNombre,
      total: ventasMap[suc.sucursalId]?.total || 0,
      servicios: ventasMap[suc.sucursalId]?.servicios || 0,
      productos: ventasMap[suc.sucursalId]?.productos || 0,
    }));
  } catch (error) {
    console.error("Error obteniendo resumen por sucursal:", error);
    throw error;
  }
};

// ============================================
// DESGLOSE DE PAGOS (garantiza TODAS las sucursales)
// ============================================
const obtenerDesglosePagos = async (filtros) => {
  try {
    const { fechaInicio, fechaFin } = obtenerFechasFiltro(filtros);
    const fechaInicioStr = formatDateToSQL(fechaInicio);
    const fechaFinStr = formatDateToSQL(fechaFin);

    const sucursalesResult = await query(`
      SELECT id::text as "sucursalId"
      FROM sucursales
      WHERE estado = 1
    `);

    let whereClause = "WHERE v.fecha BETWEEN $1 AND $2";
    const params = [fechaInicioStr, fechaFinStr];
    let paramCount = 2;

    if (filtros.sucursalId && filtros.sucursalId !== "all") {
      paramCount++;
      whereClause += ` AND v.sucursal_id = $${paramCount}`;
      params.push(filtros.sucursalId);
    }

    const result = await query(
      `
      SELECT 
        v.sucursal_id::text as "sucursalId",
        v.tipo,
        v.forma_pago,
        COALESCE(SUM(v.total), 0) as total
      FROM (
        SELECT sucursal_id, total, forma_pago, 'servicio' as tipo, fecha
        FROM ventas_servicios
        UNION ALL
        SELECT sucursal_id, total, forma_pago, 'producto' as tipo, fecha
        FROM ventas_productos
      ) v
      ${whereClause}
      GROUP BY v.sucursal_id, v.tipo, v.forma_pago
      `,
      params
    );

    const desglose = {};
    sucursalesResult.rows.forEach((suc) => {
      desglose[suc.sucursalId] = {
        serviciosEfectivo: 0,
        serviciosQr: 0,
        productosEfectivo: 0,
        productosQr: 0,
        totalEfectivo: 0,
        totalQr: 0,
      };
    });

    result.rows.forEach((row) => {
      if (!desglose[row.sucursalId]) return;

      const monto = parseFloat(row.total) || 0;
      const esEfectivo = row.forma_pago === "efectivo";
      const esQr = row.forma_pago === "qr";
      const esMixto = row.forma_pago === "mixto";

      const montoEfectivo = esEfectivo ? monto : esMixto ? monto / 2 : 0;
      const montoQr = esQr ? monto : esMixto ? monto / 2 : 0;

      if (row.tipo === "servicio") {
        desglose[row.sucursalId].serviciosEfectivo += montoEfectivo;
        desglose[row.sucursalId].serviciosQr += montoQr;
      } else {
        desglose[row.sucursalId].productosEfectivo += montoEfectivo;
        desglose[row.sucursalId].productosQr += montoQr;
      }

      desglose[row.sucursalId].totalEfectivo += montoEfectivo;
      desglose[row.sucursalId].totalQr += montoQr;
    });

    return desglose;
  } catch (error) {
    console.error("Error obteniendo desglose de pagos:", error);
    throw error;
  }
};

// ============================================
// DESGLOSE DE PRODUCTOS POR SUCURSAL
// ============================================
const obtenerDesgloseProductos = async (filtros) => {
  try {
    const { fechaInicio, fechaFin } = obtenerFechasFiltro(filtros);
    const fechaInicioStr = formatDateToSQL(fechaInicio);
    const fechaFinStr = formatDateToSQL(fechaFin);

    let whereClause = "WHERE vp.fecha BETWEEN $1 AND $2";
    const params = [fechaInicioStr, fechaFinStr];
    let paramCount = 2;

    if (filtros.sucursalId && filtros.sucursalId !== "all") {
      paramCount++;
      whereClause += ` AND vp.sucursal_id = $${paramCount}`;
      params.push(filtros.sucursalId);
    }

    const result = await query(
      `
      SELECT 
        vp.sucursal_id::text as "sucursalId",
        s.nombre as "sucursalNombre",
        p.id::text as "productoId",
        p.nombre as "productoNombre",
        vp.forma_pago as "formaPago",
        COALESCE(SUM(dvp.subtotal), 0) as monto,
        COUNT(dvp.id) as ventas
      FROM ventas_productos vp
      INNER JOIN sucursales s ON vp.sucursal_id = s.id
      INNER JOIN detalle_venta_productos dvp ON vp.id = dvp.venta_producto_id
      INNER JOIN productos p ON dvp.producto_id = p.id
      ${whereClause}
      GROUP BY vp.sucursal_id, s.nombre, p.id, p.nombre, vp.forma_pago
      ORDER BY s.nombre, p.nombre
      `,
      params
    );

    const agrupado = {};

    result.rows.forEach((row) => {
      const key = `${row.sucursalId}-${row.productoId}`;

      if (!agrupado[key]) {
        agrupado[key] = {
          sucursalId: row.sucursalId,
          sucursalNombre: row.sucursalNombre,
          productoId: row.productoId,
          productoNombre: row.productoNombre,
          efectivoMonto: 0,
          qrMonto: 0,
          efectivoVentas: 0,
          qrVentas: 0,
          totalMonto: 0,
          totalVentas: 0,
        };
      }

      const item = agrupado[key];
      const monto = parseFloat(row.monto) || 0;
      const ventas = parseInt(row.ventas) || 0;

      if (row.formaPago === "efectivo") {
        item.efectivoMonto += monto;
        item.efectivoVentas += ventas;
      } else if (row.formaPago === "qr") {
        item.qrMonto += monto;
        item.qrVentas += ventas;
      } else if (row.formaPago === "mixto") {
        item.efectivoMonto += monto / 2;
        item.qrMonto += monto / 2;
        item.efectivoVentas += Math.ceil(ventas / 2);
        item.qrVentas += Math.floor(ventas / 2);
      }

      item.totalMonto += monto;
      item.totalVentas += ventas;
    });

    return Object.values(agrupado);
  } catch (error) {
    console.error("Error obteniendo desglose productos:", error);
    throw error;
  }
};

// ============================================
// DESGLOSE DE SERVICIOS POR SUCURSAL
// ============================================
const obtenerDesgloseServicios = async (filtros) => {
  try {
    const { fechaInicio, fechaFin } = obtenerFechasFiltro(filtros);
    const fechaInicioStr = formatDateToSQL(fechaInicio);
    const fechaFinStr = formatDateToSQL(fechaFin);

    let whereClause = "WHERE vs.fecha BETWEEN $1 AND $2";
    const params = [fechaInicioStr, fechaFinStr];
    let paramCount = 2;

    if (filtros.sucursalId && filtros.sucursalId !== "all") {
      paramCount++;
      whereClause += ` AND vs.sucursal_id = $${paramCount}`;
      params.push(filtros.sucursalId);
    }

    const result = await query(
      `
      SELECT 
        vs.sucursal_id::text as "sucursalId",
        s.nombre as "sucursalNombre",
        srv.id::text as "servicioId",
        srv.nombre as "servicioNombre",
        vs.forma_pago as "formaPago",
        COALESCE(SUM(dvs.precio), 0) as monto,
        COUNT(dvs.id) as ventas
      FROM ventas_servicios vs
      INNER JOIN sucursales s ON vs.sucursal_id = s.id
      INNER JOIN detalle_venta_servicios dvs ON vs.id = dvs.venta_servicio_id
      INNER JOIN inscripciones i ON dvs.inscripcion_id = i.id
      INNER JOIN servicios srv ON i.servicio_id = srv.id
      ${whereClause}
      GROUP BY vs.sucursal_id, s.nombre, srv.id, srv.nombre, vs.forma_pago
      ORDER BY s.nombre, srv.nombre
      `,
      params
    );

    const agrupado = {};

    result.rows.forEach((row) => {
      const key = `${row.sucursalId}-${row.servicioId}`;

      if (!agrupado[key]) {
        agrupado[key] = {
          sucursalId: row.sucursalId,
          sucursalNombre: row.sucursalNombre,
          servicioId: row.servicioId,
          servicioNombre: row.servicioNombre,
          efectivoMonto: 0,
          qrMonto: 0,
          efectivoVentas: 0,
          qrVentas: 0,
          totalMonto: 0,
          totalVentas: 0,
        };
      }

      const item = agrupado[key];
      const monto = parseFloat(row.monto) || 0;
      const ventas = parseInt(row.ventas) || 0;

      if (row.formaPago === "efectivo") {
        item.efectivoMonto += monto;
        item.efectivoVentas += ventas;
      } else if (row.formaPago === "qr") {
        item.qrMonto += monto;
        item.qrVentas += ventas;
      } else if (row.formaPago === "mixto") {
        item.efectivoMonto += monto / 2;
        item.qrMonto += monto / 2;
        item.efectivoVentas += Math.ceil(ventas / 2);
        item.qrVentas += Math.floor(ventas / 2);
      }

      item.totalMonto += monto;
      item.totalVentas += ventas;
    });

    return Object.values(agrupado);
  } catch (error) {
    console.error("Error obteniendo desglose servicios:", error);
    throw error;
  }
};

// ============================================
// MOVIMIENTOS DE STOCK
// ============================================
const obtenerMovimientosStock = async (fechaInicio, fechaFin, sucursalId = null) => {
  try {
    const fechaInicioStr = formatDateToSQL(new Date(fechaInicio + "T00:00:00Z"));
    const fechaFinStr = formatDateToSQL(new Date(fechaFin + "T23:59:59Z"));

    let whereClause = "WHERE ms.fecha BETWEEN $1 AND $2";
    const params = [fechaInicioStr, fechaFinStr];
    let paramCount = 2;

    if (sucursalId && sucursalId !== "all") {
      paramCount++;
      whereClause += ` AND ms.sucursal_id = $${paramCount}`;
      params.push(sucursalId);
    }

    const sql = `
      SELECT 
        ms.id::text as id,
        ms.fecha,
        COALESCE(CONCAT(p.nombres, ' ', p.apellidos), 'Sistema') as "recepcionista",
        pr.id::text as "productoId",
        pr.nombre as "productoNombre",
        ms.cantidad_modificada as "cantidadAnadida",
        ms.cantidad_anterior as "stockAntes",
        ms.cantidad_nueva as "stockDespues",
        ms.sucursal_id::text as "sucursalId",
        s.nombre as "sucursalNombre"
      FROM movimientos_stock ms
      INNER JOIN productos pr ON ms.producto_id = pr.id
      INNER JOIN sucursales s ON ms.sucursal_id = s.id
      LEFT JOIN usuarios u ON ms.usuario_id = u.id
      LEFT JOIN empleados e ON u.empleado_id = e.id
      LEFT JOIN personas p ON e.persona_id = p.id
      ${whereClause}
      ORDER BY ms.fecha DESC
      LIMIT 200
    `;

    const result = await query(sql, params);

    return result.rows.map((row) => ({
      id: row.id,
      fecha: row.fecha,
      recepcionista: row.recepcionista,
      productoId: row.productoId,
      productoNombre: row.productoNombre,
      cantidadAnadida: parseInt(row.cantidadAnadida) || 0,
      stockAntes: parseInt(row.stockAntes) || 0,
      stockDespues: parseInt(row.stockDespues) || 0,
      sucursalId: row.sucursalId,
      sucursalNombre: row.sucursalNombre,
    }));
  } catch (error) {
    console.error("❌ Error obteniendo movimientos de stock:", error);
    throw error;
  }
};

// ============================================
// INSCRIPCIONES AGRUPADAS
// ============================================
const obtenerInscripcionesAgrupadas = async (fechaInicio, fechaFin, servicioId = null, sucursalId = null) => {
  try {
    let whereClause = "WHERE i.fecha_inicio BETWEEN $1 AND $2";
    whereClause += " AND i.estado = 1";

    const params = [fechaInicio, fechaFin];
    let paramCount = 2;

    if (servicioId && servicioId !== "all") {
      paramCount++;
      whereClause += ` AND i.servicio_id = $${paramCount}`;
      params.push(servicioId);
    }

    if (sucursalId && sucursalId !== "all") {
      paramCount++;
      whereClause += ` AND i.sucursal_id = $${paramCount}`;
      params.push(sucursalId);
    }

    const result = await query(
      `
      SELECT 
        srv.nombre as "servicioNombre",
        suc.nombre as "sucursalNombre",
        COUNT(i.id) as cantidad
      FROM inscripciones i
      INNER JOIN servicios srv ON i.servicio_id = srv.id
      INNER JOIN sucursales suc ON i.sucursal_id = suc.id
      ${whereClause}
      GROUP BY srv.nombre, suc.nombre
      ORDER BY srv.nombre, suc.nombre
      `,
      params
    );

    return result.rows.map((row) => ({
      servicioNombre: row.servicioNombre,
      sucursalNombre: row.sucursalNombre,
      cantidad: parseInt(row.cantidad) || 0,
    }));
  } catch (error) {
    console.error("Error obteniendo inscripciones agrupadas:", error);
    throw error;
  }
};

// ============================================
// PRODUCTOS DISPONIBLES
// ============================================
const obtenerProductosDisponibles = async () => {
  try {
    const result = await query(`
      SELECT 
        p.id::text as id,
        p.nombre
      FROM productos p
      WHERE p.estado = 1
      ORDER BY p.nombre
    `);
    return result.rows;
  } catch (error) {
    console.error("Error obteniendo productos:", error);
    throw error;
  }
};

// ============================================
// SERVICIOS DISPONIBLES
// ============================================
const obtenerServiciosDisponibles = async () => {
  try {
    const result = await query(`
      SELECT 
        s.id::text as id,
        s.nombre
      FROM servicios s
      WHERE s.estado = 1
      ORDER BY s.nombre
    `);
    return result.rows;
  } catch (error) {
    console.error("Error obteniendo servicios:", error);
    throw error;
  }
};
// ============================================
// REPORTE DE EMPLEADOS
// ============================================

// ============================================
// EMPLEADOS: Lista
// ============================================
const obtenerEmpleadosReporte = async (sucursalId = null) => {
  try {
    let whereClause = "WHERE e.estado IN (0, 1)";
    const params = [];
    let paramCount = 0;

    if (sucursalId && sucursalId !== "all") {
      paramCount++;
      whereClause += ` AND e.sucursal_id = $${paramCount}`;
      params.push(sucursalId);
    }

    const result = await query(
      `
      SELECT 
        e.id::text as id,
        e.persona_id::text as "personaId",
        CONCAT(p.nombres, ' ', p.apellidos) as nombre,
        e.rol,
        e.sucursal_id::text as "sucursalId",
        s.nombre as "sucursalNombre",
        COALESCE(e.sueldo, 0) as "sueldoBase",
        COALESCE(e.comision, 0) as comision,
        e.estado,
        (p.huella_digital IS NOT NULL) as "tieneHuella"
      FROM empleados e
      INNER JOIN personas p ON e.persona_id = p.id
      LEFT JOIN sucursales s ON e.sucursal_id = s.id
      ${whereClause}
      ORDER BY p.nombres, p.apellidos
      `,
      params
    );

    return result.rows.map((row) => ({
      id: row.id,
      personaId: row.personaId,
      nombre: row.nombre,
      rol: row.rol,
      sucursales: row.sucursalId ? [row.sucursalId] : [],
      sucursalNombres: row.sucursalNombre ? [row.sucursalNombre] : [],
      sueldoBase: parseFloat(row.sueldoBase) || 0,
      comision: parseFloat(row.comision) || 0,
      tipo: row.rol === "zumba" ? "zumba" : "normal",
      tieneHuella: row.tieneHuella,
      activo: row.estado === 1,
    }));
  } catch (error) {
    console.error("Error obteniendo empleados reporte:", error);
    throw error;
  }
};

// ============================================
// ATRASOS: Detalle individual por registro
// SOLO trae:
//   - Entradas con "tarde"
//   - Salidas con "antes"
//   - Salidas "Sin Marcar"
// (Excluye "A tiempo" y horas normales)
// ============================================
const obtenerAtrasosEmpleados = async (mes, sucursalId = null) => {
  try {
    const [year, month] = mes.split("-").map(Number);
    const fechaInicio = `${year}-${String(month).padStart(2, "0")}-01 00:00:00`;
    const ultimoDia = new Date(year, month, 0).getDate();
    const fechaFin = `${year}-${String(month).padStart(2, "0")}-${String(
      ultimoDia
    ).padStart(2, "0")} 23:59:59`;

    // 🔧 FIX: solo traer registros que sean ATRASOS reales o "Sin Marcar".
    // Excluye "A tiempo", entradas/salidas a hora correcta, etc.
    let whereClause = `
      WHERE ra.fecha BETWEEN $1 AND $2
      AND ra.tipo_persona = 'empleado'
      AND ra.estado = 'exitoso'
      AND (
        ra.detalle LIKE '%tarde%'
        OR ra.detalle LIKE '%antes%'
        OR ra.detalle LIKE '%Sin Marcar%'
      )
    `;
    const params = [fechaInicio, fechaFin];
    let paramCount = 2;

    if (sucursalId && sucursalId !== "all") {
      paramCount++;
      whereClause += ` AND ra.sucursal_id = $${paramCount}`;
      params.push(sucursalId);
    }

    const result = await query(
      `
      SELECT 
        e.id::text as "empleadoId",
        CONCAT(p.nombres, ' ', p.apellidos) as "empleadoNombre",
        COALESCE(s.nombre, 'Sin sucursal') as "sucursalNombre",
        ra.fecha,
        ra.detalle,
        CAST(
          COALESCE(
            NULLIF(regexp_replace(ra.detalle, '\\D', '', 'g'), ''),
            '0'
          ) AS INTEGER
        ) as minutos
      FROM registros_acceso ra
      INNER JOIN personas p ON ra.persona_id = p.id
      INNER JOIN empleados e ON p.id = e.persona_id
      LEFT JOIN sucursales s ON e.sucursal_id = s.id
      ${whereClause}
      ORDER BY ra.fecha DESC
      `,
      params
    );

    const agrupado = {};

    result.rows.forEach((row) => {
      const key = row.empleadoId;

      if (!agrupado[key]) {
        agrupado[key] = {
          empleadoId: row.empleadoId,
          empleadoNombre: row.empleadoNombre,
          sucursalNombre: row.sucursalNombre,
          totalMinutos: 0,
          totalDias: 0,
          detalles: [],
        };
      }

      const detalle = row.detalle || "";

      // Clasificar el tipo
      let tipo = "Entrada";
      if (detalle.startsWith("Salida")) {
        tipo = detalle.includes("Sin Marcar") ? "Sin Marcar" : "Salida";
      } else if (detalle.startsWith("Entrada")) {
        tipo = "Entrada";
      }

      const esSinMarcar = detalle.includes("Sin Marcar");
      const minutos = esSinMarcar ? 0 : parseInt(row.minutos) || 0;

      const item = agrupado[key];

      if (!esSinMarcar) {
        item.totalMinutos += minutos;
        item.totalDias += 1;
      }

      item.detalles.push({
        fecha: row.fecha,
        minutos,
        tipo,
        detalle,
      });
    });

    return Object.values(agrupado);
  } catch (error) {
    console.error("Error obteniendo atrasos empleados:", error);
    throw error;
  }
};

// ============================================
// ZUMBA: Totales agrupados por instructor
// ============================================
const obtenerReportesZumbaAgrupados = async (mes, instructorId = null) => {
  try {
    const [year, month] = mes.split("-").map(Number);
    const primerDia = `${year}-${String(month).padStart(2, "0")}-01`;
    const ultimoDiaNum = new Date(year, month, 0).getDate();
    const ultimoDia = `${year}-${String(month).padStart(2, "0")}-${String(
      ultimoDiaNum
    ).padStart(2, "0")}`;

    let whereClause = "WHERE rz.fecha BETWEEN $1 AND $2";
    const params = [primerDia, ultimoDia];
    let paramCount = 2;

    if (instructorId) {
      paramCount++;
      whereClause += ` AND rz.instructor_id = $${paramCount}`;
      params.push(instructorId);
    }

    const result = await query(
      `
      SELECT 
        rz.instructor_id::text as "instructorId",
        CONCAT(p.nombres, ' ', p.apellidos) as "instructorNombre",
        COUNT(*) as "totalDias",
        COALESCE(SUM(rz.numero_personas), 0) as "totalPersonas"
      FROM reportes_zumba rz
      INNER JOIN empleados e ON rz.instructor_id = e.id
      INNER JOIN personas p ON e.persona_id = p.id
      ${whereClause}
      GROUP BY rz.instructor_id, p.nombres, p.apellidos
      `,
      params
    );

    return result.rows.map((row) => ({
      instructorId: row.instructorId,
      instructorNombre: row.instructorNombre,
      totalDias: parseInt(row.totalDias) || 0,
      totalPersonas: parseInt(row.totalPersonas) || 0,
    }));
  } catch (error) {
    console.error("Error obteniendo reportes zumba agrupados:", error);
    throw error;
  }
};

// ============================================
// ZUMBA: Lista detallada de reportes
// ============================================
const obtenerReportesZumba = async (mes, instructorId = null) => {
  try {
    const [year, month] = mes.split("-").map(Number);
    const primerDia = `${year}-${String(month).padStart(2, "0")}-01`;
    const ultimoDiaNum = new Date(year, month, 0).getDate();
    const ultimoDia = `${year}-${String(month).padStart(2, "0")}-${String(
      ultimoDiaNum
    ).padStart(2, "0")}`;

    let whereClause = "WHERE rz.fecha BETWEEN $1 AND $2";
    const params = [primerDia, ultimoDia];
    let paramCount = 2;

    if (instructorId) {
      paramCount++;
      whereClause += ` AND rz.instructor_id = $${paramCount}`;
      params.push(instructorId);
    }

    const result = await query(
      `
      SELECT 
        rz.id::text as id,
        rz.fecha,
        rz.instructor_id::text as "instructorId",
        CONCAT(p.nombres, ' ', p.apellidos) as "instructorNombre",
        rz.numero_personas as "numeroPersonas"
      FROM reportes_zumba rz
      INNER JOIN empleados e ON rz.instructor_id = e.id
      INNER JOIN personas p ON e.persona_id = p.id
      ${whereClause}
      ORDER BY rz.fecha DESC
      `,
      params
    );

    return result.rows.map((row) => ({
      id: row.id,
      fecha: row.fecha,
      instructorId: row.instructorId,
      instructorNombre: row.instructorNombre,
      numeroPersonas: parseInt(row.numeroPersonas) || 0,
    }));
  } catch (error) {
    console.error("Error obteniendo reportes zumba:", error);
    throw error;
  }
};

// ============================================
// PAGOS INFORMATIVOS: Calculados al vuelo
// ============================================
const obtenerPagosInformativos = async (mes, sucursalId = null) => {
  try {
    let whereClause = "WHERE e.estado IN (0, 1)";
    const params = [];
    let paramCount = 0;

    if (sucursalId && sucursalId !== "all") {
      paramCount++;
      whereClause += ` AND e.sucursal_id = $${paramCount}`;
      params.push(sucursalId);
    }

    const empleadosResult = await query(
      `
      SELECT 
        e.id::text as id,
        CONCAT(p.nombres, ' ', p.apellidos) as nombre,
        e.rol,
        COALESCE(e.sueldo, 0) as sueldo_base,
        COALESCE(e.comision, 0) as comision
      FROM empleados e
      INNER JOIN personas p ON e.persona_id = p.id
      ${whereClause}
      ORDER BY p.nombres
      `,
      params
    );

    const zumbaTotales = await obtenerReportesZumbaAgrupados(mes);
    const zumbaMap = {};
    zumbaTotales.forEach((z) => {
      zumbaMap[z.instructorId] = z;
    });

    return empleadosResult.rows.map((emp) => {
      const esZumba = emp.rol === "zumba";

      if (esZumba) {
        const zumbaData = zumbaMap[emp.id] || {
          totalDias: 0,
          totalPersonas: 0,
        };
        const totalPersonas = zumbaData.totalPersonas;
        const diasRegistrados = zumbaData.totalDias;

        const valorComision = parseFloat(emp.comision) || 50;
        const promedioPersonas =
          diasRegistrados > 0 ? totalPersonas / diasRegistrados : 0;
        const comision = promedioPersonas * valorComision;

        return {
          empleadoId: emp.id,
          empleadoNombre: emp.nombre,
          tipo: "zumba",
          sueldoBase: 0,
          comision,
          sueldoNeto: comision,
          totalPersonas,
          diasRegistrados,
          valorComision,
        };
      } else {
        const sueldoBase = parseFloat(emp.sueldo_base) || 0;

        return {
          empleadoId: emp.id,
          empleadoNombre: emp.nombre,
          tipo: "normal",
          sueldoBase,
          comision: 0,
          sueldoNeto: sueldoBase,
        };
      }
    });
  } catch (error) {
    console.error("Error obteniendo pagos informativos:", error);
    throw error;
  }
};

// ============================================
// EMPLEADOS: Actualizar sueldo/comisión
// ============================================
const actualizarSueldoEmpleado = async (empleadoId, sueldoBase, comision) => {
  try {
    if (sueldoBase !== undefined && sueldoBase !== null) {
      await query(
        `UPDATE empleados SET sueldo = $1 WHERE id = $2`,
        [sueldoBase, empleadoId]
      );
    }

    if (comision !== undefined && comision !== null) {
      await query(
        `UPDATE empleados SET comision = $1 WHERE id = $2`,
        [comision, empleadoId]
      );
    }

    return { success: true };
  } catch (error) {
    console.error("Error actualizando sueldo empleado:", error);
    throw error;
  }
};

// ============================================
// MOVIMIENTOS DE FECHAS DE INSCRIPCIÓN
// ============================================
const obtenerMovimientosFechasInscripcion = async (
  fechaInicio,
  fechaFin,
  servicioId = null,
  sucursalId = null
) => {
  try {
    const fechaInicioStr = formatDateToSQL(new Date(fechaInicio + "T00:00:00Z"));
    const fechaFinStr = formatDateToSQL(new Date(fechaFin + "T23:59:59Z"));

    let whereClause = "WHERE mf.fecha BETWEEN $1 AND $2";
    const params = [fechaInicioStr, fechaFinStr];
    let paramCount = 2;

    if (servicioId && servicioId !== "all") {
      paramCount++;
      whereClause += ` AND mf.servicio_id = $${paramCount}`;
      params.push(servicioId);
    }

    if (sucursalId && sucursalId !== "all") {
      paramCount++;
      whereClause += ` AND mf.sucursal_id = $${paramCount}`;
      params.push(sucursalId);
    }

    const sql = `
      SELECT 
        mf.id::text as id,
        mf.fecha,
        mf.usuario_id::text as "usuarioId",
        COALESCE(CONCAT(pu.nombres, ' ', pu.apellidos), 'Sistema') as "usuarioNombre",
        mf.persona_id::text as "personaId",
        COALESCE(CONCAT(pp.nombres, ' ', pp.apellidos), '—') as "personaNombre",
        mf.servicio_id::text as "servicioId",
        COALESCE(s.nombre, '—') as "servicioNombre",
        mf.sucursal_id::text as "sucursalId",
        COALESCE(su.nombre, '—') as "sucursalNombre",
        TO_CHAR(mf.fecha_inicio_anterior, 'YYYY-MM-DD') as "fechaInicioAnterior",
        TO_CHAR(mf.fecha_inicio_nueva, 'YYYY-MM-DD') as "fechaInicioNueva",
        TO_CHAR(mf.fecha_vencimiento_anterior, 'YYYY-MM-DD') as "fechaVencimientoAnterior",
        TO_CHAR(mf.fecha_vencimiento_nueva, 'YYYY-MM-DD') as "fechaVencimientoNueva",
        COALESCE(mf.descripcion, '') as descripcion
      FROM movimientos_fechas_inscripcion mf
      LEFT JOIN usuarios u ON mf.usuario_id = u.id
      LEFT JOIN empleados e ON u.empleado_id = e.id
      LEFT JOIN personas pu ON e.persona_id = pu.id
      LEFT JOIN personas pp ON mf.persona_id = pp.id
      LEFT JOIN servicios s ON mf.servicio_id = s.id
      LEFT JOIN sucursales su ON mf.sucursal_id = su.id
      ${whereClause}
      ORDER BY mf.fecha DESC
      LIMIT 200
    `;

    const result = await query(sql, params);

    return result.rows.map((row) => ({
      id: row.id,
      fecha: row.fecha,
      usuarioId: row.usuarioId,
      usuarioNombre: row.usuarioNombre,
      personaId: row.personaId,
      personaNombre: row.personaNombre,
      servicioId: row.servicioId,
      servicioNombre: row.servicioNombre,
      sucursalId: row.sucursalId,
      sucursalNombre: row.sucursalNombre,
      fechaInicioAnterior: row.fechaInicioAnterior,
      fechaInicioNueva: row.fechaInicioNueva,
      fechaVencimientoAnterior: row.fechaVencimientoAnterior,
      fechaVencimientoNueva: row.fechaVencimientoNueva,
      descripcion: row.descripcion,
    }));
  } catch (error) {
    console.error("❌ Error obteniendo movimientos de fechas inscripción:", error);
    throw error;
  }
};

// ============================================
// EXPORTS
// ============================================
module.exports = {
  obtenerReportes,
  obtenerSucursales,
  obtenerIngresosServicios,
  obtenerObjetivosMensuales,
  guardarObjetivoMensual,
  eliminarObjetivoMensual,
  obtenerVentasRealesPorMes,
  obtenerResumenPorSucursal,
  obtenerDesglosePagos,
  obtenerDesgloseProductos,
  obtenerDesgloseServicios,
  obtenerMovimientosStock,
  obtenerMovimientosFechasInscripcion,
  obtenerInscripcionesAgrupadas,
  obtenerProductosDisponibles,
  obtenerServiciosDisponibles,
  obtenerEmpleadosReporte,
  obtenerAtrasosEmpleados,
  obtenerPagosInformativos,
  actualizarSueldoEmpleado,
  obtenerReportesZumba,
};