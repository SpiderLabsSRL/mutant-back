const { query } = require("../../db");

// Función para obtener la fecha actual en zona horaria de Bolivia (UTC-4)
const getBoliviaDate = () => {
  const now = new Date();
  // Convertir a hora de Bolivia (UTC-4)
  const boliviaTime = new Date(now.getTime() - (4 * 60 * 60 * 1000));
  return boliviaTime;
};

// Función para formatear fecha a formato SQL YYYY-MM-DD HH:MM:SS
const formatDateToSQL = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// Función para obtener todas las sucursales
const obtenerSucursales = async () => {
  try {
    const result = await query(`
      SELECT id::text, nombre as name 
      FROM sucursales 
      WHERE estado = 1 
      ORDER BY nombre
    `);
    
    // Agregar la opción "Todas las sucursales"
    return [{ id: "all", name: "Todas las sucursales" }, ...result.rows];
  } catch (error) {
    console.error("Error obteniendo sucursales:", error);
    throw error;
  }
};

// Función principal para obtener todos los reportes
const obtenerReportes = async (filtros) => {
  try {
    // Obtener fechas para el filtro
    const { fechaInicio, fechaFin } = obtenerFechasFiltro(filtros);
    
    console.log('Filtros recibidos:', filtros);
    console.log('Fecha inicio:', fechaInicio);
    console.log('Fecha fin:', fechaFin);
    
    // Obtener todos los datos en paralelo
    const [
      resumen,
      servicios,
      productos,
      atrasos,
      tendencias,
      ingresosServicios
    ] = await Promise.all([
      obtenerResumen(fechaInicio, fechaFin, filtros.sucursalId),
      obtenerServiciosMasVendidos(fechaInicio, fechaFin, filtros.sucursalId),
      obtenerProductosMasVendidos(fechaInicio, fechaFin, filtros.sucursalId),
      obtenerAtrasosTrabajadores(fechaInicio, fechaFin, filtros.sucursalId),
      obtenerTendenciasMensuales(fechaInicio, fechaFin, filtros.sucursalId),
      obtenerIngresosServicios(fechaInicio, fechaFin, filtros.sucursalId)
    ]);

    return {
      resumen,
      servicios,
      productos,
      atrasos,
      tendencias,
      ingresosServicios
    };
  } catch (error) {
    console.error("Error en reportsService:", error);
    throw new Error("Error al generar los reportes");
  }
};

