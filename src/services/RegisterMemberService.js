const { query, pool } = require("../../db");

// ============================================
// CONVENCIÓN DE ESTADOS POR TABLA (verificado en BD)
// ============================================
const ESTADO = {
  personas: 0,
  servicios: 1,
  inscripciones: 1,
  cupones: 1,
  empleados: 1,
};

const DIAS_VENTANA_FUTURO = 7;
const DIAS_VENTANA_PASADO = 7;

// ============================================
// HELPERS DE FECHA
// ============================================

/**
 * ✅ FIX ZONA HORARIA
 * Convierte cualquier fecha a "YYYY-MM-DD" respetando la zona horaria
 * de Bolivia (America/La_Paz) cuando la entrada es un timestamp.
 */
function toYMD(fecha) {
  if (!fecha) return null;

  if (typeof fecha === "string") {
    const tieneZona = /Z$|[+-]\d{2}:?\d{2}$/.test(fecha);
    const tieneHora = fecha.includes("T");

    if (tieneZona && tieneHora) {
      const d = new Date(fecha);
      const laPaz = new Date(
        d.toLocaleString("en-US", { timeZone: "America/La_Paz" })
      );
      const y = laPaz.getFullYear();
      const m = String(laPaz.getMonth() + 1).padStart(2, "0");
      const day = String(laPaz.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }

    return fecha.substring(0, 10);
  }

  const d = new Date(fecha);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hoyYMD() {
  const now = new Date();
  const laPaz = new Date(
    now.toLocaleString("en-US", { timeZone: "America/La_Paz" })
  );
  const y = laPaz.getFullYear();
  const m = String(laPaz.getMonth() + 1).padStart(2, "0");
  const d = String(laPaz.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function diffDiasYMD(aYMD, bYMD) {
  const a = new Date(`${aYMD}T00:00:00Z`);
  const b = new Date(`${bYMD}T00:00:00Z`);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function addDiasYMD(ymd, dias) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ============================================
// SERVICIOS POR SUCURSAL
// ============================================
exports.getServicesByBranch = async (sucursalId) => {
  const result = await query(
    `
    SELECT s.id, s.nombre, s.precio, s.numero_ingresos, s.estado, s.multisucursal,
           s.tipo_duracion, s.cantidad_duracion, s.cantidad_personas,
           ts.nombre AS tipo_servicio
    FROM servicios s
    INNER JOIN servicio_sucursal ss ON s.id = ss.servicio_id
    LEFT JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
    WHERE ss.sucursal_id = $1 AND s.estado = $2 AND ss.disponible = true
    ORDER BY s.nombre
  `,
    [sucursalId, ESTADO.servicios]
  );

  return result.rows;
};

// ============================================
// BUSCAR PERSONAS
// ============================================
exports.searchPeople = async (searchTerm) => {
  if (!searchTerm || searchTerm.trim() === "") {
    return [];
  }

  const normalizedSearch = searchTerm.trim().replace(/\s+/g, " ");

  const result = await query(
    `
    SELECT id, nombres, apellidos, ci, telefono, fecha_nacimiento
    FROM personas
    WHERE (
      unaccent(LOWER(REGEXP_REPLACE(TRIM(nombres), '\\s+', ' ', 'g'))) 
        ILIKE unaccent(LOWER($1))
      OR unaccent(LOWER(REGEXP_REPLACE(TRIM(apellidos), '\\s+', ' ', 'g'))) 
        ILIKE unaccent(LOWER($1))
      OR TRIM(ci) ILIKE $1
      OR unaccent(LOWER(
        REGEXP_REPLACE(
          TRIM(CONCAT(
            REGEXP_REPLACE(TRIM(nombres), '\\s+', ' ', 'g'),
            ' ',
            REGEXP_REPLACE(TRIM(apellidos), '\\s+', ' ', 'g')
          )),
          '\\s+', ' ', 'g'
        )
      )) ILIKE unaccent(LOWER($1))
      OR unaccent(LOWER(
        REGEXP_REPLACE(
          TRIM(CONCAT(
            REGEXP_REPLACE(TRIM(apellidos), '\\s+', ' ', 'g'),
            ' ',
            REGEXP_REPLACE(TRIM(nombres), '\\s+', ' ', 'g')
          )),
          '\\s+', ' ', 'g'
        )
      )) ILIKE unaccent(LOWER($1))
    )
    AND estado = $2
    ORDER BY apellidos, nombres
    LIMIT 10
  `,
    [`%${normalizedSearch}%`, ESTADO.personas]
  );

  return result.rows;
};

// ============================================
// SUSCRIPCIONES ACTIVAS Y FUTURAS
// ============================================
exports.getActiveSubscriptions = async (personaId, sucursalId) => {
  const result = await query(
    `
    SELECT i.id, i.servicio_id, i.sucursal_id, i.fecha_inicio, i.fecha_vencimiento, 
           i.ingresos_disponibles, i.estado, i.estado_inscripcion,
           s.multisucursal, ts.nombre AS tipo_servicio
    FROM inscripciones i
    INNER JOIN servicios s ON i.servicio_id = s.id
    LEFT JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
    WHERE i.persona_id = $1 
      AND i.estado = $2
      AND i.fecha_vencimiento >= CURRENT_DATE
      AND (i.sucursal_id = $3 OR s.multisucursal = true)
    ORDER BY i.fecha_inicio ASC
  `,
    [personaId, ESTADO.inscripciones, sucursalId]
  );

  return result.rows;
};

// ============================================
// ESTADO DE CAJA
// ============================================
exports.getCashRegisterStatus = async (cajaId) => {
  const result = await query(
    `
    SELECT 
      c.id as caja_id,
      c.nombre as nombre_caja,
      COALESCE(c.estado_caja, 'cerrada') as estado,
      COALESCE(c.total, 0) as monto_final,
      (SELECT monto FROM movimientos_caja 
       WHERE caja_id = c.id AND tipo = 'apertura'
       ORDER BY fecha DESC LIMIT 1) as monto_inicial,
      (SELECT usuario_id FROM movimientos_caja
       WHERE caja_id = c.id
       ORDER BY fecha DESC LIMIT 1) as usuario_id
    FROM cajas c
    WHERE c.id = $1
  `,
    [cajaId]
  );

  if (result.rows.length === 0) {
    return { estado: "cerrada", monto_final: 0 };
  }

  return result.rows[0];
};

// ============================================
// VALIDAR CUPÓN
// ============================================
exports.validateCoupon = async (codigo, sucursalId) => {
  if (!codigo || !codigo.trim()) {
    throw new Error("Código de cupón requerido");
  }

  const cuponResult = await query(
    `
    SELECT 
      c.id, c.codigo, c.tipo, c.valor_descuento, c.descripcion,
      c.fecha_inicio, c.fecha_fin, c.usos, c.usos_maximos,
      c.aplica_servicios, c.aplica_productos, c.estado
    FROM cupones c
    WHERE UPPER(c.codigo) = UPPER($1)
  `,
    [codigo.trim()]
  );

  if (cuponResult.rows.length === 0) {
    throw new Error("Cupón no encontrado");
  }

  const cupon = cuponResult.rows[0];

  if (Number(cupon.estado) !== ESTADO.cupones) {
    throw new Error("El cupón no está activo");
  }

  if (!cupon.aplica_servicios) {
    throw new Error("Este cupón solo aplica a productos, no a servicios");
  }

  const sucursalesResult = await query(
    `SELECT sucursal_id FROM cupon_sucursal WHERE cupon_id = $1`,
    [cupon.id]
  );
  const sucursalesIds = sucursalesResult.rows.map((r) => r.sucursal_id);

  if (sucursalesIds.length > 0 && !sucursalesIds.includes(sucursalId)) {
    throw new Error("El cupón no está disponible en esta sucursal");
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const inicio = new Date(cupon.fecha_inicio);
  inicio.setHours(0, 0, 0, 0);
  const fin = new Date(cupon.fecha_fin);
  fin.setHours(23, 59, 59, 999);

  if (hoy < inicio) throw new Error("El cupón aún no está vigente");
  if (hoy > fin) throw new Error("El cupón ha expirado");
  if (cupon.usos_maximos > 0 && cupon.usos >= cupon.usos_maximos) {
    throw new Error("El cupón ha alcanzado su límite de usos");
  }

  return {
    id: cupon.id,
    codigo: cupon.codigo,
    tipo: cupon.tipo,
    valor: parseFloat(cupon.valor_descuento),
    descripcion: cupon.descripcion || "",
    fechaInicio: cupon.fecha_inicio,
    fechaExpiracion: cupon.fecha_fin,
    usosMaximos: cupon.usos_maximos,
    usosActuales: cupon.usos,
  };
};

// ============================================
// LISTAR CUPONES DISPONIBLES
// ============================================
exports.getAvailableCoupons = async (sucursalId) => {
  const result = await query(
    `
    SELECT 
      c.id, c.codigo, c.tipo, c.valor_descuento, c.descripcion,
      c.fecha_inicio, c.fecha_fin, c.usos, c.usos_maximos
    FROM cupones c
    INNER JOIN cupon_sucursal cs ON c.id = cs.cupon_id
    WHERE cs.sucursal_id = $1
      AND c.estado = $2
      AND c.aplica_servicios = true
      AND CURRENT_DATE BETWEEN c.fecha_inicio AND c.fecha_fin
      AND (c.usos_maximos = 0 OR c.usos < c.usos_maximos)
    ORDER BY c.codigo
  `,
    [sucursalId, ESTADO.cupones]
  );

  return result.rows.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    tipo: c.tipo,
    valor: parseFloat(c.valor_descuento),
    descripcion: c.descripcion || "",
    fechaInicio: c.fecha_inicio,
    fechaExpiracion: c.fecha_fin,
    usosMaximos: c.usos_maximos,
    usosActuales: c.usos,
  }));
};

// ============================================
// HELPER: Analizar conflicto de inscripción por persona + tipo
// ============================================
async function analizarConflictoInscripcion(
  client,
  personaId,
  tipoServicio,
  sucursalId
) {
  const result = await client.query(
    `
    SELECT i.id, i.fecha_inicio, i.fecha_vencimiento, i.estado_inscripcion,
           i.servicio_id, i.sucursal_id, s.tipo_servicio_id, s.multisucursal,
           ts.nombre AS tipo_servicio
    FROM inscripciones i
    INNER JOIN servicios s ON i.servicio_id = s.id
    LEFT JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
    WHERE i.persona_id = $1
      AND i.estado = $2
      AND ts.nombre = $3
      AND i.fecha_vencimiento >= CURRENT_DATE
      AND (
        i.sucursal_id = $4
        OR s.multisucursal = TRUE
      )
    ORDER BY i.fecha_inicio ASC
  `,
    [personaId, ESTADO.inscripciones, tipoServicio, sucursalId]
  );

  const inscripciones = result.rows;

  if (inscripciones.length === 0) {
    return { status: "libre" };
  }

  const hoy = hoyYMD();

  const futura = inscripciones.find((i) => {
    const fi = toYMD(i.fecha_inicio);
    return i.estado_inscripcion === "inactivo" && fi > hoy;
  });

  if (futura) {
    return {
      status: "bloqueado_futuro",
      futura,
      tipo: tipoServicio,
    };
  }

  const activa = inscripciones.find((i) => {
    const fi = toYMD(i.fecha_inicio);
    const fv = toYMD(i.fecha_vencimiento);
    return i.estado_inscripcion === "activo" && fi <= hoy && fv >= hoy;
  });

  if (!activa) {
    return { status: "libre" };
  }

  const fv = toYMD(activa.fecha_vencimiento);
  const diffDias = diffDiasYMD(hoy, fv);

  if (diffDias <= DIAS_VENTANA_FUTURO) {
    return {
      status: "futuro_permitido",
      activa,
      tipo: tipoServicio,
      diffDias,
    };
  }

  return {
    status: "reemplazo",
    activa,
    tipo: tipoServicio,
    diffDias,
  };
}

exports.analizarConflictoInscripcion = analizarConflictoInscripcion;

// ============================================
// REGISTRAR MIEMBRO (MULTI-PERSONA)
// ============================================
exports.registerMember = async (registrationData) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ============================================
    // 1. Resolver personas
    // ============================================
    const personaIds = [];

    for (const p of registrationData.personas) {
      let personaId =
        p.personaId && Number(p.personaId) > 0 ? Number(p.personaId) : null;

      if (!personaId) {
        const existing = await client.query(
          `SELECT id FROM personas WHERE ci = $1 AND estado = $2`,
          [p.ci, ESTADO.personas]
        );

        if (existing.rows.length > 0) {
          personaId = existing.rows[0].id;
        } else {
          const fechaNac = p.fechaNacimiento
            ? toYMD(p.fechaNacimiento)
            : null;

          const ins = await client.query(
            `INSERT INTO personas (nombres, apellidos, ci, telefono, fecha_nacimiento, estado)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              p.nombres,
              p.apellidos,
              p.ci,
              p.telefono || null,
              fechaNac,
              ESTADO.personas,
            ]
          );
          personaId = ins.rows[0].id;
        }
      }

      personaIds.push(personaId);
    }

    // ============================================
    // 2. Validar servicios
    // ============================================
    const serviciosInfo = [];
    for (const servicio of registrationData.servicios) {
      const r = await client.query(
        `
        SELECT s.id, s.nombre, s.precio, s.numero_ingresos, s.multisucursal,
               s.tipo_duracion, s.cantidad_duracion, s.cantidad_personas,
               s.tipo_servicio_id, ts.nombre AS tipo_servicio,
               ss.sucursal_id, ss.disponible
        FROM servicios s
        INNER JOIN servicio_sucursal ss ON s.id = ss.servicio_id
        LEFT JOIN tipos_servicio ts ON s.tipo_servicio_id = ts.id
        WHERE s.id = $1 AND ss.sucursal_id = $2 AND ss.disponible = true
      `,
        [servicio.servicioId, registrationData.sucursalId]
      );

      if (r.rows.length === 0) {
        throw new Error(
          `Servicio no disponible en esta sucursal: ${servicio.servicioId}`
        );
      }

      serviciosInfo.push({
        ...servicio,
        ...r.rows[0],
      });
    }

    // ============================================
    // 3. Resolver personaIndexes → personaIds
    // ============================================
    const resolvePersonaIds = (servicio) => {
      if (!servicio.personaIndexes || servicio.personaIndexes.length === 0) {
        return [...personaIds];
      }
      return servicio.personaIndexes
        .map((idx) => personaIds[idx])
        .filter((id) => id !== undefined && id !== null);
    };

    // ============================================
    // 4. Validar reglas y resolver acciones
    // ============================================
    const acciones = [];

    for (const servicio of serviciosInfo) {
      const realPersonaIds = resolvePersonaIds(servicio);

      const sinPersona =
        servicio.sinPersona === true ||
        (Number(servicio.cantidad_personas) === 0 &&
          realPersonaIds.length === 0);

      if (realPersonaIds.length === 0) {
        if (sinPersona) {
          acciones.push({
            servicio,
            personaId: null,
            accion: "nueva",
            reemplazaId: null,
            fechaInicio: toYMD(servicio.fechaInicio),
            fechaVencimiento: toYMD(servicio.fechaVencimiento),
          });
          continue;
        }
        console.warn(
          `⚠️ Servicio ${servicio.servicioId} sin personas asignadas y no marcado como sinPersona. Se omite.`
        );
        continue;
      }

      const tipoServicio = servicio.tipo_servicio || "general";

      for (const personaId of realPersonaIds) {
        const conflicto = await analizarConflictoInscripcion(
          client,
          personaId,
          tipoServicio,
          registrationData.sucursalId
        );

        if (conflicto.status === "bloqueado_futuro") {
          throw new Error(
            `La persona con ID ${personaId} ya tiene una inscripción pendiente en el futuro para el tipo "${tipoServicio}"`
          );
        }

        if (conflicto.status === "reemplazo") {
          acciones.push({
            servicio,
            personaId,
            accion: "reemplazo",
            reemplazaId: conflicto.activa.id,
            fechaInicio: toYMD(servicio.fechaInicio),
            fechaVencimiento: toYMD(servicio.fechaVencimiento),
          });
          continue;
        }

        if (conflicto.status === "futuro_permitido") {
          const finActivaYMD = toYMD(conflicto.activa.fecha_vencimiento);
          const inicioYMD = addDiasYMD(finActivaYMD, 1);

          const duracionDias =
            servicio.tipo_duracion === "dias"
              ? Number(servicio.cantidad_duracion)
              : Number(servicio.cantidad_duracion) * 30;

          const finYMD = addDiasYMD(inicioYMD, duracionDias);

          acciones.push({
            servicio,
            personaId,
            accion: "futuro",
            reemplazaId: null,
            fechaInicio: inicioYMD,
            fechaVencimiento: finYMD,
          });
          continue;
        }

        acciones.push({
          servicio,
          personaId,
          accion: "nueva",
          reemplazaId: null,
          fechaInicio: toYMD(servicio.fechaInicio),
          fechaVencimiento: toYMD(servicio.fechaVencimiento),
        });
      }
    }

    // ============================================
    // 5. Validar cupón
    // ============================================
    let cuponId = null;
    if (registrationData.cupon_codigo) {
      const cuponResult = await client.query(
        `
        SELECT c.id, c.tipo, c.valor_descuento, c.usos, c.usos_maximos,
               c.fecha_inicio, c.fecha_fin, c.aplica_servicios, c.estado
        FROM cupones c
        WHERE UPPER(c.codigo) = UPPER($1)
      `,
        [registrationData.cupon_codigo.trim()]
      );

      if (cuponResult.rows.length === 0) {
        throw new Error("Cupón no encontrado");
      }

      const cupon = cuponResult.rows[0];

      if (Number(cupon.estado) !== ESTADO.cupones) {
        throw new Error("El cupón no está activo");
      }
      if (!cupon.aplica_servicios) {
        throw new Error("El cupón no aplica a servicios");
      }

      const sucursalesResult = await client.query(
        `SELECT sucursal_id FROM cupon_sucursal WHERE cupon_id = $1`,
        [cupon.id]
      );
      const sucursalesIds = sucursalesResult.rows.map((r) => r.sucursal_id);

      if (
        sucursalesIds.length > 0 &&
        !sucursalesIds.includes(registrationData.sucursalId)
      ) {
        throw new Error("El cupón no está disponible en esta sucursal");
      }

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const inicio = new Date(cupon.fecha_inicio);
      inicio.setHours(0, 0, 0, 0);
      const fin = new Date(cupon.fecha_fin);
      fin.setHours(23, 59, 59, 999);

      if (hoy < inicio) throw new Error("El cupón aún no está vigente");
      if (hoy > fin) throw new Error("El cupón ha expirado");
      if (cupon.usos_maximos > 0 && cupon.usos >= cupon.usos_maximos) {
        throw new Error("El cupón ha alcanzado su límite de usos");
      }

      await client.query(`SELECT id FROM cupones WHERE id = $1 FOR UPDATE`, [
        cupon.id,
      ]);

      cuponId = cupon.id;

      await client.query(
        `UPDATE cupones SET usos = usos + 1 WHERE id = $1`,
        [cuponId]
      );
    }

    // ============================================
    // 6. Fecha actual (La Paz)
    // ============================================
    const fechaActualResult = await client.query(
      `SELECT TIMEZONE('America/La_Paz', NOW()) as fecha_actual`
    );
    const fechaActual = fechaActualResult.rows[0].fecha_actual;

    // ============================================
    // 7. Crear inscripciones
    // ============================================
    const inscripcionesMap = {};
    const hoyYMDStr = hoyYMD();

    for (const accion of acciones) {
      const {
        servicio,
        personaId,
        accion: tipoAccion,
        reemplazaId,
        fechaInicio,
        fechaVencimiento,
      } = accion;

      if (tipoAccion === "reemplazo" && reemplazaId) {
        console.log(
          `🔄 Reemplazando inscripción anterior id=${reemplazaId} → estado_inscripcion='inactivo'`
        );
        const upd = await client.query(
          `UPDATE inscripciones SET estado_inscripcion = 'inactivo' WHERE id = $1 RETURNING id`,
          [reemplazaId]
        );
        console.log(`✅ Inscripción ${reemplazaId} inactivada:`, upd.rows);
      }

      const fechaInicioYMD = toYMD(fechaInicio);
      let estadoInscripcion = "activo";

      if (tipoAccion === "futuro") {
        estadoInscripcion = "inactivo";
      } else if (fechaInicioYMD > hoyYMDStr) {
        estadoInscripcion = "inactivo";
      }

      const ins = await client.query(
        `
        INSERT INTO inscripciones
          (persona_id, servicio_id, sucursal_id, fecha_inicio, fecha_vencimiento,
           ingresos_disponibles, estado, estado_inscripcion)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `,
        [
          personaId,
          servicio.servicioId,
          registrationData.sucursalId,
          fechaInicio,
          fechaVencimiento,
          servicio.numero_ingresos,
          ESTADO.inscripciones,
          estadoInscripcion,
        ]
      );

      console.log(
        `📝 Inscripción creada: id=${ins.rows[0].id}, persona=${personaId}, servicio=${servicio.servicioId}, estado_inscripcion=${estadoInscripcion}, inicio=${fechaInicio}, fin=${fechaVencimiento}`
      );

      if (personaId !== null) {
        inscripcionesMap[`${servicio.servicioId}:${personaId}`] =
          ins.rows[0].id;
      } else {
        inscripcionesMap[`${servicio.servicioId}:NULL`] = ins.rows[0].id;
      }

      if (
        servicio.multisucursal &&
        estadoInscripcion === "activo" &&
        personaId !== null
      ) {
        const otras = await client.query(
          `
          SELECT sucursal_id 
          FROM servicio_sucursal 
          WHERE servicio_id = $1 AND sucursal_id != $2 AND disponible = true
        `,
          [servicio.servicioId, registrationData.sucursalId]
        );

        for (const otra of otras.rows) {
          await client.query(
            `
            INSERT INTO inscripciones
              (persona_id, servicio_id, sucursal_id, fecha_inicio, fecha_vencimiento,
               ingresos_disponibles, estado, estado_inscripcion)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
            [
              personaId,
              servicio.servicioId,
              otra.sucursal_id,
              fechaInicio,
              fechaVencimiento,
              servicio.numero_ingresos,
              ESTADO.inscripciones,
              estadoInscripcion,
            ]
          );
        }
      }
    }

    // ============================================
    // 8. Detalle de pago
    // ============================================
    let detallePago = null;
    if (registrationData.formaPago === "efectivo") {
      detallePago = "Pago completo en efectivo";
    } else if (registrationData.formaPago === "qr") {
      detallePago = "Pago completo con QR";
    } else if (registrationData.formaPago === "mixto") {
      detallePago = `Efectivo: ${registrationData.montoEfectivo}, QR: ${registrationData.montoQr}`;
    }

    if (registrationData.pagoPlazos) {
      detallePago += ` | Pago en plazos - Entregado: ${registrationData.montoEntregado}, Pendiente: ${registrationData.montoPendiente}`;
    }

    // ============================================
    // 9. Subtotal
    // ============================================
    // ✅ FIX: el precio del servicio es por SERVICIO (ya incluye a todas
    //    las personas que requiera). NO se multiplica por la cantidad de
    //    personas asignadas.
    const subtotal = serviciosInfo.reduce((sum, s) => {
      return sum + Number(s.precio);
    }, 0);

    // ============================================
    // 10. Crear venta
    // ============================================
    const ventaPersonaId = personaIds.length > 0 ? personaIds[0] : null;

    const ventaResult = await client.query(
      `
      INSERT INTO ventas_servicios (
        persona_id, empleado_id, subtotal, descuento, descripcion_descuento, 
        total, forma_pago, detalle_pago, sucursal_id, caja_id, cupon_id, fecha
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TIMEZONE('America/La_Paz', NOW()))
      RETURNING id
    `,
      [
        ventaPersonaId,
        registrationData.empleadoId,
        subtotal,
        registrationData.descuento,
        registrationData.descripcionDescuento,
        registrationData.total,
        registrationData.formaPago,
        detallePago,
        registrationData.sucursalId,
        registrationData.cajaId,
        cuponId,
      ]
    );

    const ventaId = ventaResult.rows[0].id;

    // ============================================
    // 11. Detalles
    // ============================================
    // ✅ FIX: como el precio del servicio es un total grupal, dividimos
    //    el precio entre las inscripciones generadas para ese servicio
    //    para que la suma de los detalles coincida con el subtotal.
    const countByServicio = {};
    for (const accion of acciones) {
      const sid = accion.servicio.servicioId;
      countByServicio[sid] = (countByServicio[sid] || 0) + 1;
    }

    for (const accion of acciones) {
      const { servicio, personaId } = accion;
      const key =
        personaId !== null
          ? `${servicio.servicioId}:${personaId}`
          : `${servicio.servicioId}:NULL`;
      const inscripcionId = inscripcionesMap[key];
      if (!inscripcionId) continue;

      const totalAccionesServicio = countByServicio[servicio.servicioId] || 1;
      const precioPorDetalle = Number(servicio.precio) / totalAccionesServicio;

      await client.query(
        `
        INSERT INTO detalle_venta_servicios (venta_servicio_id, inscripcion_id, precio)
        VALUES ($1, $2, $3)
      `,
        [ventaId, inscripcionId, precioPorDetalle]
      );
    }

    // ============================================
    // 12. Pagos pendientes
    // ============================================
    const pagosPendientesIds = [];
    if (
      registrationData.pagoPlazos &&
      registrationData.montoPendiente > 0 &&
      personaIds.length > 0
    ) {
      // ✅ FIX: el total del pago pendiente se asigna al cliente principal
      //    (no se divide entre personas, porque el precio ya es del grupo).
      const pp = await client.query(
        `
        INSERT INTO pagos_pendientes (
          persona_id, venta_servicio_id, monto_total, monto_pagado, monto_pendiente,
          fecha_inscripcion, fecha_ultima_actualizacion, estado
        )
        VALUES ($1, $2, $3, $4, $5, $6, $6, 'pendiente')
        RETURNING id
      `,
        [
          personaIds[0],
          ventaId,
          registrationData.total,
          registrationData.montoEntregado,
          registrationData.montoPendiente,
          fechaActual,
        ]
      );
      pagosPendientesIds.push(pp.rows[0].id);
    }

    // ============================================
    // 13. Movimiento de caja (SOLO EFECTIVO)
    // ============================================
    const montoEfectivoCaja =
      registrationData.formaPago === "efectivo"
        ? Number(registrationData.total)
        : registrationData.formaPago === "mixto"
        ? Number(registrationData.montoEfectivo || 0)
        : 0;

    if (montoEfectivoCaja > 0) {
      const cajaResult = await client.query(
        `SELECT estado_caja, COALESCE(total, 0) as total_actual 
         FROM cajas 
         WHERE id = $1 
         FOR UPDATE`,
        [registrationData.cajaId]
      );

      if (cajaResult.rows.length === 0) {
        throw new Error("Caja no encontrada");
      }

      const cajaActual = cajaResult.rows[0];

      if (cajaActual.estado_caja !== "abierta") {
        throw new Error(
          "La caja no está abierta para realizar inscripciones"
        );
      }

      const montoAnterior = parseFloat(cajaActual.total_actual);
      const montoActual = montoAnterior + montoEfectivoCaja;

      const usuarioResult = await client.query(
        `SELECT id as usuario_id FROM usuarios WHERE empleado_id = $1`,
        [registrationData.empleadoId]
      );

      if (usuarioResult.rows.length === 0) {
        throw new Error(
          `No se encontró un usuario asociado al empleado ${registrationData.empleadoId}`
        );
      }

      const usuarioId = usuarioResult.rows[0].usuario_id;

      await client.query(
        `
        INSERT INTO movimientos_caja 
          (caja_id, usuario_id, monto, tipo, descripcion, monto_anterior, monto_actual,
           venta_servicio_id, fecha)
        VALUES ($1, $2, $3, 'ingreso', $4, $5, $6, $7, TIMEZONE('America/La_Paz', NOW()))
      `,
        [
          registrationData.cajaId,
          usuarioId,
          montoEfectivoCaja,
          "Ingreso por inscripción de servicios (Efectivo)",
          montoAnterior,
          montoActual,
          ventaId,
        ]
      );

      await client.query(`UPDATE cajas SET total = $1 WHERE id = $2`, [
        montoActual,
        registrationData.cajaId,
      ]);
    }

    await client.query("COMMIT");

    return {
      success: true,
      ventaId: ventaId,
      pagoPendienteIds: pagosPendientesIds,
      message: registrationData.pagoPlazos
        ? "Inscripción registrada correctamente con pago en plazos"
        : "Inscripción registrada correctamente",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Error in registerMember service:", error);
    console.error("❌ Detalles:", {
      message: error.message,
      code: error.code,
      detail: error.detail,
      where: error.where,
    });
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// PAGOS PENDIENTES
// ============================================
exports.getPagosPendientes = async (personaId) => {
  const result = await query(
    `
    SELECT 
      pp.id,
      pp.persona_id as "personaId",
      pp.venta_servicio_id as "ventaServicioId",
      pp.monto_total as "montoTotal",
      pp.monto_pagado as "montoPagado",
      pp.monto_pendiente as "montoPendiente",
      pp.fecha_inscripcion as "fechaInscripcion",
      pp.fecha_ultima_actualizacion as "fechaUltimaActualizacion",
      pp.estado
    FROM pagos_pendientes pp
    WHERE pp.persona_id = $1 AND pp.estado = 'pendiente'
    ORDER BY pp.fecha_inscripcion DESC
  `,
    [personaId]
  );

  return result.rows;
};

exports.updatePagoPendiente = async (pagoId, montoPagado) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const pagoActual = await client.query(
      `
      SELECT monto_pagado, monto_pendiente, monto_total
      FROM pagos_pendientes
      WHERE id = $1 AND estado = 'pendiente'
    `,
      [pagoId]
    );

    if (pagoActual.rows.length === 0) {
      throw new Error("Pago pendiente no encontrado");
    }

    const { monto_pagado, monto_pendiente } = pagoActual.rows[0];

    const nuevoMontoPagado = parseFloat(monto_pagado) + parseFloat(montoPagado);
    const nuevoMontoPendiente =
      parseFloat(monto_pendiente) - parseFloat(montoPagado);

    if (nuevoMontoPendiente < 0) {
      throw new Error("El monto pagado no puede ser mayor al monto pendiente");
    }

    const fechaActualResult = await client.query(
      `SELECT TIMEZONE('America/La_Paz', NOW()) as fecha_actual`
    );
    const fechaActual = fechaActualResult.rows[0].fecha_actual;

    await client.query(
      `
      UPDATE pagos_pendientes 
      SET 
        monto_pagado = $1,
        monto_pendiente = $2,
        fecha_ultima_actualizacion = $3,
        estado = CASE WHEN $2 = 0 THEN 'completado' ELSE 'pendiente' END
      WHERE id = $4
    `,
      [nuevoMontoPagado, nuevoMontoPendiente, fechaActual, pagoId]
    );

    await client.query("COMMIT");

    return {
      success: true,
      message:
        nuevoMontoPendiente === 0
          ? "Pago completado exitosamente"
          : "Pago actualizado exitosamente",
    };
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating pending payment:", error);
    throw error;
  } finally {
    client.release();
  }
};

// ============================================
// VERIFICAR SI UNA PERSONA TIENE HUELLA
// ============================================
exports.hasFingerprint = async (personaId) => {
  const result = await query(
    `SELECT huella_digital IS NOT NULL AS has_fingerprint
     FROM personas
     WHERE id = $1 AND estado = $2`,
    [personaId, ESTADO.personas]
  );

  if (result.rows.length === 0) {
    return { hasFingerprint: false, exists: false };
  }

  return {
    hasFingerprint: result.rows[0].has_fingerprint === true,
    exists: true,
  };
};

// ============================================
// CREAR PERSONA RÁPIDAMENTE (sin inscripción)
// ============================================
exports.createPersonQuick = async (personData) => {
  const { nombres, apellidos, ci, telefono, fechaNacimiento } = personData;

  if (!nombres || !apellidos || !ci) {
    throw new Error("Nombres, apellidos y CI son obligatorios");
  }

  const existing = await query(
    `SELECT id, nombres, apellidos, ci, telefono, fecha_nacimiento
     FROM personas
     WHERE ci = $1 AND estado = $2`,
    [ci, ESTADO.personas]
  );

  if (existing.rows.length > 0) {
    return {
      alreadyExists: true,
      persona: existing.rows[0],
    };
  }

  const fechaNac = fechaNacimiento ? toYMD(fechaNacimiento) : null;

  const result = await query(
    `INSERT INTO personas (nombres, apellidos, ci, telefono, fecha_nacimiento, estado)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, nombres, apellidos, ci, telefono, fecha_nacimiento`,
    [nombres, apellidos, ci, telefono || null, fechaNac, ESTADO.personas]
  );

  return {
    alreadyExists: false,
    persona: result.rows[0],
  };
};