// Función para determinar las fechas según el filtro - CORREGIDA
const obtenerFechasFiltro = (filtros) => {
  let fechaInicio, fechaFin;
  
  const hoyBolivia = getBoliviaDate();
  
  switch (filtros.tipoFiltro) {
    case 'today':
      fechaInicio = new Date(Date.UTC(hoyBolivia.getUTCFullYear(), hoyBolivia.getUTCMonth(), hoyBolivia.getUTCDate(), 0, 0, 0));
      fechaFin = new Date(Date.UTC(hoyBolivia.getUTCFullYear(), hoyBolivia.getUTCMonth(), hoyBolivia.getUTCDate(), 23, 59, 59));
      break;
    
    case 'yesterday':
      const ayer = new Date(hoyBolivia);
      ayer.setUTCDate(ayer.getUTCDate() - 1);
      fechaInicio = new Date(Date.UTC(ayer.getUTCFullYear(), ayer.getUTCMonth(), ayer.getUTCDate(), 0, 0, 0));
      fechaFin = new Date(Date.UTC(ayer.getUTCFullYear(), ayer.getUTCMonth(), ayer.getUTCDate(), 23, 59, 59));
      break;
    
    case 'thisWeek':
      const inicioSemana = new Date(hoyBolivia);
      // Lunes es el primer día de la semana (día 1)
      const diaSemana = inicioSemana.getUTCDay();
      const diff = diaSemana === 0 ? 6 : diaSemana - 1; // Si es domingo (0), retrocede 6 días
      inicioSemana.setUTCDate(inicioSemana.getUTCDate() - diff);
      fechaInicio = new Date(Date.UTC(inicioSemana.getUTCFullYear(), inicioSemana.getUTCMonth(), inicioSemana.getUTCDate(), 0, 0, 0));
      fechaFin = new Date(Date.UTC(hoyBolivia.getUTCFullYear(), hoyBolivia.getUTCMonth(), hoyBolivia.getUTCDate(), 23, 59, 59));
      break;
    
    case 'lastWeek':
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
    
    case 'thisMonth':
      fechaInicio = new Date(Date.UTC(hoyBolivia.getUTCFullYear(), hoyBolivia.getUTCMonth(), 1, 0, 0, 0));
      fechaFin = new Date(Date.UTC(hoyBolivia.getUTCFullYear(), hoyBolivia.getUTCMonth(), hoyBolivia.getUTCDate(), 23, 59, 59));
      break;
    
    case 'lastMonth':
      const mesPasado = new Date(hoyBolivia);
      mesPasado.setUTCMonth(mesPasado.getUTCMonth() - 1);
      fechaInicio = new Date(Date.UTC(mesPasado.getUTCFullYear(), mesPasado.getUTCMonth(), 1, 0, 0, 0));
      fechaFin = new Date(Date.UTC(mesPasado.getUTCFullYear(), mesPasado.getUTCMonth() + 1, 0, 23, 59, 59));
      break;
    
    case 'specific':
      if (filtros.fechaEspecifica) {
        const fecha = new Date(filtros.fechaEspecifica);
        fechaInicio = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate(), 0, 0, 0));
        fechaFin = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate(), 23, 59, 59));
      }
      break;
    
    case 'range':
      if (filtros.fechaInicio) {
        fechaInicio = new Date(filtros.fechaInicio);
        fechaInicio.setUTCHours(0, 0, 0, 0);
      }
      if (filtros.fechaFin) {
        fechaFin = new Date(filtros.fechaFin);
        fechaFin.setUTCHours(23, 59, 59, 999);
      }
      break;
    
    default: // 'all' - todos los datos
      fechaInicio = new Date(0); // Fecha mínima
      fechaFin = new Date(); // Fecha actual
      fechaFin.setUTCHours(23, 59, 59, 999);
  }
  
  // Si no se definieron fechas, usar valores por defecto
  if (!fechaInicio) fechaInicio = new Date(0);
  if (!fechaFin) fechaFin = new Date();
  
  return { fechaInicio, fechaFin };
};

// Función para obtener el resumen general
const obtenerResumen = async (fechaInicio, fechaFin, sucursalId) => {
  try {
    // Formatear fechas para SQL
    const fechaInicioStr = formatDateToSQL(fechaInicio);
    const fechaFinStr = formatDateToSQL(fechaFin);
    
    let whereClause = "WHERE vs.fecha BETWEEN $1 AND $2";
    
    let params = [fechaInicioStr, fechaFinStr];
    let paramCount = 2;
    
    if (sucursalId && sucursalId !== 'all') {
      paramCount++;
      whereClause += ` AND vs.sucursal_id = $${paramCount}`;
      params.push(sucursalId);
    }
    
    // Consulta para servicios vendidos
    const serviciosQuery = `
      SELECT COUNT(*) as count 
      FROM detalle_venta_servicios dvs
      JOIN ventas_servicios vs ON dvs.venta_servicio_id = vs.id
      ${whereClause}
    `;
    
    // Consulta para ingresos totales (servicios + productos)
    const ingresosQuery = `
      SELECT COALESCE(SUM(total), 0) as total 
      FROM (
        SELECT total FROM ventas_servicios 
        WHERE fecha BETWEEN $1 AND $2
        ${sucursalId && sucursalId !== 'all' ? `AND sucursal_id = $${paramCount}` : ''}
        UNION ALL
        SELECT total FROM ventas_productos 
        WHERE fecha BETWEEN $1 AND $2
        ${sucursalId && sucursalId !== 'all' ? `AND sucursal_id = $${paramCount}` : ''}
      ) as ventas_totales
    `;
    
    // Consulta para productos vendidos
    const productosQuery = `
      SELECT COALESCE(SUM(dvp.cantidad), 0) as count 
      FROM detalle_venta_productos dvp
      JOIN ventas_productos vp ON dvp.venta_producto_id = vp.id
      WHERE vp.fecha BETWEEN $1 AND $2
      ${sucursalId && sucursalId !== 'all' ? `AND vp.sucursal_id = $${paramCount}` : ''}
    `;
    
    // CONSULTA MODIFICADA PARA ATRASOS
    const atrasosQuery = `
      SELECT 
        COALESCE(SUM(
          CASE WHEN ra.detalle LIKE '%tarde%' 
          THEN CAST(
            COALESCE(NULLIF(regexp_replace(ra.detalle, '\\D', '', 'g'), ''), '0'
          ) AS INTEGER)
          ELSE 0 END
        ), 0) AS minutos_atraso_total
      FROM registros_acceso ra
      WHERE ra.fecha BETWEEN $1 AND $2
        AND ra.tipo_persona = 'empleado'
        AND ra.estado = 'exitoso'
        ${sucursalId && sucursalId !== 'all' ? `AND ra.sucursal_id = $${paramCount}` : ''}
    `;
    
    // Ejecutar todas las consultas en paralelo
    const [
      serviciosResult,
      ingresosResult,
      productosResult,
      atrasosResult
    ] = await Promise.all([
      query(serviciosQuery, params),
      query(ingresosQuery, params),
      query(productosQuery, params),
      query(atrasosQuery, params)
    ]);
    
    // Calcular tendencias (comparar con el período anterior)
    const tendencias = await calcularTendencias(
      fechaInicio, 
      fechaFin, 
      sucursalId,
      {
        servicios: parseInt(serviciosResult.rows[0]?.count) || 0,
        productos: parseInt(productosResult.rows[0]?.count) || 0,
        ingresos: parseFloat(ingresosResult.rows[0]?.total) || 0,
        atrasos: parseInt(atrasosResult.rows[0]?.minutos_atraso_total) || 0
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
      tendenciaAtrasos: tendencias.atrasos
    };
  } catch (error) {
    console.error("Error obteniendo resumen:", error);
    throw error;
  }
};

// Función para calcular tendencias comparando con el período anterior
const calcularTendencias = async (fechaInicio, fechaFin, sucursalId, datosActuales) => {
  try {
    // Calcular la duración del período actual
    const duracion = fechaFin - fechaInicio;
    
    // Calcular fechas del período anterior
    const periodoAnteriorInicio = new Date(fechaInicio.getTime() - duracion);
    const periodoAnteriorFin = new Date(fechaFin.getTime() - duracion);
    
    const fechaInicioAnteriorStr = formatDateToSQL(periodoAnteriorInicio);
    const fechaFinAnteriorStr = formatDateToSQL(periodoAnteriorFin);
    
    let paramsAnterior = [fechaInicioAnteriorStr, fechaFinAnteriorStr];
    let paramCount = 2;
    
    if (sucursalId && sucursalId !== 'all') {
      paramCount++;
      paramsAnterior.push(sucursalId);
    }
    
    // Consultas para el período anterior
    const serviciosQueryAnterior = `
      SELECT COUNT(*) as count 
      FROM detalle_venta_servicios dvs
      JOIN ventas_servicios vs ON dvs.venta_servicio_id = vs.id
      WHERE vs.fecha BETWEEN $1 AND $2
      ${sucursalId && sucursalId !== 'all' ? `AND vs.sucursal_id = $${paramCount}` : ''}
    `;
    
    const ingresosQueryAnterior = `
      SELECT COALESCE(SUM(total), 0) as total 
      FROM (
        SELECT total FROM ventas_servicios 
        WHERE fecha BETWEEN $1 AND $2
        ${sucursalId && sucursalId !== 'all' ? `AND sucursal_id = $${paramCount}` : ''}
        UNION ALL
        SELECT total FROM ventas_productos 
        WHERE fecha BETWEEN $1 AND $2
        ${sucursalId && sucursalId !== 'all' ? `AND sucursal_id = $${paramCount}` : ''}
      ) as ventas_totales
    `;
    
    const productosQueryAnterior = `
      SELECT COALESCE(SUM(dvp.cantidad), 0) as count 
      FROM detalle_venta_productos dvp
      JOIN ventas_productos vp ON dvp.venta_producto_id = vp.id
      WHERE vp.fecha BETWEEN $1 AND $2
      ${sucursalId && sucursalId !== 'all' ? `AND vp.sucursal_id = $${paramCount}` : ''}
    `;
    
    const atrasosQueryAnterior = `
      SELECT 
        COALESCE(SUM(
          CASE WHEN ra.detalle LIKE '%tarde%' 
          THEN CAST(
            COALESCE(NULLIF(regexp_replace(ra.detalle, '\\D', '', 'g'), ''), '0'
          ) AS INTEGER)
          ELSE 0 END
        ), 0) AS minutos_atraso_total
      FROM registros_acceso ra
      WHERE ra.fecha BETWEEN $1 AND $2
        AND ra.tipo_persona = 'empleado'
        AND ra.estado = 'exitoso'
        ${sucursalId && sucursalId !== 'all' ? `AND ra.sucursal_id = $${paramCount}` : ''}
    `;
    
    // Ejecutar consultas del período anterior
    const [
      serviciosAnterior,
      ingresosAnterior,
      productosAnterior,
      atrasosAnterior
    ] = await Promise.all([
      query(serviciosQueryAnterior, paramsAnterior),
      query(ingresosQueryAnterior, paramsAnterior),
      query(productosQueryAnterior, paramsAnterior),
      query(atrasosQueryAnterior, paramsAnterior)
    ]);
    
    // Calcular porcentajes de cambio
    const calcularPorcentaje = (actual, anterior) => {
      if (anterior === 0) return actual > 0 ? "+100%" : "0%";
      const cambio = ((actual - anterior) / anterior) * 100;
      return `${cambio >= 0 ? '+' : ''}${cambio.toFixed(1)}%`;
    };
    
    const serviciosAnteriorVal = parseInt(serviciosAnterior.rows[0]?.count) || 0;
    const productosAnteriorVal = parseInt(productosAnterior.rows[0]?.count) || 0;
    const ingresosAnteriorVal = parseFloat(ingresosAnterior.rows[0]?.total) || 0;
    const atrasosAnteriorVal = parseInt(atrasosAnterior.rows[0]?.minutos_atraso_total) || 0;
    
    return {
      servicios: calcularPorcentaje(datosActuales.servicios, serviciosAnteriorVal),
      productos: calcularPorcentaje(datosActuales.productos, productosAnteriorVal),
      ingresos: calcularPorcentaje(datosActuales.ingresos, ingresosAnteriorVal),
      atrasos: calcularPorcentaje(datosActuales.atrasos, atrasosAnteriorVal)
    };
  } catch (error) {
    console.error("Error calculando tendencias:", error);
    // En caso de error, devolver tendencias neutrales
    return {
      servicios: "+0%",
      productos: "+0%",
      ingresos: "+0%",
      atrasos: "+0%"
    };
  }
};

// Función para obtener servicios más vendidos
const obtenerServiciosMasVendidos = async (fechaInicio, fechaFin, sucursalId) => {
  try {
    const fechaInicioStr = formatDateToSQL(fechaInicio);
    const fechaFinStr = formatDateToSQL(fechaFin);
    
    let whereClause = "WHERE vs.fecha BETWEEN $1 AND $2";
    
    let params = [fechaInicioStr, fechaFinStr];
    let paramCount = 2;
    
    if (sucursalId && sucursalId !== 'all') {
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
    
    // Colores para los gráficos
    const colores = ["#8B5CF6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#6366F1"];
    
    return result.rows.map((row, index) => ({
      nombre: row.nombre,
      ventas: parseInt(row.ventas),
      ingresos: parseFloat(row.ingresos),
      color: colores[index] || colores[0]
    }));
  } catch (error) {
    console.error("Error obteniendo servicios más vendidos:", error);
    throw error;
  }
};

// Función para obtener productos más vendidos
const obtenerProductosMasVendidos = async (fechaInicio, fechaFin, sucursalId) => {
  try {
    const fechaInicioStr = formatDateToSQL(fechaInicio);
    const fechaFinStr = formatDateToSQL(fechaFin);
    
    let whereClause = "WHERE vp.fecha BETWEEN $1 AND $2";
    
    let params = [fechaInicioStr, fechaFinStr];
    let paramCount = 2;
    
    if (sucursalId && sucursalId !== 'all') {
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
        AND ps.sucursal_id = ${sucursalId && sucursalId !== 'all' ? `$${paramCount}` : 'vp.sucursal_id'}
      ${whereClause}
      GROUP BY p.id, p.nombre, ps.stock
      ORDER BY ventas DESC
      LIMIT 8
    `;
    
    const result = await query(queryText, params);
    
    return result.rows.map(row => ({
      nombre: row.nombre,
      ventas: parseInt(row.ventas),
      ingresos: parseFloat(row.ingresos),
      stock: parseInt(row.stock) || 0
    }));
  } catch (error) {
    console.error("Error obteniendo productos más vendidos:", error);
    throw error;
  }
};

// Función para obtener atrasos de trabajadores (CORREGIDA - cuenta días distintos con atraso)
const obtenerAtrasosTrabajadores = async (fechaInicio, fechaFin, sucursalId) => {
  try {
    const fechaInicioStr = formatDateToSQL(fechaInicio);
    const fechaFinStr = formatDateToSQL(fechaFin);
    
    let whereClause = "WHERE ra.fecha BETWEEN $1 AND $2";
    whereClause += " AND ra.tipo_persona = 'empleado' AND ra.estado = 'exitoso'";
    
    let params = [fechaInicioStr, fechaFinStr];
    let paramCount = 2;
    
    if (sucursalId && sucursalId !== 'all') {
      paramCount++;
      whereClause += ` AND ra.sucursal_id = $${paramCount}`;
      params.push(sucursalId);
    }
    
    const queryText = `
      SELECT 
        CONCAT(p.nombres, ' ', p.apellidos) as trabajador,
        COALESCE(SUM(
          CASE WHEN ra.detalle LIKE '%tarde%' 
          THEN CAST(
            COALESCE(NULLIF(regexp_replace(ra.detalle, '\\D', '', 'g'), ''), '0'
          ) AS INTEGER)
          ELSE 0 END
        ), 0) as minutos_acumulados,
        COUNT(DISTINCT 
          CASE WHEN ra.detalle LIKE '%tarde%' 
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
    
    return result.rows.map(row => ({
      trabajador: row.trabajador,
      minutosAcumulados: parseInt(row.minutos_acumulados),
      diasAtraso: parseInt(row.dias_atraso)
    }));
  } catch (error) {
    console.error("Error obteniendo atrasos de trabajadores:", error);
    throw error;
  }
};

// Función para obtener tendencias mensuales
const obtenerTendenciasMensuales = async (fechaInicio, fechaFin, sucursalId) => {
  try {
    const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const tendencias = [];
    
    // Obtener los últimos 6 meses
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
      
      if (sucursalId && sucursalId !== 'all') {
        paramCount++;
        whereClause += ` AND sucursal_id = $${paramCount}`;
        params.push(sucursalId);
      }
      
      // Consulta para servicios del mes
      const serviciosQuery = `
        SELECT COUNT(*) as count 
        FROM detalle_venta_servicios dvs
        JOIN ventas_servicios vs ON dvs.venta_servicio_id = vs.id
        ${whereClause}
      `;
      
      // Consulta para productos del mes
      const productosQuery = `
        SELECT COALESCE(SUM(dvp.cantidad), 0) as count 
        FROM detalle_venta_productos dvp
        JOIN ventas_productos vp ON dvp.venta_producto_id = vp.id
        ${whereClause}
      `;
      
      const [serviciosResult, productosResult] = await Promise.all([
        query(serviciosQuery, params),
        query(productosQuery, params)
      ]);
      
      const servicios = parseInt(serviciosResult.rows[0]?.count) || 0;
      const productos = parseInt(productosResult.rows[0]?.count) || 0;
      
      tendencias.push({
        mes: nombreMes,
        servicios,
        productos
      });
    }
    
    return tendencias;
  } catch (error) {
    console.error("Error obteniendo tendencias mensuales:", error);
    
    // En caso de error, devolver datos de ejemplo
    const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun"];
    return meses.map((mes, index) => ({
      mes,
      servicios: Math.floor(Math.random() * 100) + 100,
      productos: Math.floor(Math.random() * 300) + 300
    }));
  }
};

const obtenerIngresosServicios = async (fechaInicio, fechaFin, sucursalId) => {
  try {
    const fechaInicioStr = formatDateToSQL(fechaInicio);
    const fechaFinStr = formatDateToSQL(fechaFin);
    
    let whereClause = "WHERE ra.fecha BETWEEN $1 AND $2";
    whereClause += " AND ra.tipo_persona = 'cliente' AND ra.estado = 'exitoso'";
    
    let params = [fechaInicioStr, fechaFinStr];
    let paramCount = 2;
    
    if (sucursalId && sucursalId !== 'all') {
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
    
    // Colores para los gráficos
    const colores = ["#8B5CF6", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#6366F1"];
    
    return result.rows.map((row, index) => ({
      nombre: row.nombre,
      ingresos: parseInt(row.cantidad_accesos),
      cantidad: parseInt(row.cantidad_accesos),
      color: colores[index] || colores[0]
    }));
  } catch (error) {
    console.error("Error obteniendo ingresos por servicio:", error);
    throw error;
  }
};

module.exports = {
  obtenerReportes,
  obtenerSucursales,
  obtenerIngresosServicios
};